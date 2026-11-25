import { createFileRoute } from "@tanstack/react-router";
import { AccountDataPage } from "@/components/account-data-page";

// Deliberately outside the workspace layout: staff, plan-blocked accounts and
// people without a business must retain access to their own account request.
export const Route = createFileRoute("/account-data")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Account & data · Bookzenvo" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountDataPage,
});
