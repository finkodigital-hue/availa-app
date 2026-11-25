# Mobile privacy disclosure draft

This document is a working source for the Apple App Privacy and Google Play Data safety forms. Recheck every answer against the production app immediately before submission.

## Data the app may process

| Data | Why it is used | Notes |
| --- | --- | --- |
| Account name and email address | Sign-in, account management and support | Authentication is provided by Supabase. |
| Business profile and settings | Provide and personalise the business workspace | Includes branding, booking-page and operating settings. |
| Customer contact details and booking notes | Manage customers and appointments | Business users must only enter information they are authorised to use. |
| User-selected photos and consultation answers | Business/gallery/profile uploads, stock scanning and the business's consultation workflow | Consultation forms may contain health-related information depending on the business's questions; reflect the actual enabled production forms and processing in the final disclosures. |
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

The workspace includes user-initiated photo uploads for business branding, gallery, staff and customers, plus camera capture for stock scanning. iOS includes camera and photo-library purpose descriptions for those existing website controls inside the WebView. These requests and permission-denied recovery still need physical-device verification. The app does not intentionally access location, contacts, advertising identifiers or cross-app tracking. Android's legacy broad read/write external-storage permissions are explicitly blocked; exports use private temporary cache files and the operating system share sheet. Recheck the final compiled iOS and Android manifests before answering the store forms, including user-chosen saved copies. SecureStore adds a Face ID description to generated iOS configuration, but this release does not request biometric authentication for session storage.

Native Google sign-in, when the gated feature is enabled after verification, uses the system authentication browser. A short-lived PKCE verifier and nonce are stored encrypted and removed after completion/cancellation; process-interrupted attempts expire after ten minutes and are cleaned when next read. This is activity-triggered cleanup, not a guarantee of deletion while the app is inactive. Google authentication and the account email/identity must be reflected in the final disclosures when enabled.

## Submission checks

- Confirm the privacy policy at https://bookzenvo.com/privacy matches the production app.
- Verify that account deletion is available in the product and document the exact path for reviewers.
- Confirm data-retention and deletion handling with the production database configuration.
- Verify that analytics, crash reporting or advertising SDKs have not been added without updating this document.
- Complete the Apple and Google forms from observed production behaviour, not from this draft alone.
