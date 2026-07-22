import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Bookzenvo" },
      { name: "description", content: "Privacy Policy for Bookzenvo." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This policy explains what information Bookzenvo uses, why we use it and the choices available to you."
      sections={[
        {
          title: "Information we use",
          content: (
            <>
              <p>
                We use information provided when an account is created, such as a name, email
                address, business name and account preferences. Businesses using Bookzenvo may also
                add client information such as names, contact details, booking history and
                appointment notes.
              </p>
              <p>
                We also collect limited technical information needed to operate and protect the
                service, such as device, browser, IP address and security logs.
              </p>
            </>
          ),
        },
        {
          title: "How we use it",
          content: (
            <>
              <p>
                We use personal information to provide booking and account features, send requested
                service emails, provide support, prevent fraud and abuse, and improve the
                reliability of Bookzenvo.
              </p>
              <p>
                We do not sell personal information. We only share data with providers needed to run
                Bookzenvo, such as hosting, authentication, email and payment providers, or where
                required by law.
              </p>
            </>
          ),
        },
        {
          title: "Bookings made with a business",
          content: (
            <>
              <p>
                When you book an appointment through a Bookzenvo page, the business you book with
                controls the information it collects and how it uses it. Contact that business
                directly for questions about its services, appointment records, or marketing
                communications.
              </p>
              <p>
                Bookzenvo acts as the technology provider for these booking pages. We process the
                information needed to deliver the booking service on the business&apos;s behalf.
              </p>
            </>
          ),
        },
        {
          title: "Your choices and rights",
          content: (
            <>
              <p>
                You can update much of your account information from within Bookzenvo. Depending on
                where you live, you may also have rights to request access, correction, deletion or
                restriction of your personal information.
              </p>
              <p>
                To make a request or ask a privacy question, please use the{" "}
                <Link to="/help" className="underline underline-offset-4 hover:text-foreground">
                  Help Centre
                </Link>
                .
              </p>
            </>
          ),
        },
        {
          title: "Cookies",
          content: (
            <p>
              We use essential cookies and similar technologies to keep Bookzenvo working, remember
              relevant settings and protect accounts. Where optional cookies are used, you can
              manage your preferences using the Cookie settings link in the site footer.
            </p>
          ),
        },
      ]}
    />
  );
}
