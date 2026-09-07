import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConsultationQuestionType = "yes_no" | "text" | "long_text" | "date" | "select";

export type ConsultationQuestion = {
  id: string;
  label: string;
  type: ConsultationQuestionType;
  required: boolean;
  options?: string[];
};

export type ConsultationTemplateInput = {
  id?: string;
  name: string;
  description?: string | null;
  kind: "consultation" | "patch_test";
  questions: ConsultationQuestion[];
  consentText: string;
  validityDays: number;
  active: boolean;
  serviceIds: string[];
};

export type StartConsultationInput = {
  templateId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
};

const QUESTION_TYPES = new Set<ConsultationQuestionType>([
  "yes_no",
  "text",
  "long_text",
  "date",
  "select",
]);

function text(value: unknown, max: number, required = false) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (required && !clean) throw new Error("Complete all required fields.");
  if (clean.length > max) throw new Error(`A value is longer than ${max} characters.`);
  return clean;
}

function validUuid(value: string | undefined) {
  return !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitiseQuestions(value: unknown): ConsultationQuestion[] {
  if (!Array.isArray(value) || value.length > 40) throw new Error("A form can contain up to 40 questions.");
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const question = raw as Partial<ConsultationQuestion>;
    const id = text(question.id, 80, true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id)) throw new Error(`Question ${index + 1} has an invalid identifier.`);
    seen.add(id);
    const label = text(question.label, 300, true);
    if (!QUESTION_TYPES.has(question.type as ConsultationQuestionType)) throw new Error(`Question ${index + 1} has an invalid type.`);
    const options = question.type === "select"
      ? Array.from(new Set((question.options ?? []).map((option) => text(option, 120, true)))).slice(0, 20)
      : undefined;
    if (question.type === "select" && !options?.length) throw new Error(`Add an option to “${label}”.`);
    return { id, label, type: question.type, required: Boolean(question.required), ...(options ? { options } : {}) } as ConsultationQuestion;
  });
}

async function ownedBusiness(context: any) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only the business owner can manage consultation forms.");
  return data as { id: string; name: string };
}

export const getConsultationWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    await db
      .from("consultation_submissions")
      .update({ status: "expired" })
      .eq("business_id", business.id)
      .eq("status", "signed")
      .lt("expires_at", new Date().toISOString());
    const [templatesResult, servicesResult, submissionsResult] = await Promise.all([
      db
        .from("consultation_templates")
        .select("id, name, description, kind, questions, consent_text, validity_days, version, active, created_at, consultation_template_services(service_id)")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),
      db
        .from("services")
        .select("id, name, category, archived_at")
        .eq("business_id", business.id)
        .is("archived_at", null)
        .order("name"),
      db
        .from("consultation_submissions")
        .select("id, status, signed_at, expires_at, withdrawn_at, signer_name, signature_data, evidence_hash, patch_test_outcome, patch_tested_at, patch_tested_by, staff_notes, created_at, customer_id, booking_id, template_id, template_snapshot, answers, customers(name, email), bookings(starts_at, services(name)), consultation_templates(id, name, description, kind, questions, consent_text, validity_days, version)")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(250),
    ]);
    if (templatesResult.error) throw templatesResult.error;
    if (servicesResult.error) throw servicesResult.error;
    if (submissionsResult.error) throw submissionsResult.error;
    return {
      business,
      templates: templatesResult.data ?? [],
      services: servicesResult.data ?? [],
      submissions: submissionsResult.data ?? [],
    };
  });

