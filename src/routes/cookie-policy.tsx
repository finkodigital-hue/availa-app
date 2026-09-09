import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/cookie-policy")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — Bookzenvo" },
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
                Bookzenvo currently uses only strictly necessary cookies and local storage. This
                storage helps the site work safely, keeps signed-in sessions working, remembers
                that a visitor has seen the cookie notice, and preserves an account holder&apos;s
                sidebar preference.
              </p>
              <p>
                We do not currently use advertising, tracking or third-party analytics cookies on
                the public Bookzenvo website.
              </p>
            </>
          ),
        },
        {
          title: "Storage currently in use",
          content: (
            <>
              <p>
                <strong>bookzenvo-auth</strong> is local storage used by our authentication
                provider to maintain a signed-in session. It remains until you sign out, the
                session expires or you clear browser storage.
              </p>
              <p>
                <strong>bz_cookie_consent</strong> is local storage that remembers that you have
                seen our cookie notice. It remains until the notice changes or you clear browser
                storage.
              </p>
              <p>
                <strong>sidebar_state</strong> is a cookie that remembers whether an account
                holder&apos;s dashboard sidebar is open or closed. It expires after seven days.
              </p>
              <p>
                The exact authentication records may change as sessions refresh, but their purpose
                remains account access and security. Without necessary storage, parts of Bookzenvo
                may not work correctly.
              </p>
            </>
          ),
        },
        {
          title: "Your choices",
          content: (
            <p>
              You can use Cookie settings in the Bookzenvo footer to review this information at any
              time. You can also remove browser storage through your browser settings, although
              this may sign you out, show the notice again or reset saved preferences.
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
