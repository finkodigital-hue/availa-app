// Actual screens, in an isolated browser with all data and writes mocked.
// No real customer, database, booking, payment or message request is permitted.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";

const mocks = {
  "@tanstack/react-router": `import React from 'react'; const empty={}; const navigate=()=>{}; export const createFileRoute=()=>options=>({options,useSearch:()=>empty,useNavigate:()=>navigate}); export const Link=({to,search,...props})=>React.createElement('a',{...props,href:to});`,
  "@/components/app-shell": `import React from 'react'; export const PageHeader=({title,subtitle,action})=>React.createElement('header',null,React.createElement('h1',null,title),React.createElement('p',null,subtitle),action);`,
  "@/lib/business": `const business={id:'fixture-business',owner_id:'fixture-owner',name:'Fictional salon',slug:'fictional',currency:'GBP',timezone:'Europe/London'}; export const useMyBusiness=()=>({data:business});`,
  "@/lib/auth": `export const useAuth=()=>({user:{id:window.fixtureNonOwner?'fixture-staff':'fixture-owner'}});`,
  "@/lib/image": `export const signedUrl=async()=>''; export const compressImage=async value=>value;`,
  "@/lib/csv": `export const downloadCsv=(name,rows)=>{window.fixtureExport={name,rows}}; export const downloadJson=()=>{};`,
  "@/lib/customer-data-requests.functions": `export const generateCustomerDataExport=async()=>{throw new Error('Not allowed in fixture')}; export const eraseCustomer=generateCustomerDataExport;`,
  "@/lib/server-fn-auth": `export const getServerFnAuthHeaders=async()=>({});`,
  "@/components/customer-consultation-summary": `export const CustomerConsultationSummary=()=>null;`,
  "@/components/new-booking-dialog": `export const NewBookingDialog=()=>null;`,
  "@/integrations/supabase/client": `
    function query(table) {
      const state={table,filters:[],range:null,mutation:null,single:false,orders:[]};
      const q={
        select(){return q}, eq(k,v){state.filters.push([k,v]);return q}, neq(k,v){state.exclude=[k,v];return q},
        order(k){state.orders.push(k);return q}, range(a,b){state.range=[a,b];return q}, limit(n){state.range=[0,n-1];return q},
        maybeSingle(){state.single=true;return q}, single(){state.single=true;return q},
        update(value){state.mutation=value;return q}, delete(){state.mutation='delete';return q},
        then(done,failed){return Promise.resolve().then(async()=>{
          window.fixtureCalls.push(state);
          if(state.mutation){
            window.fixtureWrites.push(state);
            if(window.fixtureWriteMode==='throw') throw new Error('Fictional connection loss');
            if(window.fixtureWriteMode==='empty') return {data:null,error:null};
            return {data:{id:'fixture-request'},error:null};
          }
          if(window.fixtureFailure===table) return {data:null,error:new Error('Fictional offline response')};
          let rows=window.fixtureTables[table]??[];
          for(const [k,v] of state.filters) rows=rows.filter(row=>row[k]===v);
          if(state.exclude) rows=rows.filter(row=>row[state.exclude[0]]!==state.exclude[1]);
          if(state.range) rows=rows.slice(state.range[0],Math.min(state.range[1]+1,state.range[0]+(window.fixtureCap??500)));
          return {data:state.single?rows[0]??null:rows,error:null};
        }).then(done,failed)}
      };return q;
    }
    export const supabase={from:query,rpc:(name,args)=>{window.fixtureRpcArgs.push([name,args]);return query(name)}};
  `,
};
const server = await createServer({
  configFile: false,
  optimizeDeps: { entries: ["tests/fixtures/customer-requests.html"] },
  plugins: [
    {
      name: "customer-request-mocks",
      enforce: "pre",
      resolveId(id) {
        const key = id.replaceAll("\\", "/");
        if (key in mocks) return "\0" + key;
      },
      load(id) {
        if (id.startsWith("\0")) return mocks[id.slice(1)];
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: resolve("src") + "/$1" }],
  },
  server: {
    host: "127.0.0.1",
    port: 4197,
    strictPort: true,
    fs: { allow: [resolve("."), realpathSync("node_modules")] },
  },
});
// Aliases run before plugins: recognise the resolved form as well.
for (const [key, value] of Object.entries(mocks))
  if (key.startsWith("@/"))
    mocks[resolve("src", key.slice(2)).replaceAll("\\", "/")] = value;
