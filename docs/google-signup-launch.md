# Google sign-up launch switch

Bookzenvo is waitlist-only before launch. The account-creation UI is prepared but disabled by default with `VITE_PUBLIC_SIGNUP_ENABLED=false`. The existing sign-in, password reset, invite and waitlist flows remain available. Do not enable Google in Supabase Auth merely to test the hidden button in production: an enabled OAuth provider can create identities independently of Bookzenvo's UI switch.

Before opening public registration:

1. Confirm the public onboarding, legal terms, abuse controls, email confirmation and account-recovery journey are release-ready.
2. Configure a Google Cloud web OAuth client. Set the authorised redirect URI to the **Supabase Auth callback URL shown in the Supabase Google provider settings**, not Bookzenvo's `/auth` page. Store the client secret only in the provider settings.
3. Enable Google in Supabase Auth and allow `https://bookzenvo.com/auth` in Supabase Auth URL Configuration. Add the exact local URL only for a controlled local test.
4. Test a new Google account, an existing Google account, an existing email/password address, cancellation, and return to onboarding. Check that no duplicate business is created and that staff invites are not accidentally accepted by an unrelated identity.
5. Only then set `VITE_PUBLIC_SIGNUP_ENABLED=true` in the intended deployment and release the build. This exposes both email account creation and the Google button. Recheck the waitlist and sign-in pages after deployment.

The UI switch is not a security control at the identity-provider boundary. Keep the Google provider disabled while public sign-up must remain closed, or implement a server-enforced allowlist/invite gate before enabling it for limited testing.
