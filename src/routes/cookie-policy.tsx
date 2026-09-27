import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/cookie-policy")({
  head: () => ({
    meta: [
      { title: "Cookie Policy · Bookzenvo" },
      { name: "description", content: "Cookie Policy for Bookzenvo." },
    ],
    links: [{ rel: "canonical", href: "https://bookzenvo.com/cookie-policy" }],
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
          title: "Browser storage we use",
          content: (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead><tr className="border-b"><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Type and duration</th><th className="py-2">Purpose</th></tr></thead>
                <tbody>
                  <tr className="border-b"><td className="py-3 pr-4 font-mono text-xs">bookzenvo-auth</td><td className="py-3 pr-4">Local storage; until sign-out or browser removal</td><td className="py-3">Keeps a signed-in account session on this device.</td></tr>
                  <tr className="border-b"><td className="py-3 pr-4 font-mono text-xs">bz_cookie_consent</td><td className="py-3 pr-4">Local storage; until browser removal or policy reset</td><td className="py-3">Remembers that the cookie notice was acknowledged.</td></tr>
                  <tr><td className="py-3 pr-4 font-mono text-xs">sidebar_state</td><td className="py-3 pr-4">Cookie; 7 days</td><td className="py-3">Remembers whether the signed-in dashboard sidebar is open or collapsed.</td></tr>
                </tbody>
              </table>
            </div>
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