export const startConsultationSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: StartConsultationInput) => {
    if (!validUuid(data.templateId) || !data.templateId) throw new Error("Choose a consultation form.");
    const customerName = text(data.customerName, 150, true);
    const customerEmail = text(data.customerEmail, 254).toLowerCase() || null;
    const customerPhone = text(data.customerPhone, 50) || null;
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Enter a valid email address or leave it blank.");
    return { templateId: data.templateId, customerName, customerEmail, customerPhone };
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: template, error: templateError } = await db
      .from("consultation_templates")
      .select("id")
      .eq("id", data.templateId)
      .eq("business_id", business.id)
      .eq("active", true)
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template) throw new Error("That consultation form is not available.");

    let customer: { id: string } | null = null;
    if (data.customerEmail) {
      const { data: matches, error } = await db.from("customers").select("id").eq("business_id", business.id).ilike("email", data.customerEmail).limit(1);
      if (error) throw error;
      customer = matches?.[0] ?? null;
    }
    if (!customer && data.customerPhone) {
      const { data: matches, error } = await db.from("customers").select("id").eq("business_id", business.id).eq("phone", data.customerPhone).limit(1);
      if (error) throw error;
      customer = matches?.[0] ?? null;
    }
    if (!customer) {
      const { data: created, error } = await db
        .from("customers")
        .insert({ business_id: business.id, name: data.customerName, email: data.customerEmail, phone: data.customerPhone })
        .select("id")
        .single();
      if (error) throw error;
      customer = created;
    }

    const { data: existing, error: existingError } = await db
      .from("consultation_submissions")
      .select("id")
      .eq("business_id", business.id)
      .eq("template_id", data.templateId)
      .eq("customer_id", customer.id)
      .is("booking_id", null)
      .eq("status", "pending")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { id: existing.id };

    const { data: submission, error: submissionError } = await db
      .from("consultation_submissions")
      .insert({ business_id: business.id, template_id: data.templateId, booking_id: null, customer_id: customer.id, status: "pending" })
      .select("id")
      .single();
    if (submissionError) throw submissionError;
    const { error: auditError } = await db.from("consultation_audit_events").insert({ submission_id: submission.id, business_id: business.id, actor_user_id: context.userId, action: "requested", metadata: { reason: "started_in_salon" } });
    if (auditError) {
      await db.from("consultation_submissions").delete().eq("id", submission.id).eq("business_id", business.id);
      throw auditError;
    }
    return { id: submission.id };
  });

export const getBookingConsultationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { bookingId: string }) => {
    if (!validUuid(data.bookingId) || !data.bookingId) throw new Error("That booking could not be found.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("consultation_submissions")
      .select("id, template_id, status, signed_at, expires_at, patch_test_outcome, created_at, consultation_templates(name, kind), template_snapshot")
      .eq("booking_id", data.bookingId)
      .eq("business_id", business.id)
      .order("created_at");
    if (error) throw error;
    return rows ?? [];
  });

export const getCustomerConsultationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { customerId: string }) => {
    if (!validUuid(data.customerId) || !data.customerId) throw new Error("That customer could not be found.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("consultation_submissions")
      .select("id, status, signed_at, expires_at, patch_test_outcome, consultation_templates(name, kind), template_snapshot")
      .eq("customer_id", data.customerId)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return rows ?? [];
  });

export const saveConsultationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: ConsultationTemplateInput) => {
    if (!validUuid(data.id)) throw new Error("That form could not be found.");
    const name = text(data.name, 120, true);
    const description = text(data.description, 1000) || null;
    const consentText = text(data.consentText, 4000, true);
    if (consentText.length < 20) throw new Error("The explicit consent statement needs more detail.");
    const validityDays = Math.round(Number(data.validityDays));
    if (validityDays < 1 || validityDays > 3650) throw new Error("Choose a validity period between 1 and 3,650 days.");
    if (!new Set(["consultation", "patch_test"]).has(data.kind)) throw new Error("Choose a valid form type.");
    const serviceIds = Array.from(new Set(data.serviceIds ?? []));
    if (serviceIds.some((id) => !validUuid(id))) throw new Error("A selected service is invalid.");
    return { ...data, name, description, consentText, validityDays, serviceIds, questions: sanitiseQuestions(data.questions) };
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    if (data.serviceIds.length) {
      const { data: ownedServices, error } = await db
        .from("services")
        .select("id")
        .eq("business_id", business.id)
        .in("id", data.serviceIds);
      if (error) throw error;
      if ((ownedServices ?? []).length !== data.serviceIds.length) throw new Error("One of those services does not belong to this salon.");
    }

    const payload = {
      business_id: business.id,
      name: data.name,
      description: data.description,
      kind: data.kind,
      questions: data.questions,
      consent_text: data.consentText,
      validity_days: data.validityDays,
      active: data.active,
    };
    let templateId = data.id;
    if (templateId) {
      const { data: current, error: currentError } = await db
        .from("consultation_templates")
        .select("id, version")
        .eq("id", templateId)
        .eq("business_id", business.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw new Error("That form could not be found.");
      const { error } = await db
        .from("consultation_templates")
        .update({ ...payload, version: current.version + 1 })
        .eq("id", templateId)
        .eq("business_id", business.id);
      if (error) throw error;
    } else {
      const { data: created, error } = await db
        .from("consultation_templates")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      templateId = created.id;
    }

    const { error: clearError } = await db
      .from("consultation_template_services")
      .delete()
      .eq("template_id", templateId)
      .eq("business_id", business.id);
    if (clearError) throw clearError;
    if (data.serviceIds.length) {
      const { error: linkError } = await db.from("consultation_template_services").insert(
        data.serviceIds.map((serviceId) => ({ template_id: templateId, service_id: serviceId, business_id: business.id })),
      );
      if (linkError) throw linkError;
    }
    return { id: templateId };
  });

