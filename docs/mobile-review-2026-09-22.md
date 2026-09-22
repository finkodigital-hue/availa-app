# Website mobile review — 22 September 2026

Scope: current production website in the signed-in in-app browser, 390 × 844 CSS-pixel viewport. This is browser emulation, not a real iPhone/Safari or Android/Chrome certification. No appointments, customer records or messages were created during the visual review.

1. **Homepage:** no horizontal page overflow; clear primary action and usable collapsed navigation. Screenshot `01-home-390.jpg`.
2. **Mobile navigation:** menu opens and the sign-in link works. Screenshot `02-menu-390.jpg`.
3. **Sign-in:** existing saved credentials successfully reached the owner dashboard. Inputs had 15px text because the desktop selector overrode the mobile selector. The mobile selector now matches its specificity and uses a minimum 16px size. Credentials were not extracted.
4. **Dashboard:** layout fits, but it incorrectly reported no clients just after UK midnight while the calendar showed today's appointments. The server used UTC day boundaries. Fixed to use the business timezone, with ten boundary assertions covering year rollover, half-hour offsets and both UK DST changes. Screenshot `03-dashboard-before-390.jpg`.
5. **Calendar:** the two-column header squeezed the subtitle into a narrow column. Fixed to stack the heading and actions on phones. The staff grid and statistics retain their own horizontal scrolling; the whole page does not overflow. Screenshot `04-calendar-before-390.jpg`.
6. **New booking:** search and new-customer inputs lacked accessible names. Added explicit labels/search names, appropriate phone/email autocomplete, and stacked contact inputs on phones. Screenshots `05-booking-search-before-390.jpg` and `06-customer-fields-before-390.jpg`.

Exact screenshots are saved locally at `C:/bookzenvo/launch-audit-2026-09-21/mobile-review/`. The signed-in screenshots contain workspace information and should stay private.

Post-deployment visual verification passed at 390px: calendar header and actions fit, dashboard shows the correct next appointment after UK midnight, and customer fields expose labels with 16px text and a telephone input. Evidence: 07-calendar-after-390.jpg, 08-dashboard-after-390.jpg, 09-customer-fields-after-390.jpg. Customer booking, settings, exports, alternate viewport sizes, keyboard/screen reader use and physical devices remain to be checked. Screenshot review alone does not establish accessibility compliance.


Customer booking follow-up: selected a service, authorised staff member, available time and reached the final customer-details screen for the explicitly labelled fictional Pasha Hair demonstration salon. No booking was submitted. The page measured 305px content at 320px viewport, 415px at 430px, and 753px at 768px (the difference is the vertical scrollbar). Name/email/phone fields use 16px text, email/tel input types; optional SMS and marketing boxes are separate and unchecked. The confirm button stays disabled before required details/policy acknowledgment. Exact screenshots 10�13 preserve these states. This was a signed-in owner's browser viewing the public customer flow; an anonymous session and actual completion remain separate tests.

Viewport limitation: the original agent-created owner tab remained at 390px when the browser override changed; its smaller-width results were not counted. The public booking tab did respond to 320/430/768px overrides and its measured dimensions are recorded above.
