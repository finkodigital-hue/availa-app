import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const legalLink =
  "underline underline-offset-4 decoration-border hover:text-foreground transition-colors";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Bookzenvo" },
      {
        name: "description",
        content: "How Bookzenvo collects, uses, shares and protects personal information.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This policy explains how Bookzenvo handles personal information for business accounts, booking clients, website visitors, support users and people recorded in a Bookzenvo workspace."
      sections={[
        {
          title: "1. Who is responsible for your information",
          content: (
            <>
              <p>
                Bookzenvo is responsible for account administration, product operation, security,
                support, subscription billing and its own website. Contact us at{" "}
                <a href="mailto:help@finkodigital.com" className={legalLink}>
                  help@finkodigital.com
                </a>
                .
              </p>
              <p>
                When a salon or other business uses Bookzenvo to manage its clients, staff and
                bookings, that business normally decides why and how the information is used and is
                the controller. Bookzenvo acts as its processor and provides the technology. Contact
                the business first about its appointment records, notes or marketing.
              </p>
            </>
          ),
        },
        {
          title: "2. Information we collect",
          content: (
            <>
              <p>
                Account and business information may include names, email addresses, telephone
                numbers, login and verification records, business details, staff roles,
                availability, service settings, subscription status and support messages.
              </p>
              <p>
                Booking and client information may include names, contact details, appointment
                history, requested services, assigned staff, prices, payment status, cancellation
                activity, preferences, addresses and notes entered by the client or business. Notes
                may contain allergy, health or other sensitive information where a business chooses
                to record it and has a lawful reason to do so.
              </p>
              <p>
                Product content may include logos, staff photographs, salon gallery images, page
                text, reviews, stock details and stock-scan photographs. We also process limited
                technical information such as browser and device data, IP address, timestamps,
                security events, error records and cookie or local-storage preferences.
              </p>
            </>
          ),
        },
        {
          title: "3. Where information comes from",
          content: (
            <>
              <p>
                We receive information directly from account holders and booking clients, from team
                members authorised by a business, and from files a business chooses to import from
                another booking provider. We also receive payment and account-status information
                from Stripe and technical information automatically when the service is used.
              </p>
              <p>
                A business is responsible for telling people when it imports their information into
                Bookzenvo and for ensuring the import is lawful and accurate.
              </p>
            </>
          ),
        },
        {
          title: "4. Why we use information and our lawful bases",
          content: (
            <>
              <p>
                We use information to create and secure accounts; provide booking, scheduling,
                client, stock, payment-reference, page and reporting features; send requested
                confirmations and reminders; provide support; process subscriptions; prevent fraud
                and misuse; diagnose faults; comply with law; and improve service reliability.
              </p>
              <p>
                Depending on the activity, we rely on performance of a contract, legitimate
                interests in operating and protecting Bookzenvo, compliance with legal obligations,
                or consent where the law requires it. A business using client or staff information
                chooses and is responsible for its own lawful basis and any additional condition
                needed for sensitive information.
              </p>
              <p>
                We do not sell personal information and do not use booking-client information for
                Bookzenvo advertising. We do not make solely automated decisions about individuals
                that produce legal or similarly significant effects.
              </p>
            </>
          ),
        },
        {
          title: "5. AI-assisted processing",
          content: (
            <>
              <p>
                Optional AI tools use Anthropic&apos;s commercial API. Depending on the feature, we
                may send an owner&apos;s prompt, a temporary screenshot of the public booking page,
                a stock photograph, or a limited summary of live business information needed to
                answer the request. The summary can include operational booking data and client or
                staff names where relevant.
              </p>
              <p>
                A stock photograph is compressed and sent for analysis. Bookzenvo does not add it to
                the salon gallery or save it as a stock photograph. The suggested products stay
                editable and nothing changes until the owner reviews and applies the draft. Page
                changes are also presented for review.
              </p>
              <p>
                Anthropic states that commercial API inputs and outputs are not used to train its
                models by default and are normally deleted from its backend within 30 days, subject
                to safety, legal or separately agreed retention. Read the{" "}
                <a
                  href="https://privacy.anthropic.com/"
                  target="_blank"
                  rel="noreferrer"
                  className={legalLink}
                >
                  Anthropic Privacy Centre
                </a>{" "}
                for current details. Businesses should avoid including unnecessary personal or
                sensitive information in AI prompts and images.
              </p>
            </>
          ),
        },
        {
          title: "6. Who we share information with",
          content: (
            <>
              <p>
                We share only what is needed with service providers that help operate Bookzenvo,
                including Supabase for database, storage and authentication; Cloudflare for hosting
                and network security; Stripe for subscription and appointment payments; Resend for
                booking emails; and Anthropic for optional AI features.
              </p>
              <p>
                We may also disclose information to professional advisers, regulators, courts, law
                enforcement or another party where required by law, needed to protect rights and
                safety, or as part of a properly managed business sale or reorganisation. Payment
                information supplied to Stripe is also handled under the{" "}
                <a
                  href="https://stripe.com/gb/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className={legalLink}
                >
                  Stripe Privacy Policy
                </a>
                .
              </p>
            </>
          ),
        },
        {
          title: "7. International transfers",
          content: (
            <p>
              Some providers process information outside the United Kingdom. Where required, we use
              recognised safeguards such as UK adequacy regulations, the UK International Data
              Transfer Agreement or the UK Addendum to approved standard contractual clauses. You
              can contact us for more information about safeguards relevant to your data.
            </p>
          ),
        },
        {
          title: "8. How long we keep information",
          content: (
            <>
              <p>
                We keep active account and workspace information while the account is open and as
                needed to provide the service. If an owner permanently deletes a workspace, active
                Bookzenvo database records and uploaded business files are deleted, subject to
                secure provider backup cycles, fraud and security records, unresolved disputes, and
                information we must keep for legal, tax or accounting reasons.
              </p>
              <p>
                Support, payment and security records are kept only for as long as reasonably needed
                for the purpose collected and applicable legal limitation or record-keeping periods.
                A salon may keep its client and booking records for a period it chooses; contact the
                salon about its retention policy. Stripe and other providers keep their independent
                records under their own policies.
              </p>
            </>
          ),
        },
        {
          title: "9. Your rights",
          content: (
            <>
              <p>
                UK data-protection law may give you rights to access, correct or erase information;
                restrict or object to processing; receive certain information in a portable format;
                and withdraw consent where processing relies on consent. These rights can depend on
                the circumstances and lawful basis.
              </p>
              <p>
                For information controlled by a salon, contact that salon first. For a Bookzenvo
                account or platform matter, use the{" "}
                <Link to="/help" className={legalLink}>
                  Help Centre
                </Link>{" "}
                or email{" "}
                <a href="mailto:help@finkodigital.com" className={legalLink}>
                  help@finkodigital.com
                </a>
                . We may need to verify your identity. You may also complain to the{" "}
                <a
                  href="https://ico.org.uk/make-a-complaint/"
                  target="_blank"
                  rel="noreferrer"
                  className={legalLink}
                >
                  UK Information Commissioner&apos;s Office
                </a>
                .
              </p>
            </>
          ),
        },
        {
          title: "10. Security, cookies and changes",
          content: (
            <>
              <p>
                We use access controls, encryption in transit, tenant separation, restricted service
                credentials and monitoring intended to protect information. No system can be
                guaranteed completely secure. Account holders should use strong, unique credentials
                and keep authorised-user access current.
              </p>
              <p>
                Bookzenvo currently uses only essential cookies and local storage. See the{" "}
                <Link to="/cookie-policy" className={legalLink}>
                  Cookie Policy
                </Link>{" "}
                for details. We may update this policy when the product, providers or law changes.
                We will take reasonable steps to highlight material changes.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
