type ConnectController = {
  fees?: { payer?: string };
  losses?: { payments?: string };
  requirement_collection?: string;
  stripe_dashboard?: { type?: string };
};

/** This gate only controls onboarding; it never prevents refunds or recovery. */
export function requireConnectOnboardingMode(
  secretKey: string,
  liveOnboardingEnabled: string | undefined,
): "test" | "live" {
  if (/^(?:sk|rk)_test_/.test(secretKey)) return "test";
  if (!/^(?:sk|rk)_live_/.test(secretKey)) {
    throw new Error("Stripe is not configured with a supported server key.");
  }
  if (liveOnboardingEnabled !== "true") {
    throw new Error(
      "Live payment setup is not available yet. Please contact Bookzenvo support.",
    );
  }
  return "live";
}

export function stripeManagedAccountParameters(businessId: string) {
  return {
    country: "GB",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    "controller[fees][payer]": "account",
    "controller[losses][payments]": "stripe",
    "controller[requirement_collection]": "stripe",
    "controller[stripe_dashboard][type]": "full",
    "metadata[business_id]": businessId,
  };
}

export function requireStripeManagedAccount(account: {
  controller?: ConnectController;
}) {
  const controller = account.controller;
  if (
    controller?.fees?.payer !== "account" ||
    controller.losses?.payments !== "stripe" ||
    controller.requirement_collection !== "stripe" ||
    controller.stripe_dashboard?.type !== "full"
  ) {
    throw new Error(
      "This Stripe account needs a setup review. Please contact Bookzenvo support.",
    );
  }
}
