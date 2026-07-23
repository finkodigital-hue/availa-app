# Bookzenvo mobile

The Bookzenvo owner app for Android and iPhone. It uses the existing Bookzenvo Supabase project, so bookings and sign-ins are shared with the website.

## Run it on an Android phone

1. Copy `.env.example` to `.env`.
2. Add the existing public Supabase URL and publishable key from the Bookzenvo website environment.
3. In this `mobile` folder, run `npm start`.
4. Install **Expo Go** from Google Play and scan the QR code.

Never add a Supabase service-role key, Stripe secret key, Resend key, or webhook secret to the mobile app.

## What is in this first foundation

- Secure Supabase session storage
- Sign in, password-reset request and sign out
- A live owner dashboard using the same business and booking records as the website
- Today calendar and bookings views

Before publishing, configure `bookzenvo://` as an allowed redirect URL in Supabase Authentication and create the required Apple/Google developer accounts.
