import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";

const source = await readFile(new URL("../src/lib/public-booking-flow.ts", import.meta.url), "utf8");
const transformed = await transformWithOxc(source, "public-booking-flow.ts");
const { soleEligibleStaff, previousStepFromTime } = await import(
  `data:text/javascript;base64,${Buffer.from(transformed.code).toString("base64")}`
);

  const alex = { id: "alex", business_id: "salon" };
  const blair = { id: "blair", business_id: "independent" };

  assert.equal(soleEligibleStaff([alex]), alex, "one eligible stylist advances directly");
  assert.equal(previousStepFromTime(1), "service", "Back skips the omitted stylist step");
  assert.equal(soleEligibleStaff([alex, blair]), null, "multiple stylists require a choice");
  assert.equal(previousStepFromTime(2), "staff", "Back returns to stylist choice");
  assert.equal(soleEligibleStaff([]), null, "no eligible stylist cannot advance");
  assert.equal(previousStepFromTime(0), "staff", "unavailable staff keeps the choice step");
  console.log("Public booking staff flow checks passed.");
