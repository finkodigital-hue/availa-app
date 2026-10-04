import { useEffect, useState, type FormEvent } from "react";

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BookingOpeningRequest({
  businessId,
  serviceId,
  serviceName,
  staffId,
  staffName,
  selectedDate,
}: {
  businessId: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  selectedDate: Date;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => dateValue(selectedDate));
  const [through, setThrough] = useState(() => dateValue(selectedDate));
  const [preferredTime, setPreferredTime] = useState("any");
  const [anyStaff, setAnyStaff] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [automaticAlerts, setAutomaticAlerts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const lastAllowedDate = dateValue(new Date(Date.now() + 60 * 86_400_000));

  useEffect(() => {
    fetch("/api/appointment-waitlist", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { automaticEmailAlertsAvailable?: boolean }) =>
        setAutomaticAlerts(result.automaticEmailAlertsAvailable === true),
      )
      .catch(() => setAutomaticAlerts(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (through < from) {
      setMessage("The last day must be on or after the first day.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/appointment-waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          serviceId,
          staffId: anyStaff ? null : staffId,
          from,
          through,
          preferredTime,
          name,
          email,
          phone,
          consent,
          automaticEmailOptIn: automaticAlerts && consent,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message || "Could not save your request.");
      setSaved(true);
      setMessage(
        result.message ||
          "Request saved. The salon may contact you if a time opens up.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save your request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border bg-card p-4 text-left sm:p-5">
      <h3 className="text-lg font-semibold">No time that works?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask the salon to contact you if a suitable time opens for {serviceName}.
        This is a request, not a booking.
      </p>
      {!open && !saved && (
        <button
          type="button"
          onClick={() => {
            setFrom(dateValue(selectedDate));
            setThrough(dateValue(selectedDate));
            setOpen(true);
          }}
          className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-semibold hover:bg-muted"
        >
          Ask for a time
        </button>
      )}
      {saved ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-[#e7dcc5] bg-[#fbf8f1] p-4 text-sm"
        >
          <p className="font-semibold">Request sent</p>
          <p className="mt-1 text-muted-foreground">{message}</p>
        </div>
      ) : open ? (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            <span className="font-medium">{serviceName}</span>
            <span className="text-muted-foreground">
              {" "}
              · {anyStaff ? "Any available stylist" : staffName}
            </span>
          </div>
          <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
            <input
              type="checkbox"
              checked={anyStaff}
              onChange={(event) => setAnyStaff(event.target.checked)}
              className="h-4 w-4 accent-[#80683d]"
            />
            Any available stylist is fine
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              First day that works
              <input
                required
                type="date"
                value={from}
                min={dateValue(new Date())}
                max={lastAllowedDate}
                onChange={(event) => {
                  setFrom(event.target.value);
                  if (through < event.target.value)
                    setThrough(event.target.value);
                }}
                className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Last day that works
              <input
                required
                type="date"
                value={through}
                min={from}
                max={lastAllowedDate}
                onChange={(event) => setThrough(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            Time of day
            <select
              value={preferredTime}
              onChange={(event) => setPreferredTime(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
            >
              <option value="any">Any time</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Your name
            <input
              required
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input
              required
              type="email"
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Phone (optional)
            <input
              type="tel"
              maxLength={50}
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
            />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              required
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1"
            />
            <span>
              {automaticAlerts
                ? "Email me if a matching cancellation opens up. The salon may also contact me about this request."
                : "The salon may contact me about this request."}{" "}
              This is not marketing; requests are removed after 90 days.
            </span>
          </label>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <button
            disabled={busy}
            className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Sending…" : "Ask the salon to contact me"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
