/** Controlled dialogs have no Radix DialogTrigger to restore focus to. */
export function restoreCalendarDialogFocus(
  event: { preventDefault(): void },
  trigger: HTMLElement | null,
  fallback: HTMLElement | null,
  openingAnotherDialog = false,
) {
  event.preventDefault();
  // Book again opens another dialog: leave its focus management in control.
  if (openingAnotherDialog) return;
  const usable = (element: HTMLElement | null) =>
    element?.isConnected &&
    !element.hasAttribute("disabled") &&
    element.getClientRects().length > 0;
  const target = usable(trigger) ? trigger : usable(fallback) ? fallback : null;
  target?.focus({ preventScroll: true });
}
