import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function walk(directory) {
  const entries = await readdir(path.join(projectRoot, directory), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(relativePath)));
    else files.push(relativePath);
  }
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exportedFunction(source, name) {
  const marker = `export const ${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `Missing exported server function: ${name}`);
  const next = source.indexOf("export const ", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

const runtimeEnv = await read("src/lib/public-runtime-env.ts");
const gateway = await read("src/routes/api/supabase/$.ts");
const browserClient = await read("src/integrations/supabase/client.ts");
const authMiddleware = await read(
  "src/integrations/supabase/auth-middleware.ts",
);
const verifiedIdentity = await read("src/lib/verified-identity.server.ts");
const accountFunctions = await read("src/lib/account.functions.ts");
const securityMigration = await read(
  "supabase/migrations/20260902120000_server_api_security_boundary.sql",
);
const consultationsMigration = await read(
  "supabase/migrations/20260904120000_add_consultation_forms.sql",
);
const dataRightsHealthMigration = await read(
  "supabase/migrations/20260908210000_complete_data_rights_health_records.sql",
);
const dataRightsFunctions = await read(
  "src/lib/customer-data-requests.functions.ts",
);
const customerMutationMigration = await read(
  "supabase/migrations/20260908150000_harden_customer_mutations.sql",
);
const notificationMigration = await read(
  "supabase/migrations/20260908121000_add_notification_delivery.sql",
);
const supportMigration = await read(
  "supabase/migrations/20260908220000_add_support_ticket_workflow.sql",
);
const supportFunctions = await read("src/lib/support.functions.ts");
const emailProvider = await read("src/lib/resend.server.ts");
const emailWebhook = await read("src/routes/api.resend-webhook.ts");
const smsProvider = await read("src/lib/sms.server.ts");
const smsWebhook = await read("src/routes/api.twilio-sms-webhook.ts");
const devSeed = await read("src/lib/dev-seed.functions.ts");
const calendarConnect = await read(
  "src/routes/api/calendar/$provider/connect.ts",
);
const calendarCallback = await read(
  "src/routes/api/calendar/$provider/callback.ts",
);
const confirmationRoute = await read(
  "src/routes/api/bookings/send-confirmation.ts",
);
const clientErrorRoute = await read("src/routes/api/client-errors.ts");
const waitlistRoute = await read("src/routes/api/waitlist.ts");
const publicStaffRoute = await read("src/routes/api/public-booking-staff.ts");
const publicGalleryRoute = await read("src/routes/api/public-gallery.ts");
const publicReviewsRoute = await read("src/routes/api/public-reviews.ts");
const bookingActionRoute = await read("src/routes/api/booking-actions/act.ts");
const reschedulePeekRoute = await read(
  "src/routes/api/booking-actions/reschedule-peek.ts",
);
const rescheduleCommitRoute = await read(
  "src/routes/api/booking-actions/reschedule-commit.ts",
);
const reviewPeekRoute = await read("src/routes/api/reviews/peek.ts");
const reviewSubmitRoute = await read("src/routes/api/reviews/submit.ts");
const internalAuth = await read("src/lib/internal-auth.server.ts");
const calendarSyncRoute = await read(
  "src/routes/api/internal/calendar-sync.ts",
);
const monitoringRoute = await read(
  "src/routes/api/monitoring/client-errors.ts",
);
const reminderRoute = await read("src/routes/api/cron/send-reminders.ts");
const marketingUnsubscribeRoute = await read(
  "src/routes/api.marketing-unsubscribe.$token.ts",
);
const appointmentWaitlistRoute = await read(
  "src/routes/api/appointment-waitlist.ts",
);
const professionalIdentityMigration = await read(
  "supabase/migrations/20260927006000_lock_professional_link_identity.sql",
);
const staffArchiveMigration = await read(
  "supabase/migrations/20260927007000_archive_staff_and_revoke_access.sql",
);
const publicImagePathMigration = await read(
  "supabase/migrations/20260927008000_bind_public_image_paths_to_folders.sql",
);
const bannedSessionMigration = await read(
  "supabase/migrations/20260927009000_block_banned_sessions_at_database.sql",
);
const narrowPortalMigration = await read(
  "supabase/migrations/20260927010000_narrow_portal_and_shared_calendar_access.sql",
);
const staticHeaders = await read(".output/public/_headers");

assert(
  runtimeEnv.includes("${window.location.origin}/api/supabase"),
  "The browser Supabase client must use Bookzenvo's same-origin gateway.",
);
assert(
  runtimeEnv.includes("sb_publishable_browser_proxy"),
  "The browser must use the non-secret gateway marker instead of a real Supabase key.",
);
assert(
  gateway.includes('headers.set("apikey", publishableKey)'),
  "The server gateway must replace the browser marker with the server-side key.",
);
assert(
  gateway.includes("PROTECTED_REST_FIELDS") &&
    gateway.includes('resource === "payments"') &&
    gateway.includes('resource === "businesses"') &&
    gateway.includes('method === "DELETE"'),
  "The server gateway must reject direct sensitive writes before they reach Supabase.",
);
assert(
  gateway.includes('"email_suppressed"') &&
    gateway.includes('"sms_suppressed"') &&
    /rejectUnsafeRestWrite\([\s\S]*decodedPath/.test(gateway) &&
    /new URL\(`\/\$\{decodedPath\}/.test(gateway),
  "The gateway must protect suppression switches after canonicalising encoded REST paths.",
);
assert(
  /storageKey:\s*["']bookzenvo-auth["']/.test(browserClient),
  "The browser auth session must use the stable Bookzenvo storage key.",
);
assert(
  authMiddleware.includes("requireVerifiedIdentity(supabase, token)") &&
    verifiedIdentity.includes("client.auth.getUser(token)") &&
    verifiedIdentity.includes("client.auth.getClaims(token)") &&
    verifiedIdentity.includes("!user.email_confirmed_at") &&
    verifiedIdentity.includes('data.claims.aal !== "aal2"'),
  "Authenticated server functions must validate the current account, email and MFA state instead of trusting JWT claims alone.",
);
assert(
  exportedFunction(accountFunctions, "deleteMyAccount").includes(
    "requireRecentSensitiveSession",
  ) &&
    exportedFunction(accountFunctions, "exportMyWorkspace").includes(
      "requireRecentSensitiveSession",
    ) &&
    exportedFunction(
      dataRightsFunctions,
      "generateCustomerDataExport",
    ).includes("requireRecentSensitiveSession") &&
    exportedFunction(dataRightsFunctions, "eraseCustomer").includes(
      "requireRecentSensitiveSession",
    ),
  "Account closure, workspace/customer exports and customer erasure must require a recent AAL2 session.",
);
assert(
  securityMigration.includes("protect_business_system_fields"),
  "The protected business-field trigger is missing.",
);
assert(
  securityMigration.includes("protect_booking_payment_provider_fields") &&
    securityMigration.includes("protect_customer_payment_provider_fields"),
  "Booking/customer payment-provider fields must be protected from browser writes.",
);
assert(
  securityMigration.includes(
    "REVOKE ALL PRIVILEGES ON TABLE public.payments FROM anon, authenticated",
  ),
  "Browser roles must not be able to alter the verified payment ledger directly.",
);
assert(
  consultationsMigration.includes("protect_signed_consultation_evidence") &&
    consultationsMigration.includes(
      "Signed consultation evidence is immutable",
    ),
  "Signed salon consultation evidence must be protected from later edits.",
);
assert(
  consultationsMigration.includes(
    "revoke all on public.consultation_submissions from anon, authenticated",
  ) &&
    !consultationsMigration.includes(
      "grant select on public.consultation_submissions to authenticated",
    ),
  "Salon health-data records must remain accessible only through the server API.",
);
assert(
  dataRightsHealthMigration.includes("delete from consultation_submissions") &&
    dataRightsHealthMigration.includes("consultations_deleted") &&
    dataRightsHealthMigration.includes("due_at"),
  "Erasure must delete consultation health records and rights requests must carry a deadline.",
);
assert(
  dataRightsFunctions.includes('.from("consultation_submissions")') &&
    dataRightsFunctions.includes("signature_data") &&
    dataRightsFunctions.includes("consultations:"),
  "Customer access exports must include consultation answers and signature evidence.",
);
assert(
  customerMutationMigration.includes("guard_customer_booking_updates") &&
    customerMutationMigration.includes("Customers can only cancel a booking") &&
    customerMutationMigration.includes("guard_customer_profile_updates") &&
    customerMutationMigration.includes("bookzenvo.customer_reschedule"),
  "Customer portal updates must be restricted to the validated cancellation, reschedule, and profile fields.",
);
assert(
  notificationMigration.includes(
    "revoke all on public.notification_preferences from anon, authenticated",
  ) &&
    notificationMigration.includes(
      "revoke all on public.notification_deliveries from anon, authenticated",
    ),
  "Notification preferences and delivery metadata must only be accessible through the server API.",
);
assert(
  supportMigration.includes(
    "revoke all on public.support_tickets from anon, authenticated",
  ) &&
    supportMigration.includes(
      "revoke all on public.support_ticket_events from anon, authenticated",
    ),
  "Support tickets and their history must not be exposed as browser-readable tables.",
);
assert(
  supportFunctions.includes('.eq("requester_id", context.userId)') &&
    supportFunctions.includes('.eq("visible_to_requester", true)') &&
    supportFunctions.includes('ticket.status === "closed"'),
  "The support API must scope tickets to the authenticated requester and hide internal notes.",
);
assert(
  emailProvider.includes('"Idempotency-Key": idempotencyKey') &&
    emailProvider.includes('status: "queued"') &&
    emailProvider.includes('status: "sent"'),
  "Outbound email must be recorded and submitted with a stable provider idempotency key.",
);
assert(
  emailWebhook.includes("validStandardWebhook") &&
    emailWebhook.includes("status: state"),
  "Provider delivery events must be signature-verified before delivery state is updated.",
);
assert(
  smsProvider.includes('process.env.APP_ENV !== "production"') &&
    smsProvider.includes('select("sms_suppressed")') &&
    smsProvider.includes("isBusinessSmsSuppressed") &&
    smsProvider.includes('channel: "sms"') &&
    !smsProvider.includes("VITE_TWILIO"),
  "SMS must remain server-only, logged, and suppressed outside production.",
);
assert(
  smsWebhook.includes("validTwilioSignature") &&
    smsWebhook.includes('rpc("record_notification_provider_status"') &&
    smsWebhook.includes("p_provider_id: messageId") &&
    smsWebhook.includes(
      'form.get("AccountSid") !== process.env.TWILIO_ACCOUNT_SID',
    ),
  "Twilio delivery callbacks must be authenticated before updating delivery state.",
);
assert(
  devSeed.includes('process.env.DEV_SEED_ENABLED !== "true"') &&
    devSeed.includes('process.env.APP_ENV === "production"') &&
    !devSeed.includes("DEMO_PASSWORD") &&
    !devSeed.includes("updateUserById") &&
    devSeed.includes("randomDemoPassword()"),
  "The development seeder must require an explicit local gate and must not contain or reset a reusable password.",
);
assert(
  calendarConnect.includes("trustedAppOrigin()") &&
    !calendarConnect.includes("new URL(request.url).origin") &&
    calendarCallback.includes("const appOrigin = trustedAppOrigin()") &&
    calendarCallback.includes("callbackUrl(provider, appOrigin)") &&
    !calendarCallback.includes("process.env.APP_URL || url.origin"),
  "Calendar OAuth redirects must use the configured trusted application origin, never the incoming Host header.",
);
assert(
  confirmationRoute.includes('consumePublicRequest("confirmation"') &&
    confirmationRoute.includes("UUID_PATTERN") &&
    clientErrorRoute.includes('consumePublicRequest("telemetry"') &&
    waitlistRoute.includes("trustedAppOrigin()") &&
    !waitlistRoute.includes("new URL(request.url).origin"),
  "Public confirmation, telemetry and waitlist endpoints must be source-limited and use the trusted application origin.",
);
assert(
  [publicStaffRoute, publicGalleryRoute, publicReviewsRoute].every((route) =>
    route.includes('consumePublicRequest("public_read"'),
  ) &&
    [
      bookingActionRoute,
      reschedulePeekRoute,
      rescheduleCommitRoute,
      reviewPeekRoute,
      reviewSubmitRoute,
    ].every((route) => route.includes('consumePublicRequest("token"')),
  "Anonymous public-data and one-time-link endpoints must have privacy-preserving source quotas.",
);
assert(
  publicStaffRoute.includes(
    'isTenantAssetPathInFolder(safeValue, businessId, "staff")',
  ) &&
    publicGalleryRoute.includes(
      'isTenantAssetPathInFolder(row.path, businessId, "gallery")',
    ),
  "Public image signers must restrict private paths to their tenant and feature folder.",
);
assert(
  internalAuth.includes("timingSafeTextEqual") &&
    [calendarSyncRoute, monitoringRoute, reminderRoute].every((route) =>
      route.includes("hasExpectedBearer"),
    ) &&
    !calendarSyncRoute.includes("!== `Bearer ${expected}`") &&
    !monitoringRoute.includes("supplied === `Bearer ${secret}`"),
  "Internal bearer secrets must use the shared timing-resistant comparison.",
);
assert(
  monitoringRoute.includes("stalledErasureStorageJobs") &&
    monitoringRoute.includes('.eq("status", "pending")') &&
    monitoringRoute.includes("ERASURE_STORAGE_JOB_MAX_AGE_MS") &&
    monitoringRoute.includes("!stalledErasureStorageJobCount"),
  "Production monitoring must alert on customer-photo erasure jobs that remain pending too long.",
);
assert(
  marketingUnsubscribeRoute.includes("GET: async") &&
    marketingUnsubscribeRoute.includes("POST: async") &&
    marketingUnsubscribeRoute.includes('consumePublicRequest("token"') &&
    marketingUnsubscribeRoute.includes("trustedAppOrigin()") &&
    !marketingUnsubscribeRoute.includes(
      "GET: async ({ params }) => {\n        try {\n          const changed",
    ),
  "Email link scanners must not unsubscribe customers with an unauthenticated GET request.",
);
assert(
  appointmentWaitlistRoute.includes("trustedAppOrigin()") &&
    !appointmentWaitlistRoute.includes("new URL(request.url).origin"),
  "Appointment-waitlist submissions must validate against the configured application origin, never a caller-controlled Host header.",
);
assert(
  professionalIdentityMigration.includes(
    "revoke insert on table public.salon_professionals from authenticated",
  ) &&
    professionalIdentityMigration.includes(
      "Professional link business identities are immutable",
    ),
  "Professional links must only be created through email-bound invitations and must not be retargetable.",
);
assert(
  staffArchiveMigration.includes("update public.staff_memberships") &&
    staffArchiveMigration.includes("set active = false") &&
    staffArchiveMigration.includes("update public.staff_account_invitations") &&
    staffArchiveMigration.includes("set revoked_at = now()"),
  "Archiving staff must revoke memberships and pending invitations in the same database transaction.",
);
assert(
  publicImagePathMigration.includes("business_media_path_business_gallery") &&
    publicImagePathMigration.includes(
      "staff_photo_url_business_staff_folder",
    ) &&
    publicImagePathMigration.includes("position('..' in path) = 0") &&
    publicImagePathMigration.includes("position(chr(92) in photo_url) = 0"),
  "Database rows used by public image signers must stay inside the tenant's gallery or staff folder.",
);
assert(
  bannedSessionMigration.includes("from auth.users u") &&
    bannedSessionMigration.includes("u.deleted_at is null") &&
    bannedSessionMigration.includes(
      "u.banned_until is null or u.banned_until <= now()",
    ),
  "Database access must reject deleted or currently banned accounts even when an old JWT remains valid.",
);
assert(
  narrowPortalMigration.includes("get_portal_bookings()") &&
    narrowPortalMigration.includes("jsonb_build_object('id',biz.id") &&
    narrowPortalMigration.includes(
      "perform public.check_request_assurance()",
    ) &&
    !narrowPortalMigration.includes(
      'create policy "authenticated read permitted bookings"\n  on public.bookings for select to authenticated\n  using (\n    public.is_current_customer',
    ),
  "Customer portal access must use narrow RPC projections instead of exposing complete booking and customer rows.",
);

assert(
  staticHeaders.includes("/*") &&
    staticHeaders.includes("Strict-Transport-Security: max-age=31536000") &&
    staticHeaders.includes("X-Content-Type-Options: nosniff") &&
    staticHeaders.includes("Content-Security-Policy: default-src 'self'") &&
    staticHeaders.includes("/deployment.json") &&
    staticHeaders.includes("Cache-Control: no-store"),
  "Cloudflare static responses must keep the browser-security baseline and an uncached deployment marker.",
);

const sourceFiles = (await walk("src")).filter((file) =>
  /\.(?:ts|tsx|js|jsx)$/.test(file),
);
for (const file of sourceFiles) {
  const contents = await read(file);
  if (file !== path.join("src", "lib", "public-runtime-env.ts")) {
    assert(
      !contents.includes("VITE_SUPABASE_URL") &&
        !contents.includes("VITE_SUPABASE_PUBLISHABLE_KEY"),
      `${file} reads a public Supabase environment variable outside the server-aware runtime boundary.`,
    );
  }
}

const migrationFiles = (await walk("supabase/migrations")).filter((file) =>
  file.endsWith(".sql"),
);
const migrations = (await Promise.all(migrationFiles.map(read))).join("\n");
const createdPublicTables = new Set(
  [
    ...migrations.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi,
    ),
  ].map((match) => match[1].toLowerCase()),
);
const rlsTables = new Set(
  [
    ...migrations.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
    ),
  ].map((match) => match[1].toLowerCase()),
);
const missingRls = [...createdPublicTables].filter(
  (table) => !rlsTables.has(table),
);
assert(
  missingRls.length === 0,
  `Public tables missing Row Level Security: ${missingRls.join(", ")}`,
);

// When a production build exists, verify that the actual project identifier
// was not compiled into any browser asset. Generic supabase-js library strings
// (such as *.supabase.co validation) are harmless; the project ref is not.
try {
  const config = await read("supabase/config.toml");
  const projectRef = config.match(/^project_id\s*=\s*["']([^"']+)["']/m)?.[1];
  if (projectRef) {
    const publicBuildFiles = await walk(".output/public");
    for (const file of publicBuildFiles.filter((file) =>
      /\.(?:js|html|json)$/.test(file),
    )) {
      assert(
        !(await read(file)).includes(projectRef),
        `${file} exposes the real Supabase project identifier in a browser asset.`,
      );
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(
  `Security boundary verified: same-origin gateway, protected billing/payment fields, and RLS on ${createdPublicTables.size} public tables.`,
);