await server.listen();
let browser;
let checks = 0;
const same = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks++;
};
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Los_Angeles",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (
      url.pathname === "/api/appointment-waitlist" &&
      route.request().method() === "GET"
    )
      return route.fulfill({ json: { automaticEmailAlertsAvailable: false } });
    if (url.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => {
    window.fixtureCalls = [];
    window.fixtureWrites = [];
    window.fixtureRpcArgs = [];
    window.fixtureCap = 137;
    const count = new URLSearchParams(location.search).has("large")
      ? 10001
      : 1201;
    window.fixtureTables = {
      customers: Array.from({ length: count }, (_, n) => ({
        id: "customer-" + n,
        business_id: "fixture-business",
        name: n === 1200 ? "Alex, 100% _ (VIP)" : "Customer " + n,
        email: "fixture" + n + "@example.invalid",
        phone: null,
        address: null,
        avatar_url: null,
        notes: null,
        created_at: "2026-10-01T00:00:00Z",
      })),
      customer_export_stats: Array.from({ length: count }, (_, n) => ({
        customer_id: "customer-" + n,
        visits: 4,
        total_spent_cents: 10000,
        first_visit: "2026-10-01T00:00:00Z",
        last_visit: new Date().toISOString(),
      })),
      appointment_waitlist_requests: [
        {
          id: "fixture-request",
          business_id: "fixture-business",
          service_id: "fixture-service",
          preferred_staff_id: null,
          preferred_after: "2027-01-01T00:00:00Z",
          preferred_before: "2027-01-02T00:00:00Z",
          preferred_time: "any",
          status: "active",
          resolution: null,
          customer_name: "Fictional requester",
          customer_email: "requester@example.invalid",
          customer_phone: null,
          created_at: "2026-11-25T10:00:00Z",
        },
      ],
      services: [
        { id: "fixture-service", business_id: "fixture-business", name: "Cut" },
      ],
      staff: [],
      bookings: [],
      customer_data_requests: [],
    };
  });
  const open = (mode) =>
    page.goto(
      "http://127.0.0.1:4197/tests/fixtures/customer-requests.html?mode=" +
        mode,
    );
  await open("customers");
  await page.getByText("1201 customers", { exact: true }).waitFor();
  checks++;
  same(
    await page
      .getByRole("region", { name: "Customer list" })
      .getByRole("button", { name: /Customer \d/ })
      .count(),
    100,
    "Large lists initially render only 100 customer rows",
  );
  await page.getByRole("button", { name: "Show 100 more" }).click();
  same(
    await page
      .getByRole("region", { name: "Customer list" })
      .getByRole("button", { name: /Customer \d/ })
      .count(),
    200,
    "More customers can be revealed without a new data fetch",
  );
  await page
    .getByRole("textbox", { name: "Search customers" })
    .fill("100% _ (VIP)");
  await page.getByRole("button", { name: /Alex, 100% _ \(VIP\)/ }).waitFor();
  checks++;
  same(
    await page.getByText("1 customer", { exact: true }).count(),
    1,
    "Literal wildcard search finds only the matching customer",
  );
  await page.getByRole("button", { name: "Filter customers" }).click();
  await page.getByRole("menuitem", { name: /Regulars/ }).click();
  await page.getByRole("button", { name: /Alex, 100% _ \(VIP\)/ }).waitFor();
  checks++;
  await page.getByRole("button", { name: "Export filtered clients" }).click();
  await page.waitForFunction(() => window.fixtureExport);
  same(
    await page.evaluate(() =>
      window.fixtureExport.rows.map((r) => [r.Name, r["Total Visits"]]),
    ),
    [["Alex, 100% _ (VIP)", 4]],
    "Export includes later customer/stats pages and literal search",
  );
  same(
    await page.evaluate(
      () => window.fixtureExport.rows[0]["Past Appointment Value"],
    ),
    "£100.00",
    "CSV labels booked prices as appointment value",
  );
  same(
    await page.getByText("Past appointment value", { exact: true }).count(),
    1,
    "Profile does not present booked prices as money received",
  );
  same(
    await page.evaluate(() =>
      window.fixtureCalls
        .filter((c) => c.table === "customers" || c.table === "bookings")
        .every((c) =>
          c.filters.some(
            ([k, v]) => k === "business_id" && v === "fixture-business",
          ),
        ),
    ),
    true,
    "Every customer/history page is scoped to the workspace",
  );
  same(
    await page.evaluate(() =>
      window.fixtureCalls.some(
        (c) => c.table === "customer_export_stats" && c.range?.[0] > 1000,
      ),
    ),
    true,
    "Stats beyond provider cap are loaded",
  );
  same(
    await page.evaluate(() =>
      window.fixtureRpcArgs.some(([name]) => name === "customer_visit_counts"),
    ),
    false,
    "No duplicate whole-history aggregate",
  );
  await page.evaluate(() => {
    window.fixtureFailure = "bookings";
    return window.fixtureQueryClient.invalidateQueries({
      queryKey: ["customer-detail"],
    });
  });
  const profileError = page
    .getByRole("alert")
    .filter({ hasText: "Could not load this customer's profile" });
  await profileError.waitFor();
  checks++;
  await page.evaluate(() => {
    window.fixtureFailure = null;
  });
  await profileError.getByRole("button", { name: "Try again" }).click();
  await profileError.waitFor({ state: "hidden" });
  checks++;
  await page.evaluate(() => {
    window.fixtureFailure = "customers";
    return window.fixtureQueryClient.invalidateQueries({
      queryKey: ["customers"],
    });
  });
  const listError = page
    .getByRole("alert")
    .filter({ hasText: "Could not load customers" });
  await listError.waitFor();
  checks++;
  same(
    await page.getByText("No customers in this view", { exact: true }).count(),
    0,
    "Failure is not an empty customer list",
  );
  await page.evaluate(() => {
    window.fixtureFailure = null;
  });
  await listError.getByRole("button", { name: "Try again" }).click();
  await listError.waitFor({ state: "hidden" });
  checks++;
  await mkdir("test-results/customer-requests", { recursive: true });
  same(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Customer page fits 390px",
  );
  await page.screenshot({
    path: "test-results/customer-requests/customers-390.png",
  });
  const largeStarted = Date.now();
  await open("customers&large=1");
  await page.getByText("10001 customers", { exact: true }).waitFor();
  same(
    await page
      .getByRole("region", { name: "Customer list" })
      .getByRole("button", { name: /Customer \d/ })
      .count(),
    100,
    "Ten thousand customers still render only 100 rows",
  );
  await page
    .getByRole("textbox", { name: "Search customers" })
    .fill("Customer 9999");
  await page.getByRole("button", { name: /Customer 9999 / }).waitFor();
  checks++;
  console.log(
    `10,001-customer mocked load/search completed in ${Date.now() - largeStarted}ms; this excludes production network/database timing.`,
  );
  await open("requests");
  await page.getByRole("heading", { name: "Fictional requester" }).waitFor();
  const outcome = page.getByRole("combobox", {
    name: "Record request outcome",
  });
  await page.evaluate(() => {
    window.fixtureWriteMode = "empty";
  });
  await outcome.selectOption("contacted");
  await page
    .getByText(
      "Could not update this request. Refresh the list and try again.",
      { exact: true },
    )
    .waitFor();
  checks++;
  same(await outcome.isEnabled(), true, "Zero-row update releases controls");
  same(
    await page.getByText(/Marked contacted\./).count(),
    0,
    "Zero rows must not be reported as success",
  );
  await page.evaluate(() => {
    window.fixtureWriteMode = "throw";
  });
  await outcome.selectOption("booked");
  await page.waitForFunction(() => window.fixtureWrites.length === 2);
  await page.waitForFunction(() => !document.querySelector("select").disabled);
  checks++;
  page.on("dialog", (dialog) => dialog.accept());
  await page.evaluate(() => {
    window.fixtureWriteMode = "empty";
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByText(
      "Could not delete this request. Refresh the list and try again.",
      { exact: true },
    )
    .waitFor();
  checks++;
  same(
    await page.getByText("Request deleted.", { exact: true }).count(),
    0,
    "Zero-row delete must not be reported as success",
  );
  await page.evaluate(() => {
    window.fixtureWriteMode = "success";
  });
  await outcome.selectOption("contacted");
  await page
    .getByText(
      "Marked contacted. This did not create a booking or send a message.",
      { exact: true },
    )
    .waitFor();
  checks++;
  same(
    await page.evaluate(() =>
      window.fixtureWrites.every((c) =>
        c.filters.some(
          ([k, v]) => k === "business_id" && v === "fixture-business",
        ),
      ),
    ),
    true,
    "Mutations remain tenant scoped",
  );
  same(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Requests page fits 390px",
  );
  await page.screenshot({
    path: "test-results/customer-requests/requests-390.png",
  });
  await page.addInitScript(() => {
    window.fixtureNonOwner = true;
  });
  await open("requests");
  await page
    .getByText("Only the salon owner can see booking requests.")
    .waitFor();
  same(
    await page.evaluate(
      () =>
        window.fixtureCalls.filter(
          (c) => c.table === "appointment_waitlist_requests",
        ).length,
    ),
    0,
    "Non-owner screen does not fetch private requests",
  );
  await page.clock.install({ time: new Date("2026-07-01T23:30:00Z") });
  await open("opening");
  await page.getByRole("button", { name: "Ask for a time" }).click();
  const first = page.getByLabel("First day that works");
  same(
    await first.getAttribute("min"),
    "2026-07-02",
    "Visitor in Los Angeles sees London date bound",
  );
  same(
    await first.inputValue(),
    "2026-07-02",
    "Past selected day is clamped to salon today",
  );
  same(
    await first.getAttribute("max"),
    "2026-08-31",
    "Last day matches server salon date bound",
  );
  same(errors, [], "No uncaught browser errors");
  console.log(
    `Customer/request UI: ${checks} assertions passed; 1,201 fictional customers, 137-row gateway, literal search/export, staff boundary, failure/retry, zero-row/thrown writes and 390px layouts. All data and writes mocked.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
