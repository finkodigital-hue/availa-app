import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/cookie-policy")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Bookzenvo" },
      { name: "description", content: "Cookie Policy for Bookzenvo." },
    ],
  }),
  component: CookiePolicyPage,
});

function CookiePolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookie Policy"
      intro="This policy explains the small amount of browser storage Bookzenvo uses and how you can control it."
      sections={[
        {
          title: "What we use",
          content: (
            <>
              <p>
                Bookzenvo currently uses only strictly necessary cookies and local storage. These
                help the site work safely, keep a user signed in, remember cookie choices and
                support essential booking and account functions.
              </p>
              <p>
                We do not currently use advertising, tracking or third-party analytics cookies on
                the public Bookzenvo website.
              </p>
            </>
          ),
        },
        {
          title: "Why they are needed",
          content: (
            <p>
              Necessary storage helps protect accounts, maintain a logged-in session, prevent misuse
              of booking forms and remember whether you have made a cookie choice. Without it,
              important parts of Bookzenvo may not work correctly.
            </p>
          ),
        },
        {
          title: "Your choices",
          content: (
            <p>
              You can use the Cookie settings option in the Bookzenvo footer to review your choice
              at any time. You can also remove browser storage through your browser settings,
              although this may sign you out or reset saved preferences.
            </p>
          ),
        },
        {
          title: "Changes to this policy",
          content: (
            <p>
              If we introduce optional analytics or marketing cookies in the future, we will update
              this policy and ask for consent before using them.
            </p>
          ),
        },
        {
          title: "Questions",
          content: (
            <p>
              For questions about cookies or privacy, visit the{" "}
              <Link to="/help" className="underline underline-offset-4 hover:text-foreground">
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
