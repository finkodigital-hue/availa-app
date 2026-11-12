// Local browser regression; no site, account, network request or production data.
import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
import { chromium } from "@playwright/test";
const script = ts.transpileModule(
  fs.readFileSync("src/lib/calendar-dialog-focus.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<main id="calendar" tabindex="-1"><button id="booking">Fictional booking</button><button id="other">Other</button></main><div id="dialog" tabindex="-1" role="dialog">Booking details</div>',
  );
  await page.evaluate((code) => {
    const exports = {};
    new Function("exports", code)(exports);
    window.restoreFocus = exports.restoreCalendarDialogFocus;
    document
      .querySelector("#booking")
      .addEventListener("click", () =>
        document.querySelector("#dialog").focus(),
      );
    document.querySelector("#dialog").addEventListener("keydown", (event) => {
      if (event.key === "Escape")
        window.restoreFocus(
          event,
          document.querySelector("#booking"),
          document.querySelector("#calendar"),
        );
    });
  }, script);
  await page.locator("#booking").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "dialog");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.activeElement.id), "booking");
  await page.evaluate(() => {
    const trigger = document.querySelector("#booking");
    trigger.remove();
    window.restoreFocus(
      new Event("close", { cancelable: true }),
      trigger,
      document.querySelector("#calendar"),
    );
  });
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "calendar",
  );
  await page.evaluate(() => {
    const other = document.querySelector("#other");
    other.focus();
    window.restoreFocus(
      new Event("close", { cancelable: true }),
      other,
      document.querySelector("#calendar"),
      true,
    );
  });
  assert.equal(await page.evaluate(() => document.activeElement.id), "other");
  await page.evaluate(() => {
    const hidden = document.querySelector("#other");
    hidden.hidden = true;
    window.restoreFocus(
      new Event("close", { cancelable: true }),
      hidden,
      document.querySelector("#calendar"),
    );
  });
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "calendar",
  );
  console.log(
    "5 browser focus checks passed: keyboard open/Escape, removed or hidden trigger fallback, next-dialog preservation.",
  );
} finally {
  await browser.close();
}
