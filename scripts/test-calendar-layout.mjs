import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "@playwright/test";

// Render the real day/week components against synthetic appointments. No
// authentication, customer data or database writes are needed for this check.
const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = await mkdtemp(path.join(root, ".calendar-layout-check-"));
const route = await readFile(path.join(root, "src/routes/_authenticated/calendar.tsx"), "utf8");
const dialogClass = route.match(/<DialogContent\s+className="([^"]+)"/)?.[1];
assert.ok(dialogClass);
const dialogFocus = route.match(/onOpenAutoFocus=\{(\(event\) => \{[\s\S]*?\n          \})\}/)?.[1];
assert.ok(dialogFocus);
await writeFile(path.join(fixture, "index.html"), '<div id="root"></div><script type="module" src="./fixture.tsx"></script>');
await writeFile(path.join(fixture, "fixture.tsx"), `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { StaffColumn } from "@/components/calendar/staff-column";
import { WeekView } from "@/components/calendar/week-view";
import { HoursContext } from "@/components/calendar/hours-context";
import { STAFF_PASTELS } from "@/lib/staff-colors";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import "@/styles.css";
const date = new Date(2026, 8, 28);
const at = (minutes) => new Date(2026, 8, 28, 11, minutes).toISOString();
const booking = (name, start, end) => ({ id:name, customer_name:name, starts_at:at(start), ends_at:at(end), staff_id:"staff", status:"confirmed", services:{name:"Haircut"} });
const sequential = [booking("First",0,30), booking("Second",30,60), booking("Third",60,75), booking("Fourth",75,95)];
const overlapping = [booking("Overlap A",0,60), booking("Overlap B",30,90)];
function App() {
  const [selected, select] = useState(null);
  const params = new URLSearchParams(location.search);
  const bookings = params.has("overlap") ? overlapping : sequential;
  return <HoursContext.Provider value={{START_HOUR:11, END_HOUR:15}}>
    {params.has("week") ? <WeekView bookings={bookings} weekStart={date} isLoading={false} onSelect={select} onCellClick={()=>{}}/> :
      <div style={{width:"min(600px, 100%)", marginTop:24}}><StaffColumn staff={{id:"staff",name:"Stylist",active:true}} palette={STAFF_PASTELS[0]} date={date} hours={[11,12,13,14]} bookings={bookings} blocked={[]} nowTop={null} drag={null} onSelect={select} onCellClick={()=>{}} onDragStart={()=>{}} onDragMove={()=>{}} onDragEnd={()=>{}}/></div>}
    <Dialog open={!!selected} onOpenChange={(open)=>!open && select(null)}>
      <DialogContent className=${JSON.stringify(dialogClass)} onOpenAutoFocus={${dialogFocus}}>
        <DialogHeader><DialogTitle>{selected?.customer_name}</DialogTitle><DialogDescription>Appointment details</DialogDescription></DialogHeader>
        {Array.from({length:20},(_,i)=><p key={i}>Appointment information, consultation records and payment details.</p>)}
        <button>Last action</button>
      </DialogContent>
    </Dialog>
  </HoursContext.Provider>;
}
createRoot(document.getElementById("root")).render(<App/>);
`);

let server;
let browser;
try {
  server = await createServer({
    configFile: false, root, cacheDir: path.join(fixture, ".vite"),
    optimizeDeps: { entries: [path.join(fixture, "index.html")] },
    plugins: [tailwindcss(), react()],
    resolve: { alias: { "@": path.join(root, "src") } },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const url = `http://127.0.0.1:${port}/${path.basename(fixture)}/index.html`;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const boxes = () => page.locator("[data-calendar-booking]").evaluateAll((cards) => cards.map((card) => {
    const { x,y,width,height } = card.getBoundingClientRect();
    return { x,y,width,height };
  }));
  for (const mode of ["", "?week"]) {
    await page.goto(url + mode);
    await page.locator("[data-calendar-booking]").last().waitFor();
    const cards = await boxes();
    assert.equal(cards.length, 4);
    for (let i = 1; i < cards.length; i++) {
      assert.ok(Math.abs(cards[i].x - cards[0].x) < 1, "Separate appointments stay in the same column");
      assert.ok(cards[i-1].y + cards[i-1].height <= cards[i].y, "Cards do not bleed into the next appointment");
      assert.ok(Math.abs(cards[i].width - cards[0].width) < 1);
    }
    await page.goto(url + (mode ? "?week&overlap" : "?overlap"));
    await page.locator("[data-calendar-booking]").last().waitFor();
    const overlaps = await boxes();
    assert.ok(overlaps[0].x + overlaps[0].width <= overlaps[1].x, "Real overlaps still appear side by side");
  }
  for (const viewport of [{width:1280,height:720}, {width:853,height:480}, {width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.goto(url);
    await page.getByRole("button", {name:/^First,/}).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    // Wait for the opening animation before measuring the fixed dialog.
    await page.waitForTimeout(250);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, "Dialog fits inside the viewport");
    assert.equal(await dialog.evaluate((el) => el.scrollTop), 0, "Dialog opens at the appointment heading");
    assert.ok(await dialog.evaluate((el) => document.activeElement === el), "Keyboard focus stays inside the dialog");
    assert.ok(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight), "Long content scrolls inside the dialog");
    await page.getByRole("button", {name:"Last action", exact:true}).click();
    await dialog.evaluate((el) => { el.scrollTop = 0; });
    await page.getByRole("button", {name:"Close", exact:true}).click();
    await page.getByRole("dialog").waitFor({state:"hidden"});
  }
  assert.deepEqual(errors, []);
  await page.setViewportSize({width:1000,height:650});
  await page.goto(url);
  await page.locator("[data-calendar-booking]").last().waitFor();
  await mkdir(path.join(root,"test-results"), {recursive:true});
  await page.screenshot({path:path.join(root,"test-results/calendar-layout.png")});
  console.log("Passed: day/week sequential bookings, real overlaps, and scrolling booking dialogs at desktop, zoom-equivalent and mobile sizes.");
} finally {
  await browser?.close();
  await server?.close();
  // Only delete the generated fixture directory directly inside this checkout.
  assert.equal(path.dirname(path.resolve(fixture)), path.resolve(root));
  assert.ok(path.basename(fixture).startsWith(".calendar-layout-check-"));
  await rm(fixture, {recursive:true, force:true});
}
