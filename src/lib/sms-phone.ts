/** Twilio expects E.164. Accept the usual UK mobile format on booking forms,
 * but never guess a country for any other national-format number. */
export function normalizeSmsPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const international = /^07\d{9}$/.test(compact) ? `+44${compact.slice(1)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}
