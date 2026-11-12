import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { fmtMoney } from "../src/lib/format.ts";
const now = new Date("2026-11-12T12:00:00Z");
const modules = {
  "react/jsx-runtime": jsx,
  "lucide-react": Object.fromEntries(
    [
      "CircleDollarSign",
      "CalendarDays",
      "TimerReset",
      "CheckCircle2",
      "Ban",
    ].map((n) => [n, () => null]),
  ),
  "@/lib/format": { fmtMoney },
  "./hours-context": { useHours: () => ({ START_HOUR: 8, END_HOUR: 20 }) },
  "./use-now": { useNow: () => now },
};
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/components/calendar/today-strip.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports,
    require: (n) => {
      assert.ok(n in modules);
      return modules[n];
    },
    Date,
  },
);
const bookings = [6500, 6500, 6500, 6500, 6500, 6400].map((price_cents) => ({
  price_cents,
  amount_paid_cents: 0,
  status: "confirmed",
  starts_at: "2026-11-12T10:00Z",
  ends_at: "2026-11-12T11:00Z",
}));
bookings.push({ ...bookings[0], status: "cancelled", price_cents: 90000 });
const render = (date, currency = "GBP") =>
  renderToStaticMarkup(
    React.createElement(exports.TodayStrip, {
      bookings,
      staff: [],
      date,
      currency,
    }),
  );
const today = render(now);
assert.match(today, /Today&#x27;s booked value/);
assert.match(today, /£389\.00/);
assert.match(today, /Prices of non-cancelled bookings/);
assert.match(today, /Daily takings for payments received/);
assert.doesNotMatch(today, /revenue|£1,289/);
assert.match(render(new Date("2026-11-11T12:00Z")), />Booked value</);
bookings[0].amount_paid_cents = 6500;
assert.match(render(now), /£389\.00/);
bookings.push(
  ...["checked_in", "in_progress", "completed"].map((status) => ({
    ...bookings[0],
    status,
    price_cents: 0,
  })),
);
const statuses = render(now);
assert.match(
  statuses,
  /Completed[\s\S]*?data-calendar-stat-value="true">1<\/div>/,
);
assert.match(statuses, /Estimated unbooked/);
assert.match(
  statuses,
  /Breaks, time off and individual hours aren&#x27;t included/,
);
assert.match(render(now, "EUR"), /€389\.00/);
console.log(
  "11 rendered calendar summary assertions passed; booked prices, actual completed status, selected currency and capacity caveat verified.",
);
