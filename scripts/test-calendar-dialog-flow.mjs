// Actual React/Radix dialogs and shipping NewBookingDialog; only data/provider
// calls are replaced by inert fixtures. No server or live website is involved.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { rolldown } from "rolldown";
import { chromium } from "@playwright/test";

const fixture = `
import React, {useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {NewBookingDialog} from '@/components/new-booking-dialog';
import {restoreCalendarDialogFocus} from '@/lib/calendar-dialog-focus';
const prefill={customerId:'customer',serviceId:'service',staffId:'staff',isoTime:'2030-01-10T10:00:00Z'};
function App(){
 const [detail,setDetail]=useState(false),[creating,setCreating]=useState(false);
 const trigger=useRef(null),calendar=useRef(null);
 return <main id="calendar" tabIndex={-1} ref={calendar}>
  <button id="booking" onClick={e=>{trigger.current=e.currentTarget;setDetail(true)}}>Fictional booking</button>
  <button id="toolbar-new" onClick={e=>{trigger.current=e.currentTarget;setCreating(true)}}>New booking toolbar</button>
  <Dialog open={detail} onOpenChange={setDetail}><DialogContent
   onOpenAutoFocus={e=>{e.preventDefault();e.target.focus()}}
   onCloseAutoFocus={e=>restoreCalendarDialogFocus(e,trigger.current,calendar.current,creating)}>
    <DialogTitle>Booking details</DialogTitle><DialogDescription>Fictional appointment</DialogDescription>
    <button onClick={()=>{setDetail(false);setCreating(true)}}>Book again</button>
  </DialogContent></Dialog>
  <NewBookingDialog open={creating} onOpenChange={setCreating} businessId="salon" prefill={prefill}
   onCloseAutoFocus={e=>restoreCalendarDialogFocus(e,trigger.current,calendar.current)}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<App/>);`;
const dataStub = `
const rows={staff:{id:'staff',name:'Fictional stylist',business_id:'salon'},services:{id:'service',name:'Fictional haircut',price_cents:6500,duration_minutes:60,buffer_before_min:0,buffer_after_min:0,color:null},customers:{id:'customer',name:'Fictional customer',email:null,phone:null},service_staff:[]};
export const supabase={from(table){let single=false;const q={then(resolve,reject){return Promise.resolve({data:single?rows[table]??null:Array.isArray(rows[table])?rows[table]:[],error:null}).then(resolve,reject)}};for(const key of ['select','eq','limit','order','in'])q[key]=()=>q;q.maybeSingle=()=>{single=true;return q};return q},async rpc(name){if(name!=='create_staff_booking')throw Error('Unexpected RPC '+name);window.fixtureCreates=(window.fixtureCreates??0)+1;return {data:'fixture-booking',error:null}}};`;
const virtual = {
  "fixture:entry.tsx": fixture,
  "fixture:supabase.ts": dataStub,
  "fixture:query.ts":
    "export const useQuery=()=>({data:[],isLoading:false,isError:false});",
  "fixture:slots.ts":
    "export const useAvailableSlots=()=>({slots:[],isLoading:false,isError:false,retry(){}});",
  "fixture:toast.ts":
    "export const toast={success(){},error(message){throw Error(message)}};",
};
const mocks = {
  "@/integrations/supabase/client": "fixture:supabase.ts",
  "@tanstack/react-query": "fixture:query.ts",
  "@/lib/slots": "fixture:slots.ts",
  sonner: "fixture:toast.ts",
};
const bundle = await rolldown({
  input: "fixture:entry.tsx",
  platform: "browser",
  onwarn(warning, defaultHandler) {
    if (warning.code !== "MODULE_LEVEL_DIRECTIVE") defaultHandler(warning);
  },
  transform: {
    jsx: "react-jsx",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
  plugins: [
    {
      name: "isolated-dialog-fixture",
      resolveId(source) {
        if (source in virtual) return source;
        if (source in mocks) return mocks[source];
        if (source.startsWith("@/")) {
          const base = path.resolve("src", source.slice(2));
          const found = [base, base + ".tsx", base + ".ts"].find(
            (p) => fs.existsSync(p) && fs.statSync(p).isFile(),
          );
          assert.ok(found, source);
          return found;
        }
      },
      load(id) {
        return virtual[id];
      },
    },
  ],
});
const { output } = await bundle.generate({ format: "iife" });
await bundle.close();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    '<style>[role="dialog"]{position:fixed;inset:10px;background:white;overflow:auto;padding:20px}button{margin:8px}</style><div id="root"></div>',
  );
  await page.addScriptTag({
    content: output.find((o) => o.type === "chunk").code,
  });
  const waitFocus = async (id) =>
    page.waitForFunction(
      (expected) => document.activeElement?.id === expected,
      id,
    );
  const again = async () => {
    await page.locator("#booking").focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Book again", exact: true }).click();
    await page
      .getByRole("dialog", { name: "New booking", exact: true })
      .waitFor();
    await page.waitForFunction(() =>
      document.activeElement
        ?.closest('[role="dialog"]')
        ?.textContent.includes("New booking"),
    );
  };
  await again();
  await page.keyboard.press("Escape");
  await waitFocus("booking");
  await again();
  await page
    .getByRole("dialog", { name: "New booking", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await waitFocus("booking");
  await page.locator("#toolbar-new").click();
  await page
    .getByRole("dialog", { name: "New booking", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await waitFocus("toolbar-new");
  await again();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Create booking", exact: true })
    .click();
  await waitFocus("booking");
  assert.equal(await page.evaluate(() => window.fixtureCreates), 1);
  assert.deepEqual(errors, []);
  console.log(
    "Real Radix + NewBookingDialog flow passed: detail→Book again→Escape, close button, toolbar return and successful inert creation all restore focus.",
  );
} finally {
  await browser.close();
}