export const deleteConsultationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => {
    if (!validUuid(data.id) || !data.id) throw new Error("That form could not be found.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error: pendingError } = await admin
      .from("consultation_submissions")
      .delete()
      .eq("template_id", data.id)
      .eq("business_id", business.id)
      .eq("status", "pending");
    if (pendingError) throw pendingError;
    const { error } = await admin
      .from("consultation_templates")
      .delete()
      .eq("id", data.id)
      .eq("business_id", business.id);
    if (error) throw error;
    return { deleted: true };
  });

export const signConsultationSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; answers: Record<string, unknown>; signerName: string; signatureData: string; explicitHealthConsent: boolean }) => {
    if (!validUuid(data.id) || !data.id) throw new Error("That form could not be found.");
    const signerName = text(data.signerName, 150, true);
    if (!data.explicitHealthConsent) throw new Error("Explicit consent is required before this form can be signed.");
    if (typeof data.signatureData !== "string" || !data.signatureData.startsWith("data:image/png;base64,") || data.signatureData.length > 180000) {
      throw new Error("Please add a valid signature.");
    }
    if (!data.answers || typeof data.answers !== "object" || Array.isArray(data.answers)) throw new Error("The form answers are invalid.");
    return { ...data, signerName };
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: submission, error } = await admin
      .from("consultation_submissions")
      .select("id, status, business_id, customer_id, booking_id, patch_test_outcome, patch_tested_at, patch_tested_by, staff_notes, consultation_templates(id, name, description, kind, questions, consent_text, validity_days, version)")
      .eq("id", data.id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (error) throw error;
    if (!submission) throw new Error("That form could not be found.");
    if (submission.status !== "pending") throw new Error("This form has already been completed.");
    const template = Array.isArray(submission.consultation_templates)
      ? submission.consultation_templates[0]
      : submission.consultation_templates;
    if (!template) throw new Error("This form is no longer available. Contact the salon.");
    if (template.kind === "patch_test" && (!submission.patch_test_outcome || !submission.patch_tested_at || !submission.patch_tested_by)) {
      throw new Error("Record the completed patch-test details before the client signs.");
    }
    const questions = sanitiseQuestions(template.questions);
    const answers: Record<string, string | boolean> = {};
    for (const question of questions) {
      const raw = data.answers[question.id];
      const answer = typeof raw === "boolean" ? raw : text(raw, 2000);
      if (question.required && (answer === "" || answer === undefined || answer === null)) {
        throw new Error(`Please answer “${question.label}”.`);
      }
      if (question.type === "yes_no" && typeof answer !== "boolean") throw new Error(`Choose yes or no for “${question.label}”.`);
      if (question.type === "select" && answer && !question.options?.includes(String(answer))) throw new Error(`Choose a valid answer for “${question.label}”.`);
      answers[question.id] = answer as string | boolean;
    }
    const signedAt = new Date();
    const snapshot = {
      id: template.id,
      name: template.name,
      description: template.description,
      kind: template.kind,
      questions,
      consent_text: template.consent_text,
      version: template.version,
    };
    const expiresAt = new Date(signedAt.getTime() + template.validity_days * 86400000);
    const evidence = JSON.stringify({
      submissionId: submission.id,
      businessId: submission.business_id,
      customerId: submission.customer_id,
      bookingId: submission.booking_id,
      snapshot,
      answers,
      signerName: data.signerName,
      signatureData: data.signatureData,
      patchTestOutcome: submission.patch_test_outcome,
      patchTestedAt: submission.patch_tested_at,
      patchTestedBy: submission.patch_tested_by,
      staffNotes: submission.staff_notes,
      signedAt: signedAt.toISOString(),
      explicitHealthConsent: true,
    });
    const evidenceHash = createHash("sha256").update(evidence).digest("hex");
    const { data: updated, error: updateError } = await admin.rpc("sign_consultation_submission_server", {
      p_submission_id: submission.id,
      p_template_version: template.version,
      p_template_snapshot: snapshot,
      p_answers: answers,
      p_signer_name: data.signerName,
      p_signature_data: data.signatureData,
      p_signed_at: signedAt.toISOString(),
      p_expires_at: expiresAt.toISOString(),
      p_evidence_hash: evidenceHash,
      p_actor_user_id: context.userId,
    });
    if (updateError) throw updateError;
    if (!updated) throw new Error("This form was updated elsewhere. Refresh and try again.");
    return { signed: true, expiresAt: expiresAt.toISOString() };
  });

