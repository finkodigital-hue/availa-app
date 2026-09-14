# Workspace visual system

The owner app uses the scoped styles in `src/workspace.css`. It follows a
macOS-inspired visual direction: native system sans-serif typography, clear
headings, cool neutral surfaces, blue primary actions and restrained shadows.
The existing Radix components and all business operations remain in place.

- Main pages opt in through `AppShell` with `.workspace-theme`.
- Calendar content deliberately does not opt in. Its styles and interactions
  must remain unchanged when updating the workspace design.
- Auth, onboarding and help pages opt in independently.
- `[data-workspace-brand]` stops the styling scope at the salon preview.
- Dialogs and menus rendered outside the shell receive tokens only while a
  themed owner page is mounted. Anchored popovers keep their existing sizing.
- Both light and dark tokens are provided. No extra font or UI package is needed.

Visual review covers dashboard, calendar, bookings, customers, consultations,
staff, services, stock, payments, gift cards, reports, professionals, assistant,
page builder, import, settings, preview and help, at 1440px and 390px. Customer,
consultation and settings forms are reviewed without submitting changes.

`scripts/audit-workspace-design.mjs` can repeat the local review with a disposable
`@bookzenvo.test` QA login via `E2E_EMAIL` and the local Supabase environment.
It refuses hosted Supabase or a non-local app URL. Screenshots and results are
written to ignored `test-results/workspace-design/`; auth tokens are not saved.
