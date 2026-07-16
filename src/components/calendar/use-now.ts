import { useEffect, useState } from "react";

// A single shared "current time" for every isToday / now-line computation in
// the calendar. Rendering with a fresh `new Date()` inline is only correct
// until the next unrelated re-render — a tab left open across midnight would
// keep showing yesterday as "today" until something else happened to
// re-render it. This ticks on an interval, and additionally re-syncs on
// visibilitychange/focus so a backgrounded tab (where timers get throttled)
// catches up immediately once it's looked at again, rather than waiting on
// a possibly-delayed interval tick.
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs]);

  return now;
}
