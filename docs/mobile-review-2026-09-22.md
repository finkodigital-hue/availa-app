# Website mobile review — 22 September 2026

Scope: current production website in the signed-in in-app browser, 390 × 844 CSS-pixel viewport. This is browser emulation, not a real iPhone/Safari or Android/Chrome certification. No appointments, customer records or messages were created during the visual review.

1. **Homepage:** no horizontal page overflow; clear primary action and usable collapsed navigation. Screenshot `01-home-390.jpg`.
2. **Mobile navigation:** menu opens and the sign-in link works. Screenshot `02-menu-390.jpg`.
3. **Sign-in:** existing saved credentials successfully reached the owner dashboard. Inputs had 15px text because the desktop selector overrode the mobile selector. The mobile selector now matches its specificity and uses a minimum 16px size. Credentials were not extracted.
4. **Dashboard:** layout fits, but it incorrectly reported no clients just after UK midnight while the calendar showed today's appointments. The server used UTC day boundaries. Fixed to use the business timezone, with ten boundary assertions covering year rollover, half-hour offsets and both UK DST changes. Screenshot `03-dashboard-before-390.jpg`.
5. **Calendar:** the two-column header squeezed the subtitle into a narrow column. Fixed to stack the heading and actions on phones. The staff grid and statistics retain their own horizontal scrolling; the whole page does not overflow. Screenshot `04-calendar-before-390.jpg`.
6. **New booking:** search and new-customer inputs lacked accessible names. Added explicit labels/search names, appropriate phone/email autocomplete, and stacked contact inputs on phones. Screenshots `05-booking-search-before-390.jpg` and `06-customer-fields-before-390.jpg`.

Exact screenshots are saved locally at `C:/bookzenvo/launch-audit-2026-09-21/mobile-review/`. The signed-in screenshots contain workspace information and should stay private.

The fixes still require their post-deployment visual pass. Customer booking, settings, exports, alternate viewport sizes, keyboard/screen reader use and physical devices remain to be checked. Screenshot review alone does not establish accessibility compliance.
