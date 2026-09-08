function publicValue(name: string): string | null {
  const value = (import.meta.env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const legalOperator = {
  name: publicValue("VITE_LEGAL_OPERATOR_NAME"),
  legalForm: publicValue("VITE_LEGAL_OPERATOR_FORM"),
  serviceAddress: publicValue("VITE_LEGAL_OPERATOR_ADDRESS"),
  companyNumber: publicValue("VITE_LEGAL_COMPANY_NUMBER"),
  registeredIn: publicValue("VITE_LEGAL_REGISTERED_IN"),
  vatNumber: publicValue("VITE_LEGAL_VAT_NUMBER"),
  contactEmail:
    publicValue("VITE_LEGAL_CONTACT_EMAIL") ?? "help@finkodigital.com",
  icoRegistration: publicValue("VITE_LEGAL_ICO_REGISTRATION"),
};

export const hasPublishableOperatorIdentity = Boolean(
  legalOperator.name && legalOperator.legalForm && legalOperator.serviceAddress,
);