export const withdrawConsultationConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; reason?: string }) => ({
    id: data.id,
    reason: text(data.reason, 500) || null,
  }))
  .handler(async ({ data, context }) => {
    if (!validUuid(data.id) || !data.id) throw new Error("That form could not be found.");
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: submission } = await admin
      .from("consultation_submissions")
      .select("id, business_id, customer_id, status")
      .eq("id", data.id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!submission) throw new Error("That form could not be found.");
    if (submission.status !== "signed") throw new Error("Only a current signed form can be withdrawn.");
    const withdrawnAt = new Date().toISOString();
    const { data: withdrawn, error } = await admin.rpc("withdraw_consultation_submission_server", {
      p_submission_id: submission.id,
      p_reason: data.reason,
      p_withdrawn_at: withdrawnAt,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    if (!withdrawn) throw new Error("This form was updated elsewhere. Refresh and try again.");
    return { withdrawn: true };
  });

export const recordPatchTestOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; outcome: "passed" | "failed" | "retest_required"; testedAt: string; testedBy: string; notes?: string }) => {
    if (!validUuid(data.id) || !data.id) throw new Error("That record could not be found.");
    if (!new Set(["passed", "failed", "retest_required"]).has(data.outcome)) throw new Error("Choose a valid patch-test result.");
    const testedAt = new Date(data.testedAt);
    if (Number.isNaN(testedAt.getTime()) || testedAt.getTime() > Date.now() + 300000) throw new Error("Choose a valid test date.");
    return {
      ...data,
      testedAt: testedAt.toISOString(),
      testedBy: text(data.testedBy, 150, true),
      notes: text(data.notes, 2000) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: record, error: recordError } = await admin
      .from("consultation_submissions")
      .select("id, status, template_snapshot, consultation_templates(kind)")
      .eq("id", data.id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (recordError) throw recordError;
    if (!record) throw new Error("That patch-test record could not be found.");
    const template = Array.isArray(record.consultation_templates) ? record.consultation_templates[0] : record.consultation_templates;
    if ((record.template_snapshot?.kind ?? template?.kind) !== "patch_test") throw new Error("This is not a patch-test record.");
    if (record.status !== "pending") throw new Error("This patch-test result was locked when the client signed.");
    const { data: updated, error } = await admin.rpc("record_patch_test_result_server", {
      p_submission_id: data.id,
      p_outcome: data.outcome,
      p_tested_at: data.testedAt,
      p_tested_by: data.testedBy,
      p_notes: data.notes,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    if (!updated) throw new Error("That patch-test record could not be found.");
    return { saved: true };
  });
