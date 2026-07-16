import { createContext, useContext } from "react";

export const HOUR_PX = 64;
export const SLOT_MIN = 15;
export const SLOT_PX = HOUR_PX / (60 / SLOT_MIN);
// Default visible window if a business hasn't configured opening hours yet.
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 20;

// Visible-window context derived from each business's opening periods.
export const HoursContext = createContext<{ START_HOUR: number; END_HOUR: number }>({
  START_HOUR: DEFAULT_START_HOUR,
  END_HOUR: DEFAULT_END_HOUR,
});
export const useHours = () => useContext(HoursContext);
