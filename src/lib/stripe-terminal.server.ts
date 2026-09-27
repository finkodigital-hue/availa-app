type StripeErrorBody = {
  error?: { message?: string; code?: string; decline_code?: string };
};

export type StripeTerminalPaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  latest_charge?: string | null;
  metadata?: Record<string, string | undefined>;
};

export type StripeTerminalReader = {
  id: string;
  label: string;
  device_type: string;
  status: string;
  livemode: boolean;
  location: string | null;
  action?: {
    status?: string;
    failure_code?: string;
    failure_message?: string;
  } | null;
};

export class StripeTerminalRequestError extends Error {
  readonly uncertain: boolean;
  readonly code?: string;

  constructor(
    message: string,
    options?: { uncertain?: boolean; code?: string },
  ) {
    super(message);
    this.name = "StripeTerminalRequestError";
    this.uncertain = options?.uncertain ?? false;
    this.code = options?.code;
  }
}

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured yet.");
  return key;
}

export function isStripeTestMode() {
  return secretKey().startsWith("sk_test_");
}

function body(values: Record<string, string>) {
  const encoded = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) encoded.set(key, value);
  return encoded;
}

export async function terminalStripeRequest<T>(
  accountId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  try {
    const response = await fetch(`https://api.stripe.com${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Stripe-Account": accountId,
        ...init.headers,
      },
    });
    const responseBody = (await response.json()) as T & StripeErrorBody;
    if (!response.ok) {
      throw new StripeTerminalRequestError(
        responseBody.error?.message ??
          "Stripe could not complete the reader request.",
        { code: responseBody.error?.code ?? responseBody.error?.decline_code },
      );
    }
    return responseBody;
  } catch (error) {
    if (error instanceof StripeTerminalRequestError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new StripeTerminalRequestError(
        "Stripe did not answer in time. Check this payment before trying again.",
        { uncertain: true },
      );
    }
    throw error;
  }
}

export function createTerminalPaymentIntent(
  accountId: string,
  input: {
    attemptId: string;
    businessId: string;
    bookingId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
  },
) {
  return terminalStripeRequest<StripeTerminalPaymentIntent>(
    accountId,
    "/v1/payment_intents",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: body({
        amount: String(input.amountCents),
        currency: input.currency.toLowerCase(),
        "payment_method_types[0]": "card_present",
        capture_method: "automatic",
        description: `Bookzenvo booking ${input.bookingId}`,
        "metadata[checkout_flow]": "terminal_balance_payment",
        "metadata[terminal_attempt_id]": input.attemptId,
        "metadata[business_id]": input.businessId,
        "metadata[booking_id]": input.bookingId,
      }),
    },
  );
}

export function processTerminalPaymentIntent(
  accountId: string,
  readerId: string,
  paymentIntentId: string,
) {
  return terminalStripeRequest<StripeTerminalReader>(
    accountId,
    `/v1/terminal/readers/${encodeURIComponent(readerId)}/process_payment_intent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `bookzenvo-terminal-process-${paymentIntentId}`,
      },
      body: body({ payment_intent: paymentIntentId }),
    },
  );
}

export function retrieveTerminalPaymentIntent(accountId: string, id: string) {
  return terminalStripeRequest<StripeTerminalPaymentIntent>(
    accountId,
    `/v1/payment_intents/${encodeURIComponent(id)}`,
  );
}

export function retrieveTerminalReader(accountId: string, id: string) {
  return terminalStripeRequest<StripeTerminalReader>(
    accountId,
    `/v1/terminal/readers/${encodeURIComponent(id)}`,
  );
}

export function cancelTerminalReaderAction(
  accountId: string,
  readerId: string,
) {
  return terminalStripeRequest<StripeTerminalReader>(
    accountId,
    `/v1/terminal/readers/${encodeURIComponent(readerId)}/cancel_action`,
    { method: "POST" },
  );
}

export function cancelTerminalPaymentIntent(accountId: string, id: string) {
  return terminalStripeRequest<StripeTerminalPaymentIntent>(
    accountId,
    `/v1/payment_intents/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": `bookzenvo-terminal-cancel-${id}`,
      },
    },
  );
}

export async function createSimulatedReader(
  accountId: string,
  businessId: string,
  label: string,
) {
  if (!isStripeTestMode())
    throw new Error(
      "Simulated readers are only available in Stripe test mode.",
    );

  const location = await terminalStripeRequest<{ id: string }>(
    accountId,
    "/v1/terminal/locations",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body({
        display_name: `Bookzenvo test · ${label}`,
        "address[country]": "GB",
        "address[line1]": "1 Test Street",
        "address[city]": "Inverness",
        "address[postal_code]": "IV1 1AA",
        "metadata[business_id]": businessId,
      }),
    },
  );
  const reader = await terminalStripeRequest<StripeTerminalReader>(
    accountId,
    "/v1/terminal/readers",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body({
        registration_code: "simulated-wpe",
        label,
        location: location.id,
        "metadata[business_id]": businessId,
      }),
    },
  );
  return { reader, locationId: location.id };
}
