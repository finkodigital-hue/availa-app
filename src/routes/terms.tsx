import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Bookzenvo" },
      { name: "description", content: "Terms of Service for using Bookzenvo." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms explain the rules for using Bookzenvo as a business owner or a client booking an appointment through a Bookzenvo booking page."
      sections={[
        {
          title: "Using Bookzenvo",
          content: (
            <>
              <p>
                Bookzenvo provides online booking, client management and related tools for service
                businesses. You must use the service lawfully and keep your account information
                accurate and secure.
              </p>
              <p>
                You are responsible for activity on your account. Do not attempt to interfere with
                the platform, access another business&apos;s data, or use the service to send spam
                or unlawful content.
              </p>
            </>
          ),
        },
        {
          title: "Business owners",
          content: (
            <>
              <p>
                If you create a Bookzenvo workspace, you are responsible for the information you
                publish, including your services, prices, availability, cancellation rules and
                booking-page content.
              </p>
              <p>
                You must have the right to process the client data you add to Bookzenvo and must
                provide your clients with any notices required by law. You remain responsible for
                services supplied to your clients, including refunds, complaints and fulfilment.
              </p>
            </>
          ),
        },
        {
          title: "Client bookings and payments",
          content: (
            <>
              <p>
                When a client books with a business using Bookzenvo, the booking is with that
                business, not with Bookzenvo. The business sets the service, price, cancellation
                policy and any payment requirement.
              </p>
              <p>
                Payments are processed by Stripe or another payment provider selected by the
                business. Bookzenvo does not store full card details. Questions about an
                appointment, a charge or a refund should first be directed to the business that
                accepted the booking.
              </p>
            </>
          ),
        },
        {
          title: "Availability and changes",
          content: (
            <>
              <p>
                We work to keep Bookzenvo available and reliable, but no online service can be
                guaranteed to be uninterrupted. We may update, improve, suspend or remove parts of
                the service where reasonably necessary.
              </p>
              <p>
                We may update these terms from time to time. If a change is material, we will take
                reasonable steps to let active business owners know before it takes effect.
              </p>
            </>
          ),
        },
        {
          title: "Ending access",
          content: (
            <>
              <p>
                You can stop using Bookzenvo at any time. We may suspend or end access where there
                is a serious breach of these terms, a security risk, unlawful use, or a need to
                protect the platform and its users.
              </p>
              <p>
                If you need help with your account, please use the{" "}
                <Link to="/help" className="underline underline-offset-4 hover:text-foreground">
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
