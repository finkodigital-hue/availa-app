export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "note"; text: string };

export interface HelpArticle {
  slug: string;
  categorySlug: string;
  title: string;
  summary: string;
  studioOnly?: boolean;
  blocks: HelpBlock[];
  keywords?: string[];
}

export interface HelpCategory {
  slug: string;
  title: string;
  description: string;
  icon: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Create your account, run the setup wizard and get your page live.",
    icon: "Rocket",
  },
  {
    slug: "booking-page",
    title: "Booking Page & Page Builder",
    description: "Build and customize the page your clients book through.",
    icon: "LayoutTemplate",
  },
  {
    slug: "services-staff",
    title: "Services & Staff",
    description: "Set up what you offer and who's on your team.",
    icon: "Scissors",
  },
  {
    slug: "calendar-bookings",
    title: "Calendar & Bookings",
    description: "Manage your diary and every appointment in it.",
    icon: "CalendarCheck",
  },
  {
    slug: "customers",
    title: "Customers",
    description: "Your client book, and what clients can do for themselves.",
    icon: "UserCircle",
  },
  {
    slug: "stock",
    title: "Stock",
    description: "Track products and see what's running low.",
    icon: "Package",
  },
  {
    slug: "payments",
    title: "Payments",
    description: "Connect Stripe, take deposits and track what's been paid.",
    icon: "CreditCard",
  },
  {
    slug: "reports",
    title: "Reports",
    description: "Revenue, staff earnings and service performance.",
    icon: "BarChart3",
  },
  {
    slug: "settings-branding",
    title: "Settings & Branding",
    description: "Business details, hours, gallery and white-label options.",
    icon: "Settings",
  },
  {
    slug: "account-security",
    title: "Account & Security",
    description: "Passwords, two-factor authentication and privacy.",
    icon: "ShieldCheck",
  },
  {
    slug: "import",
    title: "Import",
    description: "Bring your team, clients, services and history over from another system.",
    icon: "Upload",
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------------------------------------------------------------------
  // Getting Started
  // ---------------------------------------------------------------------
  {
    slug: "creating-your-account",
    categorySlug: "getting-started",
    title: "Creating your account",
    summary: "Sign up with your name, email and a password.",
    blocks: [
      { type: "p", text: "Go to the sign-up screen and enter your name, email and a password (at least 6 characters), then click Create account. There's no social or magic-link sign-in for business owners — just email and password." },
      { type: "note", text: "Forgot your password later? See \"Resetting your password\" in Account & Security." },
    ],
  },
  {
    slug: "creating-your-workspace",
    categorySlug: "getting-started",
    title: "Creating your workspace",
    summary: "The one-step form that creates your business and booking page link.",
    blocks: [
      { type: "p", text: "After you sign up, you'll land on a short \"Getting Started\" screen with two fields:" },
      { type: "list", items: [
        "Business name",
        "Your booking page URL — auto-filled from your business name (e.g. /book/maison-coiffure), editable before you submit, lowercase letters, numbers and hyphens only",
      ] },
      { type: "p", text: "Submitting creates your workspace with default hours of Monday–Friday 9am–5pm, closed Saturday and Sunday, and takes you straight to your dashboard. You can change your hours any time in Settings → Hours." },
      { type: "note", text: "There's currently no way to change your booking page URL from within the app once it's set, so it's worth picking one you're happy with." },
    ],
    keywords: ["slug", "sign up", "workspace"],
  },
  {
    slug: "your-first-booking-page",
    categorySlug: "getting-started",
    title: "Building your first booking page",
    summary: "What happens the first time you open Page Builder.",
    blocks: [
      { type: "p", text: "Once your workspace is created, add a few services and staff, then open Page Builder — the first visit launches a four-step setup wizard that builds a starting page from your real services and staff. See \"The setup wizard: building your first page\" in Booking Page & Page Builder for the full walkthrough." },
    ],
  },
  {
    slug: "free-vs-studio",
    categorySlug: "getting-started",
    title: "Free vs Studio: choosing a plan",
    summary: "What each plan includes today.",
    blocks: [
      { type: "list", items: [
        "Free — one staff member, unlimited bookings, a branded booking page and client book.",
        "Studio (£22/month) — unlimited staff members, plus the AI Assistant and AI page editing.",
      ] },
      { type: "p", text: "The staff limit and the AI features are actively enforced: adding a second staff member or opening the AI tools on a Free plan shows an upgrade prompt instead. Everything else in Bookzenvo — including payments, deposits and reports — is usable on both plans today." },
      { type: "note", text: "Upgrading isn't an automatic checkout yet — go to Settings → Plan and request an upgrade, and our team will follow up." },
    ],
    keywords: ["pricing", "upgrade", "plan", "billing"],
  },
  {
    slug: "finding-your-booking-page-link",
    categorySlug: "getting-started",
    title: "Finding and sharing your booking page link",
    summary: "Where to find your /book link so you can share it with clients.",
    blocks: [
      { type: "p", text: "Your booking page lives at bookzenvo.com/book/your-slug. You can find and copy it from the top of the sidebar, from \"Preview page\" in the sidebar footer, or from the \"Booking page\" link on your dashboard." },
      { type: "p", text: "Share this link anywhere — your Instagram bio, Google listing, or a text reply to \"are you free Saturday?\"" },
    ],
  },
  {
    slug: "dashboard-empty-states",
    categorySlug: "getting-started",
    title: "What you'll see on day one",
    summary: "Why your dashboard looks empty when you're just getting started.",
    blocks: [
      { type: "p", text: "A brand-new workspace starts with zeroed-out stats and a few friendly empty states — \"Free afternoon — share your booking page!\", \"No staff bookings in this period,\" \"No services booked yet.\" These fill in automatically as bookings start coming through, so there's nothing to configure — just add your services and staff, share your link, and the dashboard builds itself from there." },
    ],
  },
  // ---------------------------------------------------------------------
  // Booking Page & Page Builder
  // ---------------------------------------------------------------------
  {
    slug: "page-builder-overview",
    categorySlug: "booking-page",
    title: "The Page Builder: Sections and Design",
    summary: "Where you build and style the page clients book through.",
    blocks: [
      { type: "p", text: "Open Page Builder from the sidebar to edit the public page clients see at your /book link. It has two tabs." },
      { type: "list", items: [
        "Sections — the content of your page: hero, about, gallery, services, staff, testimonials, hours and location.",
        "Design — colors, fonts, button style and corner radius for the whole page.",
      ] },
      { type: "p", text: "If you haven't finished setting up your page yet, opening Page Builder drops you into the setup wizard instead — see \"The setup wizard: building your first page.\"" },
    ],
  },
  {
    slug: "setup-wizard",
    categorySlug: "booking-page",
    title: "The setup wizard: building your first page",
    summary: "A four-step wizard that generates a starting page from your real services and staff.",
    blocks: [
      { type: "p", text: "New businesses are dropped into a full-screen setup wizard the first time they open Page Builder. It has four steps." },
      { type: "steps", items: [
        "Business info — pick a business type (Salon, Barber, Spa, Nails, Beauty or Other), and optionally add your Instagram handle, website and a logo (PNG/JPG/SVG, up to 2MB).",
        "Pick a vibe — choose one of four style presets: Clean & minimal, Bold & modern, Soft & elegant, or Fresh & playful. Each shows a live mini preview of your page.",
        "Make it yours — fine-tune the preset's colors, font and button style, then continue or click \"Looks good as is.\"",
        "Generate — click \"Generate my page\" to build your starting page from your real services and staff. If you haven't added any services yet, it'll use placeholders until you do.",
      ] },
      { type: "note", text: "Your progress autosaves as you go, so you can leave and come back. You can re-run the wizard any time from the Design panel." },
    ],
  },
  {
    slug: "editing-page-manually",
    categorySlug: "booking-page",
    title: "Editing your page manually with blocks",
    summary: "Add, reorder and edit the sections on your booking page by hand.",
    blocks: [
      { type: "p", text: "On the Sections tab, click \"Edit manually\" to expand the block editor. Your page is built from these block types:" },
      { type: "list", items: [
        "Hero — heading, subheading, call-to-action button and photo, in three layouts (text only, text + photo, split screen).",
        "About — a heading and bio, with an optional small photo.",
        "Gallery — a grid of 3, 6 or 9 photos.",
        "Services — pulled automatically from your active services. You can only edit the heading; the list itself always reflects real services.",
        "Staff spotlight — pulled automatically from bookable staff. Edit the heading and optionally choose which staff appear.",
        "Testimonial — a quote, name and role you enter yourself.",
        "Hours & location — pulled automatically from your business address, phone and hours. Only the heading is editable.",
      ] },
      { type: "p", text: "Use \"Add block\" to insert a new section, drag blocks to reorder them, and use the up/down/remove controls on each one. Click Save when you're done." },
      { type: "note", text: "There's no separate draft mode — clicking Save publishes your changes to the live page immediately." },
    ],
    keywords: ["blocks", "sections", "hero", "gallery", "about"],
  },
  {
    slug: "ai-page-editing",
    categorySlug: "booking-page",
    title: "AI page editing",
    summary: "Describe a change in plain English and review it before it goes live. Studio plan only.",
    studioOnly: true,
    blocks: [
      { type: "p", text: "On Studio plans, the Sections tab includes a box above the manual editor: \"Describe what you want to change.\" Type something like \"Make the hero punchier, add a gallery of my work, and feature Jen and Leanne,\" then click Suggest changes." },
      { type: "p", text: "This isn't a chat — each request is a single suggestion. Bookzenvo takes a screenshot of your current page, sends it along with your prompt, and generates a full replacement layout using only your real services, staff and testimonials (it won't invent content)." },
      { type: "steps", items: [
        "Type what you want changed and click \"Suggest changes.\"",
        "Review the before/after comparison that appears.",
        "Click \"Use this\" to publish it, or \"Keep current\" to discard the suggestion.",
      ] },
      { type: "note", text: "Nothing is saved until you approve it. On the Free plan, this box is replaced with an upgrade prompt — AI page editing isn't available on Free." },
    ],
    keywords: ["ai", "claude", "studio", "upgrade", "assistant"],
  },
  {
    slug: "design-panel",
    categorySlug: "booking-page",
    title: "Customizing colors, fonts and buttons",
    summary: "Change your page's look from the Design tab in Page Builder.",
    blocks: [
      { type: "p", text: "Open Page Builder → Design to style your whole page at once." },
      { type: "list", items: [
        "Change vibe — switch to one of four presets (Clean & minimal, Bold & modern, Soft & elegant, Fresh & playful). This resets your colors, fonts and button style to that preset's defaults; your logo is kept.",
        "Primary and accent color — set as hex values.",
        "Display font — choose from ten fonts including Cormorant Garamond, Playfair Display, Inter, Poppins and DM Sans.",
        "Button style — Solid, Outline or Soft.",
        "Corner radius — a slider from square to fully rounded corners.",
      ] },
      { type: "p", text: "Click \"Save design\" to publish your changes immediately. Your logo is set during Step 1 of the setup wizard; to change it, use \"Re-run setup wizard\" from the Design tab." },
      { type: "note", text: "In Settings, the old Branding tab now just links here — all page styling lives in Page Builder → Design." },
    ],
    keywords: ["colors", "fonts", "logo", "theme", "branding", "button style"],
  },
  {
    slug: "page-edit-history",
    categorySlug: "booking-page",
    title: "Undoing changes: page edit history",
    summary: "Every save is recorded, so you can restore an earlier version.",
    blocks: [
      { type: "p", text: "Click \"History\" at the top of Page Builder to see your last 20 saved versions, each with a timestamp and the prompt used (or \"Manual edit\" if you edited blocks by hand)." },
      { type: "p", text: "Click Restore on any entry to bring your page back to that version. You'll be asked to confirm, since restoring saves immediately and replaces your current layout — it isn't a preview." },
    ],
    keywords: ["undo", "restore", "version history"],
  },
  {
    slug: "preview-booking-page",
    categorySlug: "booking-page",
    title: "Previewing your booking page",
    summary: "See exactly what clients see before you share your link.",
    blocks: [
      { type: "p", text: "Open Preview from the sidebar to see your live booking page exactly as a client would. Toggle between Mobile and Desktop widths, and use Refresh to pick up your latest changes." },
      { type: "p", text: "Click \"Open live\" to view the real page at your /book link in a new tab." },
    ],
  },
  {
    slug: "client-booking-flow",
    categorySlug: "booking-page",
    title: "What clients see: the public booking flow",
    summary: "The five steps a client goes through to book with you.",
    blocks: [
      { type: "p", text: "Clients book through a simple stepper on your public page:" },
      { type: "steps", items: [
        "Service — choose from your active services, grouped by name.",
        "Staff — pick who they'd like (skipped automatically if only one option applies).",
        "Time — pick an available slot, grouped into Morning, Afternoon and Evening based on your hours, existing bookings and any blocked time.",
        "Info — enter their name, email, phone and any notes.",
        "Done — a confirmation screen summarizing the service, staff and total.",
      ] },
      { type: "p", text: "Clients can use the chips at the top of the page to jump back and change an earlier choice at any point." },
    ],
  },

  // ---------------------------------------------------------------------
  // Services & Staff
  // ---------------------------------------------------------------------
  {
    slug: "adding-services",
    categorySlug: "services-staff",
    title: "Adding and managing services",
    summary: "Set up what you offer, how long it takes and what it costs.",
    blocks: [
      { type: "p", text: "Add and edit services from the Services page. Each service has:" },
      { type: "list", items: [
        "Name and description",
        "Category — a free-text tag (e.g. \"Hair\", \"Nails\") shown as a badge on the card; there's no separate category management screen",
        "Duration in minutes (5-minute increments) and price",
        "Buffer time before and after the appointment",
        "A calendar color, used as the accent bar on the card and in the calendar",
        "Which staff can perform it — leave this empty to let any staff member perform it",
        "Products used — link inventory items consumed per booking (see \"Linking products to services\")",
        "An Active toggle that controls whether it's visible on your booking page",
      ] },
      { type: "note", text: "Deposits aren't set per service — configure a deposit or full-payment requirement for your whole business under Settings → Payments." },
      { type: "p", text: "You can archive a service to hide it while keeping its booking history, or delete it — deleting is blocked if the service has existing bookings, and you'll be guided to archive instead." },
    ],
  },
  {
    slug: "linking-products-to-services",
    categorySlug: "services-staff",
    title: "Linking products to services",
    summary: "Track how much stock a service uses, and see its real profit margin.",
    blocks: [
      { type: "p", text: "On a service's edit form, use \"Products used\" to link inventory items from Stock and set how much of each is used per booking. This powers the cost, profit and margin shown on the service card, and the \"Most/least profitable services\" cards on the Stock page." },
      { type: "note", text: "Linking a product doesn't automatically deduct stock when a booking is completed — it's used for cost and margin calculations only. Adjust your stock levels yourself as you use products; see \"Tracking inventory.\"" },
    ],
    keywords: ["recipe", "margin", "profit", "cost"],
  },
  {
    slug: "staff-profiles",
    categorySlug: "services-staff",
    title: "Adding staff members and profiles",
    summary: "Add your team, control who's bookable, and pick their services.",
    blocks: [
      { type: "p", text: "Add team members from the Staff page: name, role, email, phone, bio and a photo. Two toggles control visibility — Bookable (shown on your booking page) and Active (disable to hide them everywhere without deleting them)." },
      { type: "p", text: "Each staff member's edit dialog has four tabs:" },
      { type: "list", items: [
        "Profile — their basic details and photo",
        "Hours — their working hours (see \"Setting staff working hours\")",
        "Services — which services they perform; leave none selected and they'll appear as an option for every service",
        "Time off — holidays and other blocked time (see \"Booking staff time off and holidays\")",
      ] },
      { type: "note", text: "The Free plan allows one staff member; Studio allows unlimited staff." },
      { type: "p", text: "If you remove a staff member who has future bookings, you'll be asked to reassign those bookings to another active staff member before they're disabled." },
    ],
  },
  {
    slug: "staff-hours",
    categorySlug: "services-staff",
    title: "Setting staff working hours",
    summary: "Give a staff member their own schedule, separate from your business hours.",
    blocks: [
      { type: "p", text: "Open a staff member's edit dialog → Hours to set an open and close time for each day of the week, with a toggle to mark a day closed." },
      { type: "note", text: "These hours override your general business hours for that person. Leave every day closed to have them simply inherit your business hours instead." },
    ],
    keywords: ["schedule", "availability", "working hours"],
  },
  {
    slug: "staff-holidays-time-off",
    categorySlug: "services-staff",
    title: "Booking staff time off and holidays",
    summary: "Block out holidays, sick days and breaks so clients can't book over them.",
    blocks: [
      { type: "p", text: "Open a staff member's edit dialog → Time off to block bookings automatically for holidays, vacations, sick leave, breaks, training or anything else." },
      { type: "steps", items: [
        "Choose a type: Holiday, Vacation, Sick leave, Lunch/break, Training or Other.",
        "Add an optional title and reason (an internal note, not shown to clients).",
        "Toggle All-day, or set specific start and end times.",
        "Set the start and end date.",
      ] },
      { type: "p", text: "Leave the staff member field blank to block time for your whole team at once — these show an \"All staff\" badge. Deleting a time-off entry reopens those slots for booking immediately." },
    ],
    keywords: ["annual leave", "vacation", "sick leave", "day off", "unavailable", "blocked dates"],
  },
  {
    slug: "independent-professionals",
    categorySlug: "services-staff",
    title: "Independent professionals & chair rentals",
    summary: "Invite self-employed renters who run their own bookings under your roof.",
    blocks: [
      { type: "p", text: "Professionals are different from staff: each is a self-employed renter with their own separate Bookzenvo account and business, linked to yours. They keep their own bookings, clients and payments, but can appear on your shared calendar and booking page." },
      { type: "p", text: "Manage them from the Professionals page, which has a Team tab (active professionals and pending invites) and a Rent tab (a payment ledger)." },
      { type: "steps", items: [
        "From the Team tab, click to invite a professional and enter their email, a chair or room label, and an optional personal note.",
        "Choose a rent agreement: no agreement, weekly rent, monthly rent, percentage commission, or a fixed commission per booking, with the amount.",
        "Click \"Create invitation,\" then copy the invite link and send it to them yourself — Bookzenvo doesn't email it automatically.",
        "They open the link, sign up, and get their own Bookzenvo business linked to yours.",
      ] },
      { type: "note", text: "There's no \"resend\" option — only Copy invite link and Revoke on a pending invite. Invitations expire, so re-copy and resend the link if needed." },
      { type: "p", text: "On the Rent tab, track payments by status (Due, Overdue, Paid, Waived), generate the next period for weekly/monthly agreements, or add one-off payments for commission-based agreements. Each professional's permissions on your calendar and booking page can be adjusted under Settings → Chair rentals." },
    ],
    keywords: ["renter", "rent-a-chair", "invite", "professionals"],
  },

  // ---------------------------------------------------------------------
  // Calendar & Bookings
  // ---------------------------------------------------------------------
  {
    slug: "using-the-calendar",
    categorySlug: "calendar-bookings",
    title: "Using the calendar",
    summary: "Day, Week and Month views of your diary.",
    blocks: [
      { type: "p", text: "Switch between Day, Week and Month views from the calendar. Day view gives each active staff member their own column (including any independent professionals linked to your business), so you can see everyone's diary side by side. Week and Month views pool bookings by date without separate staff columns." },
    ],
  },
  {
    slug: "creating-a-manual-booking",
    categorySlug: "calendar-bookings",
    title: "Creating a manual or walk-in booking",
    summary: "Add a booking yourself, or block time without a customer attached.",
    blocks: [
      { type: "p", text: "Click \"New booking,\" or click directly on an empty slot in the calendar, to open the booking dialog. Work through customer, service, staff and time, then confirm." },
      { type: "p", text: "Toggle \"Custom\" in the dialog to block time without attaching a customer — useful for a walk-in placeholder or blocking your own time for something other than a booking." },
    ],
    keywords: ["walk-in", "manual booking"],
  },
  {
    slug: "rescheduling-bookings",
    categorySlug: "calendar-bookings",
    title: "Rescheduling and resizing bookings",
    summary: "Drag a booking to a new time or staff member, or resize it.",
    blocks: [
      { type: "p", text: "In Day view, drag a booking to a new time or staff column to reschedule it, or drag its edge to resize the duration. Bookzenvo re-checks working hours and blocked time before allowing the move, and shows an Undo option straight after." },
      { type: "note", text: "Bookzenvo filters out times that clash with an existing booking or blocked time as you browse the calendar. Your public booking page also double-checks on the server the instant a client confirms, so two clients can't both grab the same slot even if they were looking at it at the same time." },
    ],
    keywords: ["drag", "resize", "move booking"],
  },
  {
    slug: "booking-statuses",
    categorySlug: "calendar-bookings",
    title: "Booking statuses explained",
    summary: "What each status means and how to change it.",
    blocks: [
      { type: "list", items: [
        "Pending — created but not yet confirmed",
        "Confirmed — locked in",
        "Checked in — the client has arrived",
        "In progress — the appointment is underway",
        "Completed — finished (this is what feeds your reports and revenue)",
        "Cancelled",
        "No-show",
      ] },
      { type: "p", text: "Open a booking to change its status from the status grid in the detail dialog, or use the Cancel button." },
    ],
  },
  {
    slug: "bookings-list",
    categorySlug: "calendar-bookings",
    title: "Managing bookings from the Bookings list",
    summary: "A searchable, filterable table view — an alternative to the calendar.",
    blocks: [
      { type: "p", text: "The Bookings page lists appointments as a flat, searchable table rather than a calendar grid. Search by client name, email, phone or service, and filter by period (Upcoming, Past, All time) or status. It shows up to 200 results at a time." },
      { type: "p", text: "Clicking a row opens the same booking detail dialog you'd get from the calendar, with the same status and cancel controls." },
    ],
  },
  {
    slug: "notifications",
    categorySlug: "calendar-bookings",
    title: "Notifications",
    summary: "What Bookzenvo currently notifies you about.",
    blocks: [
      { type: "p", text: "The bell icon in the sidebar notifies you, the business owner, whenever a booking is created or cancelled." },
      { type: "note", text: "Automatic email or SMS confirmations and reminders to clients aren't available yet. The \"send confirmation\" option you'll see in the booking dialog is reserved for when that's switched on — for now, it's worth confirming appointment details with new clients yourself." },
    ],
    keywords: ["reminders", "email", "sms", "bell"],
  },

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------
  {
    slug: "customer-list",
    categorySlug: "customers",
    title: "Understanding your customer list",
    summary: "How your client book builds itself, and what you can add to it.",
    blocks: [
      { type: "p", text: "Customer records build themselves automatically from bookings — Bookzenvo matches new bookings to an existing customer by email or phone, or creates a new record. You can also add or edit customers by hand from the Customers page." },
      { type: "p", text: "Each record holds name, email, phone, address, a photo and private notes (never visible to the customer themselves). Opening a customer shows their visit count, total spend, average spend and favourite service, all calculated from their real booking history, alongside Upcoming and History tabs." },
    ],
  },
  {
    slug: "customer-portal",
    categorySlug: "customers",
    title: "The customer portal: what clients can do",
    summary: "A self-serve area where clients manage their own bookings.",
    blocks: [
      { type: "p", text: "Clients have their own self-serve area at /portal, separate from your dashboard. They sign in with just their email and a one-time 6-digit code — no password, and no separate sign-up step." },
      { type: "p", text: "From there, they can:" },
      { type: "list", items: [
        "View upcoming and past bookings",
        "Cancel or reschedule an upcoming booking, as long as it's outside your cancellation window (24 hours by default)",
        "Update their name and phone number",
        "Request an export of their data, or request account deletion",
      ] },
      { type: "note", text: "Data export and deletion requests don't happen automatically — they show up as a pending-requests banner on your Customers page for you to action. Since automatic booking-confirmation emails aren't wired up yet, clients need to know to visit /portal themselves rather than following a link from a confirmation email." },
    ],
    keywords: ["portal", "self-serve", "reschedule", "cancel", "gdpr", "otp"],
  },
  {
    slug: "merging-duplicate-customers",
    categorySlug: "customers",
    title: "Merging duplicate customer records",
    summary: "Combine two records for the same client into one.",
    blocks: [
      { type: "p", text: "If the same client ends up with two records — for example, they booked once under a different email — open one of the records from the Customers page and use the merge option to combine their booking history into a single customer." },
    ],
  },

  // ---------------------------------------------------------------------
  // Stock
  // ---------------------------------------------------------------------
  {
    slug: "tracking-inventory",
    categorySlug: "stock",
    title: "Tracking inventory",
    summary: "Add products, track quantities and log restocks.",
    blocks: [
      { type: "p", text: "Add products from the Stock page: name, brand, unit (ml, g, unit, bottle, or your own), starting stock, a low-stock threshold, and cost." },
      { type: "note", text: "If you leave the low-stock threshold blank on a new item, it's set automatically to 20% of your starting stock." },
      { type: "p", text: "Adjust quantities with the quick +/- buttons on each item, or open \"Adjust\" for quick deltas (+50, +10, -5, -1) or a custom signed amount. You can also edit or delete an item entirely." },
      { type: "note", text: "There's no adjustment history log — each adjustment simply updates the current quantity, so it's worth keeping your own restock records if you need an audit trail." },
    ],
  },
  {
    slug: "stock-status-alerts",
    categorySlug: "stock",
    title: "Understanding stock status",
    summary: "What Healthy, Running low and Out of stock mean.",
    blocks: [
      { type: "list", items: [
        "Healthy — stock is above your low-stock threshold.",
        "Running low — stock is at or below your low-stock threshold.",
        "Out of stock — stock is at zero or below.",
      ] },
      { type: "p", text: "The top of the Stock page shows summary cards for products tracked, items needing attention, and total inventory value (quantity × cost across all products)." },
      { type: "note", text: "Completing a booking does not automatically deduct stock, even if products are linked to that service — you'll need to adjust quantities yourself as you use them." },
    ],
    keywords: ["low stock", "out of stock", "alerts"],
  },
  {
    slug: "profitable-services",
    categorySlug: "stock",
    title: "Seeing which services are most profitable",
    summary: "Compare service price against product cost to see real margins.",
    blocks: [
      { type: "p", text: "If you've linked products to your services (see \"Linking products to services\"), the Stock page shows \"Most profitable services\" and \"Least profitable services\" cards, calculated as service price minus the cost of products used." },
    ],
    keywords: ["margin", "profit"],
  },

  // ---------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------
  {
    slug: "connect-stripe",
    categorySlug: "payments",
    title: "Connecting Stripe to accept payments",
    summary: "Set up Stripe so clients can pay online when they book.",
    blocks: [
      { type: "p", text: "Go to Settings → Payments and click \"Connect Stripe.\" This creates a Stripe Express account and takes you to Stripe's own onboarding flow to enter your business and payout details. Once you're done, you're returned to Bookzenvo." },
      { type: "p", text: "Your connection status shows as Not connected, Setup needed, or Ready. If it looks stuck, use the Refresh button to re-check your status with Stripe." },
    ],
    keywords: ["stripe connect", "onboarding"],
  },
  {
    slug: "deposits",
    categorySlug: "payments",
    title: "Setting up deposits or full payment",
    summary: "Choose whether bookings require a deposit, full payment, or nothing upfront.",
    blocks: [
      { type: "p", text: "Once Stripe is connected, choose a payment mode under Settings → Payments:" },
      { type: "list", items: [
        "None — take payment in person, as usual.",
        "Deposit — clients pay a percentage upfront (1–100%, defaulting to 30%) when they book.",
        "Full payment — clients pay the full service price upfront.",
      ] },
      { type: "note", text: "This is a single setting for your whole business — you can't currently set a different deposit percentage per service." },
      { type: "p", text: "When a client books, Bookzenvo creates a Stripe Checkout session for the right amount and confirms the booking automatically once payment succeeds." },
    ],
  },
  {
    slug: "payment-statuses",
    categorySlug: "payments",
    title: "Understanding payment statuses",
    summary: "What each status on the Payments page means.",
    blocks: [
      { type: "p", text: "The Payments page lists your bookings with their payment status: Paid, Deposit paid, Unpaid, Pending, Refunded, Partially refunded, or Failed. Two summary cards show what's been collected this month and what's still outstanding." },
      { type: "p", text: "Click any booking to see a breakdown of the service price, amount collected, and amount remaining." },
    ],
  },

  // ---------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------
  {
    slug: "understanding-reports",
    categorySlug: "reports",
    title: "Understanding your reports",
    summary: "Revenue, bookings, staff earnings and service performance in one place.",
    blocks: [
      { type: "p", text: "Reports gives you deep-dive numbers for your accountant, payroll, or your own records. Pick a date range — This month, Last month, This quarter, Tax year (the calendar year from January 1st to today, not a fiscal year), or a custom range — and compare it against the previous period or the same period last year." },
      { type: "list", items: [
        "Top stat cards — Revenue, Bookings and Average booking value, with a trend against your comparison period.",
        "Staff earnings — bookings, hours booked, average per booking and revenue for each staff member.",
        "Services breakdown — bookings, list price and revenue for each service.",
      ] },
      { type: "note", text: "Revenue figures reflect the listed price of bookings, not necessarily what's actually been collected via Stripe — check Payments for collection status." },
    ],
  },
  {
    slug: "exporting-reports",
    categorySlug: "reports",
    title: "Exporting and printing reports",
    summary: "Download a CSV or print a clean summary for the period.",
    blocks: [
      { type: "p", text: "Both the staff earnings and services breakdown tables have their own CSV export button. For a single clean document, use \"Print / Save PDF,\" which produces a condensed summary — business name, date range, and your top stats, staff table and services table — ready to print or save as a PDF." },
    ],
  },

  // ---------------------------------------------------------------------
  // Settings & Branding
  // ---------------------------------------------------------------------
  {
    slug: "business-profile",
    categorySlug: "settings-branding",
    title: "Setting up your business profile",
    summary: "Your business name, contact details and socials.",
    blocks: [
      { type: "p", text: "Under Settings → Business, set your business name, timezone, contact email and phone, website, address, description and social handles (Instagram, Facebook, TikTok, Twitter)." },
    ],
  },
  {
    slug: "business-hours",
    categorySlug: "settings-branding",
    title: "Business hours and holiday closures",
    summary: "Set your general opening hours and whole-business closures.",
    blocks: [
      { type: "p", text: "Under Settings → Hours, set opening and closing times for each day of the week — you can add multiple periods per day for a split shift (e.g. closed over lunch)." },
      { type: "p", text: "Use the Holiday closures section to block off date ranges when your whole business is shut, such as bank holidays or a team trip." },
      { type: "note", text: "These are your default hours — an individual staff member's own working hours (set on their profile) override these for that person." },
    ],
  },
  {
    slug: "branding-moved",
    categorySlug: "settings-branding",
    title: "Branding your booking page",
    summary: "Where your colors, fonts and logo actually live now.",
    blocks: [
      { type: "p", text: "The Branding tab in Settings is a signpost, not an editor — your booking page's colors, fonts, button style and logo are all set in Page Builder → Design. See \"Customizing colors, fonts and buttons\" for the full walkthrough." },
    ],
    keywords: ["colors", "logo", "theme"],
  },
  {
    slug: "gallery-page-content",
    categorySlug: "settings-branding",
    title: "Gallery and page content",
    summary: "Manage your photo gallery and the wording on your booking page.",
    blocks: [
      { type: "p", text: "Settings → Gallery is where you manage the photos used on your public booking page." },
      { type: "p", text: "Settings → Page content lets you edit the text and copy shown on your booking page." },
    ],
  },
  {
    slug: "white-label",
    categorySlug: "settings-branding",
    title: "White-label: custom domain and email branding",
    summary: "Use your own domain and brand your outgoing emails.",
    blocks: [
      { type: "p", text: "Settings → White-label lets you point your own domain at your booking page — add a CNAME record to cname.bookzenvo.com and Bookzenvo handles SSL automatically." },
      { type: "list", items: [
        "A custom favicon and browser tab title",
        "A logo and footer text for booking-related emails",
      ] },
      { type: "note", text: "\"Hide powered by Bookzenvo\" is a premium option within this tab." },
    ],
    keywords: ["custom domain", "cname", "favicon", "white label"],
  },
  {
    slug: "chair-rental-permissions",
    categorySlug: "settings-branding",
    title: "Chair rental permissions",
    summary: "Control what an independent professional can do on your calendar and page.",
    blocks: [
      { type: "p", text: "If you have independent professionals linked to your business (see \"Independent professionals & chair rentals\"), a Chair rentals tab appears in Settings. For each professional, you can toggle whether they appear on your calendar, whether they're listed on your public booking page, and whether your team can book or reschedule on their behalf." },
    ],
  },

  // ---------------------------------------------------------------------
  // Account & Security
  // ---------------------------------------------------------------------
  {
    slug: "reset-password",
    categorySlug: "account-security",
    title: "Resetting your password",
    summary: "Reset from the sign-in page, or from your account settings.",
    blocks: [
      { type: "p", text: "Two ways to reset your password:" },
      { type: "list", items: [
        "From the sign-in page, choose the forgot-password option and enter your email.",
        "While signed in, go to Settings → Account and click \"Reset password.\"",
      ] },
      { type: "p", text: "Either way, you'll get an email with a link that takes you to a screen to set a new password." },
    ],
  },
  {
    slug: "two-factor-authentication",
    categorySlug: "account-security",
    title: "Setting up two-factor authentication (2FA)",
    summary: "Add an authenticator-app code requirement to your sign-ins.",
    blocks: [
      { type: "p", text: "Go to Settings → Account → Security and click Enable to turn on 2FA." },
      { type: "steps", items: [
        "Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy or similar), or enter the shown secret manually.",
        "Enter the 6-digit code your app generates.",
        "Click \"Verify & enable.\"",
      ] },
      { type: "p", text: "After that, signing in will prompt you for a fresh 6-digit code before you can access your workspace. If you're stuck without your authenticator, you can sign out and try again from the sign-in page." },
      { type: "note", text: "There are currently no backup recovery codes, so make sure your authenticator app is backed up. You can turn 2FA off again any time from the same Security section." },
    ],
    keywords: ["mfa", "totp", "authenticator", "qr code", "two-step", "security"],
  },
  {
    slug: "cookies-privacy",
    categorySlug: "account-security",
    title: "Cookies and privacy on Bookzenvo",
    summary: "What Bookzenvo stores in your browser, and how to manage it.",
    blocks: [
      { type: "p", text: "Bookzenvo only uses strictly-necessary cookies and local storage — there's no analytics or advertising tracking. The cookie banner appears on public pages, like the marketing site and booking pages, not inside your dashboard." },
      { type: "p", text: "You can Accept all, Reject non-essential, or open \"Manage preferences\" for more detail. Since only strictly-necessary storage is used, there's a single always-on toggle for it. You can revisit your choice any time via the \"Cookie settings\" link in the site footer." },
    ],
    keywords: ["cookie", "gdpr", "tracking", "consent"],
  },

  // ---------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------
  {
    slug: "importing-your-data",
    categorySlug: "import",
    title: "Importing your data from another booking system",
    summary: "Bring your team, clients, services and appointment history into Bookzenvo.",
    blocks: [
      { type: "p", text: "Open Import data from the sidebar. You'll import in four steps, in this order: Team, Clients, Services, then Appointments — appointments are imported last so they can be matched to the team and clients you've already brought in." },
      { type: "steps", items: [
        "Export a CSV from your current system.",
        "Drag and drop (or browse to) the file for the step you're on.",
        "Bookzenvo auto-matches your file's columns to the right fields — if something isn't recognized, map it manually.",
        "Review the preview table, which shows row counts and anything that will be skipped.",
        "Click \"Import\" to commit that step, then move to the next.",
      ] },
      { type: "p", text: "Fresha exports are matched automatically with no manual mapping needed. Exports from Square, Vagaro, Booksy, Acuity/Squarespace Scheduling, Timely, GlossGenius, Mindbody, SimplyBook.me, Setmore and similar tools usually auto-map too, since their column headers tend to be similar — anything unrecognized just needs a quick manual pick." },
      { type: "p", text: "You can import staff, clients, services and appointment/booking history." },
    ],
    keywords: ["migrate", "csv", "fresha", "square", "vagaro", "booksy", "acuity", "timely", "glossgenius", "mindbody", "switch"],
  },
  {
    slug: "undo-an-import",
    categorySlug: "import",
    title: "Undoing an import",
    summary: "Every import can be rolled back from your import history.",
    blocks: [
      { type: "p", text: "Every import you run is saved as a batch in the Import history panel. If something came in wrong, click Undo on that batch to roll it back." },
      { type: "note", text: "If you accidentally upload the same file twice, Bookzenvo recognizes it and warns you before letting you re-import it." },
    ],
    keywords: ["rollback", "undo", "mistake"],
  },
];
