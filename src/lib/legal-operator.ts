function publicValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const legalOperator = {
  name: publicValue(import.meta.env.VITE_LEGAL_OPERATOR_NAME),
  legalForm: publicValue(import.meta.env.VITE_LEGAL_OPERATOR_FORM),
  serviceAddress: publicValue(import.meta.env.VITE_LEGAL_OPERATOR_ADDRESS),
  companyNumber: publicValue(import.meta.env.VITE_LEGAL_COMPANY_NUMBER),
  registeredIn: publicValue(import.meta.env.VITE_LEGAL_REGISTERED_IN),
  vatNumber: publicValue(import.meta.env.VITE_LEGAL_VAT_NUMBER),
  contactEmail:
    publicValue(import.meta.env.VITE_LEGAL_CONTACT_EMAIL) ??
    "help@finkodigital.com",
  icoRegistration: publicValue(import.meta.env.VITE_LEGAL_ICO_REGISTRATION),
};

export const hasPublishableOperatorIdentity = Boolean(
  legalOperator.name && legalOperator.legalForm && legalOperator.serviceAddress,
);
