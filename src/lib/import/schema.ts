// Canonical, source-agnostic field definitions for each import entity. Every
// booking system exports slightly different column names for the same data
// (a "client name" column might be "Full Name", "Client Name", "Customer" or
// just "Name" depending where it came from). This table maps our internal
// field keys to every header name we recognise automatically.
//
// Fresha's exact export headers are always included as an alias, so a Fresha
// file still needs zero manual mapping — this is additive, not a rewrite of
// the Fresha behaviour. The rest of the aliases are a best-effort guess at
// what other common systems (Square Appointments, Vagaro, Booksy, Acuity/
// Squarespace Scheduling, Timely, SimplyBook.me, Setmore, GlossGenius,
// Mindbody) tend to call the same column. When a file uses something we
// don't recognise, the column-mapping step in the import UI lets the owner
// point at the right column manually — the app never has to know every
// export format in advance for the import to work.
import type { ImportEntity } from "./fresha";

export type FieldSpec = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
};

export function normalizeHeaderKey(s: string): string {
  return s.trim().toLowerCase();
}

export const ENTITY_FIELDS: Record<ImportEntity, FieldSpec[]> = {
  staff: [
    {
      key: "fullName",
      label: "Full name",
      required: false,
      aliases: ["full name", "name", "staff name", "employee name", "team member"],
    },
    { key: "firstName", label: "First name", required: false, aliases: ["first name", "given name", "firstname"] },
    { key: "lastName", label: "Last name", required: false, aliases: ["last name", "surname", "family name", "lastname"] },
    { key: "email", label: "Email", required: false, aliases: ["email", "email address", "e-mail"] },
    {
      key: "phone",
      label: "Phone",
      required: false,
      aliases: ["phone number", "phone", "mobile number", "mobile", "cell", "cell phone"],
    },
    { key: "role", label: "Role / job title", required: false, aliases: ["job title", "role", "position", "title"] },
    { key: "status", label: "Status", required: false, aliases: ["status", "employee status", "active"] },
  ],
  customers: [
    {
      key: "externalId",
      label: "Client ID",
      required: false,
      aliases: ["client id", "customer id", "contact id", "id"],
    },
    {
      key: "fullName",
      label: "Full name",
      required: false,
      aliases: ["full name", "name", "client name", "customer name", "guest name"],
    },
    { key: "firstName", label: "First name", required: false, aliases: ["first name", "given name", "firstname"] },
    { key: "lastName", label: "Last name", required: false, aliases: ["last name", "surname", "family name", "lastname"] },
    { key: "email", label: "Email", required: false, aliases: ["email", "email address", "e-mail"] },
    {
      key: "phone",
      label: "Phone",
      required: false,
      aliases: ["mobile number", "mobile", "telephone", "phone", "phone number", "cell"],
    },
    { key: "notes", label: "Notes", required: false, aliases: ["note", "notes", "comments"] },
    {
      key: "referralSource",
      label: "Referral source",
      required: false,
      aliases: ["referral source", "referral", "how did you hear about us"],
    },
  ],
  services: [
    { key: "externalId", label: "Service ID", required: false, aliases: ["service id", "item id", "id"] },
    {
      key: "name",
      label: "Service name",
      required: true,
      aliases: ["service name", "name", "item name", "treatment", "treatment name"],
    },
    { key: "duration", label: "Duration", required: false, aliases: ["duration", "length", "time"] },
    { key: "price", label: "Price", required: false, aliases: ["retail price", "price", "cost", "rate"] },
    { key: "category", label: "Category", required: false, aliases: ["category name", "category", "type"] },
    { key: "description", label: "Description", required: false, aliases: ["description", "notes"] },
  ],
  bookings: [
    {
      key: "externalId",
      label: "Appointment ID",
      required: false,
      aliases: ["appt. ref.", "appointment id", "booking id", "ref", "reference"],
    },
    {
      key: "clientName",
      label: "Client name",
      required: true,
      aliases: ["client", "client name", "customer", "customer name", "guest"],
    },
    {
      key: "staffName",
      label: "Team member",
      required: true,
      aliases: ["team member", "staff", "employee", "provider"],
    },
    {
      key: "serviceName",
      label: "Service",
      required: true,
      aliases: ["service", "service name", "treatment", "treatment name"],
    },
    { key: "status", label: "Status", required: false, aliases: ["status"] },
    {
      key: "scheduledDate",
      label: "Date / start time",
      required: true,
      aliases: ["scheduled date", "date", "start date", "appointment date", "start time", "booked for"],
    },
    {
      key: "apptSlot",
      label: "Time slot (exact start–end)",
      required: false,
      aliases: ["appt. slot", "time slot", "slot"],
    },
    {
      key: "endDateTime",
      label: "End date / time",
      required: false,
      aliases: ["end time", "end date", "end datetime", "finish time"],
    },
    { key: "duration", label: "Duration (mins)", required: false, aliases: ["duration (mins)", "duration", "length"] },
    { key: "price", label: "Price", required: false, aliases: ["net sales", "price", "total", "amount"] },
    {
      key: "createdDate",
      label: "Created date",
      required: false,
      aliases: ["created date", "created", "created at", "booked on"],
    },
  ],
};
