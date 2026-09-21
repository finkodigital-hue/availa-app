function publicValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const legalOperator = {
  name: publicValue(import.meta.env.VITE_LEGAL_OPERATOR_NAME) ?? "BOOKZENVO LTD",
  legalForm: publicValue(import.meta.env.VITE_LEGAL_OPERATOR_FORM) ?? "Private limited company",
  serviceAddress: publicValue(import.meta.env.VITE_LEGAL_OPERATOR_ADDRESS) ?? "Pinefield, Tomich, Cannich, IV4 7LY",
  companyNumber: publicValue(import.meta.env.VITE_LEGAL_COMPANY_NUMBER) ?? "SC902170",
  registeredIn: publicValue(import.meta.env.VITE_LEGAL_REGISTERED_IN) ?? "Scotland",
  vatNumber: publicValue(import.meta.env.VITE_LEGAL_VAT_NUMBER),
  contactEmail:
    publicValue(import.meta.env.VITE_LEGAL_CONTACT_EMAIL) ??
    "help@bookzenvo.com",
  icoRegistration: publicValue(import.meta.env.VITE_LEGAL_ICO_REGISTRATION),
};

export const hasPublishableOperatorIdentity = Boolean(
  legalOperator.name && legalOperator.legalForm && legalOperator.serviceAddress,
);
