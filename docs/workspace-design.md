# Workspace visual system

The owner app uses the scoped styles in `src/workspace.css`. It follows a
macOS-inspired visual direction: native system sans-serif typography, clear
headings, neutral surfaces, Bookzenvo gold accents and restrained shadows.
Deep gold actions keep white labels readable in light mode; dark mode uses
champagne gold with dark labels. Selection highlights use a soft gold wash.
The existing Radix components and all business operations remain in place.

- Main pages opt in through `AppShell` with `.workspace-theme`.
- Calendar content deliberately does not opt in. The summary strip has its own
  approved readable typography and gold accents; the calendar grid and its
  interactions remain unchanged.
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
