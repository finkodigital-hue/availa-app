export function soleEligibleStaff<T>(staff: readonly T[] | undefined): T | null {
  return staff?.length === 1 ? staff[0] : null;
}

export function previousStepFromTime(staffCount: number | undefined): "service" | "staff" {
  return staffCount === 1 ? "service" : "staff";
}
