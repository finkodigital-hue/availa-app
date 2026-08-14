# Mobile privacy disclosure draft

This document is a working source for the Apple App Privacy and Google Play Data safety forms. Recheck every answer against the production app immediately before submission.

## Data the app may process

| Data | Why it is used | Notes |
| --- | --- | --- |
| Account name and email address | Sign-in, account management and support | Authentication is provided by Supabase. |
| Business profile and settings | Provide and personalise the business workspace | Includes branding, booking-page and operating settings. |
| Customer contact details and booking notes | Manage customers and appointments | Business users must only enter information they are authorised to use. |
| Booking, service and staff data | Calendar, scheduling and business operations | Shared with the existing Bookzenvo website workspace. |
| Payment status and Stripe identifiers | Deposits, payment progress and payment actions | Card details are handled by Stripe and are not stored by Bookzenvo. |
| Stock and report data | Inventory and business reporting | Used to provide requested app functionality. |
| Support and feedback content | Respond to support requests and improve the service | Only collected when a user contacts Bookzenvo or submits feedback. |

## Main processors and infrastructure

- **Supabase:** authentication and application data
- **Stripe:** connected accounts and payment processing
- **Cloudflare:** website and application delivery
- **Resend:** transactional email delivery

The final privacy policy must accurately describe the production configuration and link to the providers where appropriate.

## Native-device access

The current mobile app does not intentionally request access to location, contacts, the photo library, advertising identifiers or cross-app tracking. Recheck the compiled iOS and Android manifests before answering the store forms. If camera or photo access is added for profile images, explain the purpose at the permission prompt and update both store disclosures.

## Submission checks

- Confirm the privacy policy at https://bookzenvo.com/privacy matches the production app.
- Verify that account deletion is available in the product and document the exact path for reviewers.
- Confirm data-retention and deletion handling with the production database configuration.
- Verify that analytics, crash reporting or advertising SDKs have not been added without updating this document.
- Complete the Apple and Google forms from observed production behaviour, not from this draft alone.
