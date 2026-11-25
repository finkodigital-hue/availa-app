import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlanSettings } from "../../src/components/plan-settings";
import { StudioUpgradePanel } from "../../src/components/studio-upgrade-panel";
import { StripeSettings } from "../../src/components/stripe-settings";
import { StockAiScanner } from "../../src/components/stock-ai-scanner";
import { AskClaudeSection } from "../../src/components/page-builder/ask-claude-section";
import { parseTheme } from "../../src/lib/theme";
import { Toaster } from "sonner";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const plan = params.get("plan") === "studio" ? "studio" : "free";
const business = {
  id: "fictional-business",
  name: "Fictional salon",
  plan,
  ...(params.get("merchant") === "ready"
    ? { stripe_account_id: "acct_fixture", stripe_charges_enabled: true }
    : {}),
  ...(plan === "studio"
    ? {
        stripe_subscription_id: "sub_fixture",
        stripe_subscription_status: "active",
      }
    : {}),
};
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <main className="mx-auto max-w-3xl space-y-5 p-5">
      <PlanSettings business={business} />
      <StudioUpgradePanel
        title="Reports"
        description="Upgrade to Studio to use reports and insights."
      />
      <AskClaudeSection
        business={{
          id: business.id,
          name: business.name,
          description: null,
          address: null,
          phone: null,
          website: null,
        }}
        theme={parseTheme(null)}
        blocks={[]}
        plan="free"
        open
        onOpenChange={() => {}}
        onAccept={() => {}}
      />
      <StockAiScanner
        businessId={business.id}
        plan="free"
        categories={[]}
        existingItems={[]}
        onApply={async () => {}}
      />
      <StripeSettings business={business} />
    </main>
    <Toaster />
  </QueryClientProvider>,
);
