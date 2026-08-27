import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const legalLink =
  "underline underline-offset-4 decoration-border hover:text-foreground transition-colors";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Bookzenvo" },
      {
        name: "description",
        content: "Terms for businesses and clients using Bookzenvo booking services.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms govern the use of Bookzenvo by business owners, their authorised team members, and clients who book through a Bookzenvo page."
      sections={[
        {
          title: "1. Using Bookzenvo",
          content: (
            <>
              <p>
                Bookzenvo provides booking pages, appointment management, client records, staff
                scheduling, service and stock tools, communications, payments support, reporting,
                page-building and optional AI features for service businesses.
              </p>
              <p>
                You must be at least 18 and able to enter a binding agreement to create a business
                account. If you act for a company or other organisation, you confirm that you have
                authority to accept these terms for it. You must provide accurate information,
                protect account access, and tell us promptly if you suspect unauthorised use.
              </p>
              <p>
                You must not misuse the service, bypass security, access another workspace without
                permission, introduce malicious code, scrape the platform, send spam, or use
                Bookzenvo for unlawful, misleading, discriminatory or infringing activity.
              </p>
            </>
          ),
        },
        {
          title: "2. Business owners and team members",
          content: (
            <>
              <p>
                The business owner controls its workspace and is responsible for authorised team
                members, service descriptions, prices, availability, booking rules, page content,
                stock records, and information entered or imported into Bookzenvo.
              </p>
              <p>
                Businesses remain solely responsible for the services they supply, professional
                qualifications, taxes, receipts, cancellations, refunds, complaints, consumer-law
                notices and any health or safety duties. Bookzenvo is not the salon, practitioner,
                employer or supplier of an appointment.
              </p>
              <p>
                A business must have a lawful basis for every client or staff record it uploads,
                imports or creates. Appointment notes should be relevant and proportionate. Health,
                allergy or other sensitive information must only be recorded where the business has
                a valid legal condition and has given the individual any required notice.
              </p>
            </>
          ),
        },
        {
          title: "3. Client bookings",
          content: (
            <>
              <p>
                A booking made through Bookzenvo is an agreement between the client and the business
                shown on the booking page. The business sets the service, staff member, price,
                availability, cancellation terms and payment requirement.
              </p>
              <p>
                Clients must provide accurate contact and booking information. Questions about an
                appointment, service quality, cancellation, charge or refund should be directed to
                the business first. Nothing in these terms removes rights that cannot lawfully be
                excluded under consumer law.
              </p>
            </>
          ),
        },
        {
          title: "4. Payments and Stripe",
          content: (
            <>
              <p>
                Online appointment payments and Bookzenvo subscriptions are processed by Stripe.
                Bookzenvo does not store full payment-card details. A business connecting payments
                may also enter a direct agreement with Stripe and must provide accurate information
                required for payment processing, verification, disputes, refunds and payouts.
              </p>
              <p>
                Use of connected payment services is subject to the{" "}
                <a
                  href="https://stripe.com/legal/connect-account"
                  target="_blank"
                  rel="noreferrer"
                  className={legalLink}
                >
                  Stripe Connected Account Agreement
                </a>
                , which includes applicable Stripe services terms. You authorise Bookzenvo to share
                account and transaction information with Stripe where needed to enable those
                services. Stripe&apos;s own fees, holds, disputes and payout rules may also apply.
              </p>
            </>
          ),
        },
        {
          title: "5. Plans, billing and cancellation",
          content: (
            <>
              <p>
                Bookzenvo may offer free and paid plans. Current features and prices are shown in
                the product or at checkout. Paid subscriptions renew automatically for the billing
                period shown at checkout until cancelled. Taxes may be added where applicable.
              </p>
              <p>
                A business can manage or cancel a paid plan through the Stripe billing portal in
                Bookzenvo. Cancellation normally takes effect at the end of the paid billing period
                unless checkout says otherwise. Except where law requires a refund, fees already
                charged are non-refundable. We will give reasonable advance notice of material price
                changes for an existing subscription.
              </p>
              <p>
                When a paid plan ends, the workspace may move to the free plan and paid features may
                stop. The business should export any information it needs before closing its
                account; client-list export is available on every plan.
              </p>
            </>
          ),
        },
        {
          title: "6. AI-assisted features",
          content: (
            <>
              <p>
                Some paid-plan tools use Anthropic&apos;s AI services to draft page changes, answer
                questions from business data, or identify possible stock items in a photograph. AI
                output can be incomplete or wrong and is provided as an editable suggestion, not
                professional advice or a guaranteed stock count.
              </p>
              <p>
                The business must review an AI draft before relying on or applying it. Do not place
                unnecessary personal, confidential or sensitive information in an AI prompt or stock
                photograph. Stock photographs should focus on products and should not include
                clients, staff, documents or screens containing personal information.
              </p>
              <p>
                We may change models, introduce reasonable usage limits, or pause an AI feature for
                safety, quality, legal or supplier reasons. AI features do not make solely automated
                decisions with legal or similarly significant effects on clients.
              </p>
            </>
          ),
        },
        {
          title: "7. Content, data and intellectual property",
          content: (
            <>
              <p>
                A business keeps its rights in content and data it submits. It grants Bookzenvo a
                limited licence to host, copy, display, transform and transmit that material only as
                needed to operate, secure and support the service. The business confirms it has the
                rights and permissions needed for uploaded logos, photographs, reviews, text and
                imported records.
              </p>
              <p>
                Bookzenvo and its licensors retain rights in the platform, software, design and
                branding. These terms do not transfer ownership of either party&apos;s intellectual
                property. Feedback may be used to improve the service without identifying the person
                who supplied it.
              </p>
            </>
          ),
        },
        {
          title: "8. Data processing terms for businesses",
          content: (
            <>
              <p>
                For client and staff personal data entered by a business, the business is normally
                the controller and Bookzenvo acts as its processor. The processing covers hosting,
                organising, retrieving, displaying, communicating, backing up and deleting booking,
                client, staff, service, payment-reference, note and uploaded-image data for the life
                of the account.
              </p>
              <p>
                Bookzenvo will process that data on the business&apos;s documented instructions,
                including these terms and use of the product; require confidentiality; use
                appropriate security measures; impose equivalent protections on subprocessors;
                assist reasonably with individual-rights requests, security incidents and legal
                compliance; and delete or return data when the service ends, subject to legal duties
                and secure backup cycles.
              </p>
              <p>
                The business generally authorises the providers needed to run the service, including
                hosting, database, authentication, email, payments and AI providers. We will remain
                responsible for their processing on our behalf, give reasonable notice of a material
                new subprocessor, and allow the business to object on reasonable data-protection
                grounds. We will provide information reasonably needed to demonstrate these
                commitments, tell the business without undue delay of a personal-data breach
                affecting its data, and notify it if we believe an instruction infringes
                data-protection law. The business must not instruct Bookzenvo to process data
                unlawfully.
              </p>
            </>
          ),
        },
        {
          title: "9. Availability, changes and beta features",
          content: (
            <>
              <p>
                We work to keep Bookzenvo secure and available, but no online service is guaranteed
                to be uninterrupted or error-free. Maintenance, internet failures and third-party
                providers may affect availability. Businesses should keep appropriate exports and
                contingency arrangements for time-critical operations.
              </p>
              <p>
                We may update, improve, restrict or retire features where reasonably necessary.
                Preview, beta and AI features may change more often and may be withdrawn. We will
                avoid materially reducing a paid service during a current billing period without a
                reasonable reason or suitable notice.
              </p>
            </>
          ),
        },
        {
          title: "10. Suspension, termination and liability",
          content: (
            <>
              <p>
                A business can stop using Bookzenvo or permanently delete its workspace from account
                settings. Deleting a workspace removes its active Bookzenvo records and uploaded
                files and requests cancellation of any active Bookzenvo subscription, subject to
                provider backup cycles and information that must be retained by law.
              </p>
              <p>
                We may suspend or end access for a serious or repeated breach, non-payment, unlawful
                use, security risk, harm to others, or where a supplier or law prevents continued
                service. Where practical, we will explain the reason and allow a reasonable chance
                to fix a remediable issue.
              </p>
              <p>
                Bookzenvo is not liable for the business&apos;s services, professional decisions, AI
                drafts, customer disputes, or losses caused by inaccurate information supplied by a
                user. To the fullest extent permitted by law, neither party is liable for indirect
                or consequential business loss. Nothing excludes liability that cannot lawfully be
                excluded, including liability for fraud or death or personal injury caused by
                negligence.
              </p>
            </>
          ),
        },
        {
          title: "11. Changes and contact",
          content: (
            <>
              <p>
                We may update these terms to reflect product, supplier or legal changes. If a change
                materially affects an active business account, we will take reasonable steps to
                provide advance notice. Continued use after the effective date means the updated
                terms apply.
              </p>
              <p>
                Questions can be sent to{" "}
                <a href="mailto:help@finkodigital.com" className={legalLink}>
                  help@finkodigital.com
                </a>{" "}
                or through the{" "}
                <Link to="/help" className={legalLink}>
                  Help Centre
                </Link>
                .
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
