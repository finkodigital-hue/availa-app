import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

const legalLink =
  "underline underline-offset-4 decoration-border hover:text-foreground transition-colors";

export const Route = createFileRoute("/review-policy")({
  head: () => ({
    meta: [
      { title: "Review Policy — Bookzenvo" },
      {
        name: "description",
        content:
          "How verified customer reviews are collected, published and moderated.",
      },
    ],
    links: [{ rel: "canonical", href: "https://bookzenvo.com/review-policy" }],
  }),
  component: ReviewPolicyPage,
});

function ReviewPolicyPage() {
  return (
    <LegalPage
      eyebrow="Trust and safety"
      title="Customer Review Policy"
      intro="This policy explains who can leave a Bookzenvo review, what is published, and the limited circumstances in which a review may be removed."
      sections={[
        {
          title: "1. Who can leave a review",
          content: (
            <p>
              Bookzenvo sends a private, single-use review link only after an
              appointment is marked completed. One review can be submitted for
              each booking. This is why reviews created through Bookzenvo carry
              a verified booking label.
            </p>
          ),
        },
        {
          title: "2. Honest reviews are welcome",
          content: (
            <>
              <p>
                Customers may leave positive, neutral or negative feedback.
                Reviews should be honest, based on the reviewer&apos;s own
                appointment and useful to future customers. Businesses must not
                pressure customers to leave a particular rating or offer an
                undisclosed reward for a favourable review.
              </p>
              <p>
                A business cannot edit a customer&apos;s rating or words and
                cannot remove a genuine review merely because it is critical or
                lowers its score.
              </p>
            </>
          ),
        },
        {
          title: "3. What appears publicly",
          content: (
            <p>
              Before submitting, the customer must agree to publication. The
              booking page displays the rating, review text, first name, surname
              initial, date, relevant service and a verified booking label. The
              full name and linked booking are visible to the business for
              verification but are not shown publicly.
            </p>
          ),
        },
        {
          title: "4. Content that may be removed",
          content: (
            <>
              <p>A review may be removed from public view only when it:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>is withdrawn by the customer who submitted it;</li>
                <li>
                  reveals personal or sensitive information that should not be
                  public;
                </li>
                <li>
                  contains threats, hate, harassment or potentially unlawful
                  content;
                </li>
                <li>
                  is not about the appointment or service being reviewed; or
                </li>
                <li>
                  shows credible signs of manipulation, impersonation or fraud.
                </li>
              </ul>
              <p>
                Businesses must choose a policy reason and record an
                explanation. Bookzenvo keeps an audit history of removals and
                restorations. Content should be restored when the removal reason
                no longer applies.
              </p>
            </>
          ),
        },
        {
          title: "5. Corrections, removal requests and complaints",
          content: (
            <>
              <p>
                Reviews cannot be silently edited after submission. A customer
                who shared personal information, made a mistake or wants to
                withdraw publication should contact the business shown on the
                booking page. The business can remove the review while the issue
                is considered.
              </p>
              <p>
                If a review or moderation decision appears to break this policy,
                contact Bookzenvo through the{" "}
                <Link to="/help" className={legalLink}>
                  Help Centre
                </Link>
                . Include the business name and enough detail to locate the
                review, but do not send unnecessary sensitive information.
              </p>
            </>
          ),
        },
        {
          title: "6. Reviews from other platforms",
          content: (
            <p>
              Bookzenvo does not currently import or republish reviews from
              Google or previous booking systems. If that feature is added,
              imported reviews will be obtained through an authorised method,
              clearly labelled with their source and kept separate from
              Bookzenvo verified booking reviews.
            </p>
          ),
        },
        {
          title: "7. Privacy",
          content: (
            <p>
              The collection and use of reviewer information is explained in the{" "}
              <Link to="/privacy" className={legalLink}>
                Privacy Policy
              </Link>
              . Customers can ask the relevant business about their information
              or contact Bookzenvo for a platform issue.
            </p>
          ),
        },
      ]}
    />
  );
}
