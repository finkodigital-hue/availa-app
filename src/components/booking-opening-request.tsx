import { useState, type FormEvent } from "react";

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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

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
          staffId,
          from,
          through,
          preferredTime,
          name,
          email,
          phone,
          consent,
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
      <h3 className="text-base font-semibold">
        Want us to let the salon know?
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask about an opening for {serviceName} with {staffName}. This does not
        reserve a time.
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
          Ask about an opening
        </button>
      )}
      {saved ? (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      ) : open ? (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              From
              <input
                required
                type="date"
                value={from}
                min={dateValue(new Date())}
                onChange={(event) => setFrom(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Until
              <input
                required
                type="date"
                value={through}
                min={from}
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
              The salon may contact me about this appointment request. This is
              not consent to marketing. Requests are removed after 90 days.
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
            {busy ? "Sending…" : "Send request"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
