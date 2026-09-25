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
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method());
    // These tests only read app pages. Block every app-origin write, including
    // new endpoints not yet listed below. Keep third-party auth token refresh
    // outside this rule so a signed-in read-only test can still load.
    const isAppWrite =
      isWrite &&
      page.url() !== "about:blank" &&
      url.origin === new URL(page.url()).origin;
    const isExternalWrite =
      isWrite && EXTERNAL_WRITE_HOSTS.includes(url.hostname);
    const isDangerousPath =
      isWrite && DANGEROUS_PATHS.some((pattern) => pattern.test(url.pathname));

    if (isAppWrite || isExternalWrite || isDangerousPath) {
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
    blockedRequests() {
      return [...blocked];
    },
  };
}

export function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return () =>
    expect(errors, `Browser errors:\n${errors.join("\n")}`).toEqual([]);
}
