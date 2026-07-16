export type BusinessType = "salon" | "barber" | "spa" | "nails" | "beauty" | "other";

export const BUSINESS_TYPES: { id: BusinessType; label: string }[] = [
  { id: "salon", label: "Salon" },
  { id: "barber", label: "Barber" },
  { id: "spa", label: "Spa" },
  { id: "nails", label: "Nails" },
  { id: "beauty", label: "Beauty" },
  { id: "other", label: "Other" },
];
