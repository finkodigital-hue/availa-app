import { expect, test } from "@playwright/test";
import { buildIcsCalendar } from "../../src/lib/ics";
import {
  authorizationUrl,
  makeOauthState,
  readOauthState,
} from "../../src/lib/calendar-sync.server";

test.describe("calendar sync security", () => {
  test.beforeEach(() => {
    process.env.CALENDAR_OAUTH_STATE_SECRET =
      "test-secret-with-sufficient-entropy";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "google-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "google-secret";
    process.env.MICROSOFT_CALENDAR_CLIENT_ID = "microsoft-client";
    process.env.MICROSOFT_CALENDAR_CLIENT_SECRET = "microsoft-secret";
  });

  test("OAuth state is signed and rejects tampering", () => {
    const state = makeOauthState({
      provider: "google",
      businessId: "business-1",
      userId: "user-1",
    });
    expect(readOauthState(state)).toMatchObject({
      provider: "google",
      businessId: "business-1",
      userId: "user-1",
    });
    expect(() => readOauthState(`${state.slice(0, -1)}x`)).toThrow(
      /Invalid OAuth state/,
    );
  });

  test("provider URLs request offline calendar access without including secrets", () => {
    const google = authorizationUrl(
      "google",
      "signed-state",
      "https://example.com/callback",
    );
    const microsoft = authorizationUrl(
      "microsoft",
      "signed-state",
      "https://example.com/callback",
    );
    expect(google).toContain("access_type=offline");
    expect(google).toContain("calendar.events");
    expect(microsoft).toContain("offline_access");
    expect(microsoft).toContain("Calendars.ReadWrite");
    expect(google + microsoft).not.toContain("google-secret");
    expect(google + microsoft).not.toContain("microsoft-secret");
  });

  test("ICS feed events remain portable and escape customer text", () => {
    const ics = buildIcsCalendar({
      uid: "booking-1",
      title: "Cut, colour; finish",
      description: "Line 1\nLine 2",
      startsAtIso: "2026-09-08T09:00:00Z",
      endsAtIso: "2026-09-08T10:00:00Z",
    });
    expect(ics).toContain("SUMMARY:Cut\\, colour\\; finish");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2");
    expect(ics).toContain("DTSTART:20260908T090000Z");
  });
});
