import { expect, type Page } from "@playwright/test";

const EXTERNAL_WRITE_HOSTS = ["api.stripe.com", "api.resend.com"];
const DANGEROUS_PATHS = [
  /stripe/i,
  /checkout/i,
  /refund/i,
  /send-confirmation/i,
  /send-reminders/i,
  /booking-actions/i,
  /reviews\/submit/i,
  /stock-scan/i,
];

/**
 * Browser tests are observational. This guard aborts known payment, messaging,
 * signing and booking mutation endpoints if a future UI change calls one while
 * a smoke test is only navigating or reading a page.
 */
export async function installMutationGuard(page: Page) {
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isExternalWrite =
      request.method() !== "GET" && EXTERNAL_WRITE_HOSTS.includes(url.hostname);
    const isDangerousPath =
      request.method() !== "GET" &&
      DANGEROUS_PATHS.some((pattern) => pattern.test(url.pathname));

    if (isExternalWrite || isDangerousPath) {
      blocked.push(`${request.method()} ${url.href}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  return {
    expectNothingBlocked() {
      expect(
        blocked,
        `Unsafe requests attempted:\n${blocked.join("\n")}`,
      ).toEqual([]);
    },
  };
}

export function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return () =>
    expect(errors, `Browser errors:\n${errors.join("\n")}`).toEqual([]);
}
