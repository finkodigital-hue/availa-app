import assert from "node:assert/strict";
import {
  requireRecentSensitiveSession,
  requireVerifiedIdentity,
} from "../src/lib/verified-identity.server.ts";
const verified = {
  id: "fictional-owner",
  email: "owner@example.invalid",
  email_confirmed_at: "2026-01-01",
};
const client = (user, aal = "aal1", sub = user?.id, error = null) => ({
  auth: {
    getUser: async () => ({ data: { user }, error }),
    getClaims: async () => ({ data: { claims: { sub, aal } }, error: null }),
  },
});
assert.equal(
  (await requireVerifiedIdentity(client(verified), "test")).user.id,
  verified.id,
);
await assert.rejects(
  requireVerifiedIdentity(
    client({ ...verified, email_confirmed_at: null }),
    "test",
  ),
  /Email verification/,
);
const mfa = { ...verified, factors: [{ status: "verified" }] };
await assert.rejects(
  requireVerifiedIdentity(client(mfa), "test"),
  /Two-factor/,
);
await requireVerifiedIdentity(client(mfa, "aal2"), "test");
await assert.rejects(
  requireVerifiedIdentity(client(verified, "aal2", "different-user"), "test"),
  /Unauthorized/,
);
await assert.rejects(
  requireVerifiedIdentity(client(null), "test"),
  /Unauthorized/,
);
await assert.rejects(
  requireVerifiedIdentity(
    client(verified, "aal2", verified.id, new Error("revoked")),
    "test",
  ),
  /Unauthorized/,
);
const now = Math.floor(Date.now() / 1000);
requireRecentSensitiveSession({
  aal: "aal2",
  amr: [
    { method: "password", timestamp: now - 30 },
    { method: "totp", timestamp: now - 10 },
  ],
});
requireRecentSensitiveSession({ aal: "aal2", auth_time: now - 30 });
assert.throws(
  () =>
    requireRecentSensitiveSession({
      aal: "aal2",
      amr: [{ method: "token_refresh", timestamp: now }],
    }),
  /Recent sign-in/,
);
assert.throws(
  () =>
    requireRecentSensitiveSession({
      aal: "aal2",
      amr: [{ method: "password", timestamp: now - 700 }],
    }),
  /Recent sign-in/,
);
assert.throws(
  () =>
    requireRecentSensitiveSession({
      aal: "aal1",
      amr: [{ method: "password", timestamp: now }],
    }),
  /Two-factor/,
);
assert.throws(
  () =>
    requireRecentSensitiveSession({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: now + 120 }],
    }),
  /Recent sign-in/,
);
console.log("13 server identity regression checks passed.");
