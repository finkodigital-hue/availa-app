import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const legalLink =
  "underline underline-offset-4 decoration-border hover:text-foreground transition-colors";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Cancellation and Refund Policy — Bookzenvo" },
      {
        name: "description",
        content:
          "How cancellations and refunds work for Bookzenvo subscriptions and appointments.",
      },
    ],
    links: [{ rel: "canonical", href: "https://bookzenvo.com/refund-policy" }],
  }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cancellation and Refund Policy"
      intro="This policy separates Bookzenvo subscription charges from appointment payments collected by independent businesses using the platform."
      lastUpdated="8 September 2026"
      sections={[
        {
          title: "1. Bookzenvo subscriptions",
          content: (
            <>
              <p>
                Paid Bookzenvo plans renew for the billing period shown at
                checkout until the business cancels. A business can cancel
                through the Stripe billing portal in Bookzenvo. Cancellation
                normally takes effect at the end of the current paid period, and
                access to paid features continues until then.
              </p>
              <p>
                Fees already charged are normally non-refundable, except where
                the checkout terms say otherwise or applicable law requires a
                refund. This does not restrict any statutory right or remedy
                that cannot lawfully be excluded. If a charge appears incorrect,
                contact us promptly through the Help Centre with the account
                email, invoice date and amount.
              </p>
            </>
          ),
        },
        {
          title: "2. Appointment payments",
          content: (
            <>
              <p>
                An appointment is supplied by the salon or other business named
                on its booking page, not by Bookzenvo. That business sets and
                displays its own cancellation, deposit, no-show and refund terms
                before booking. Questions or requests about an appointment
                payment must be sent to that business first using the contact
                details on its booking page or confirmation.
              </p>
              <p>
                A business policy cannot remove consumer rights that apply by
                law. Where a business approves an online-payment refund, it can
                return the supported charge to the original payment method
                through Stripe. Bank processing times are outside
                Bookzenvo&apos;s control.
              </p>
            </>
          ),
        },
        {
          title: "3. Cancelling an appointment",
          content: (
            <p>
              Clients can use the cancellation or rescheduling route offered in
              their confirmation or portal while it is available. Inside the
              business&apos;s stated cancellation window, the client must
              contact the business directly. Cancelling an appointment does not
              automatically issue a refund; the supplying business decides the
              refund under its disclosed policy and applicable law.
            </p>
          ),
        },
        {
          title: "4. Chargebacks and complaints",
          content: (
            <p>
              Please contact the relevant business or Bookzenvo before starting
              a payment dispute so the charge can be identified and the issue
              can be investigated. Nothing here prevents a cardholder from using
              rights provided by their card issuer or law. For Bookzenvo
              subscription questions, use the{" "}
              <Link to="/help" className={legalLink}>
                Help Centre
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
