import { chromium } from "playwright";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public");
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "bookzenvo-brand-assets-"),
);
const browser = await chromium.launch({ headless: true });

const render = async ({ name, width, height, body, style }) => {
  const source = join(temporaryDirectory, `${name}.html`);
  await writeFile(
    source,
    `<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      ${style}
    </style></head><body>${body}</body></html>`,
  );

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.goto(`file:///${source.replaceAll("\\", "/")}`);
  await page.screenshot({
    path: join(output, `${name}.png`),
    omitBackground: false,
  });
  await page.close();
};

try {
  await render({
    name: "bookzenvo-social-share",
    width: 1200,
    height: 630,
    body: `
      <main>
        <section>
          <div class="eyebrow">SALON SOFTWARE</div>
          <h1>Bookzenvo<span>.</span></h1>
          <p>Bookings made beautiful</p>
        </section>
        <div class="calendar" aria-hidden="true">
          <div class="calendar-top"><i></i><i></i></div>
          <div class="calendar-line"></div>
          <div class="appointment">
            <div class="time">10:30</div>
            <div><strong>Appointment confirmed</strong><small>Cut &amp; finish · 60 min</small></div>
            <b>✓</b>
          </div>
          <div class="calendar-line short"></div>
        </div>
      </main>`,
    style: `
      body { background: #f8f4ec; color: #142126; font-family: Arial, sans-serif; }
      body::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 78% 20%, #fff 0, transparent 38%), linear-gradient(115deg, transparent 55%, rgba(177,137,50,.10)); }
      main { position: relative; display: flex; align-items: center; justify-content: space-between; width: 100%; height: 100%; padding: 76px 84px; }
      section { width: 57%; }
      .eyebrow { color: #9b7629; font-size: 20px; font-weight: 700; letter-spacing: .24em; margin-bottom: 25px; }
      h1 { font-family: Georgia, serif; font-size: 106px; font-weight: 400; letter-spacing: -5px; line-height: .95; margin: 0; }
      h1 span { color: #b38a32; }
      p { border-top: 2px solid #b38a32; display: inline-block; font-family: Georgia, serif; font-size: 37px; margin: 36px 0 0; padding-top: 25px; }
      .calendar { background: rgba(255,255,255,.84); border: 1px solid rgba(179,138,50,.22); border-radius: 30px; box-shadow: 0 28px 70px rgba(44,36,20,.13); height: 405px; padding: 50px 38px; transform: rotate(-3deg); width: 395px; }
      .calendar-top { display: flex; gap: 18px; margin-bottom: 38px; }
      .calendar-top i { background: #b38a32; border-radius: 50%; display: block; height: 18px; width: 18px; }
      .calendar-line { background: #eee8dc; border-radius: 9px; height: 15px; margin: 24px 0; width: 100%; }
      .calendar-line.short { width: 62%; }
      .appointment { align-items: center; background: #fffaf0; border-left: 5px solid #b38a32; border-radius: 12px; display: grid; gap: 18px; grid-template-columns: auto 1fr auto; margin: 22px 0; padding: 24px 20px; }
      .time { color: #9b7629; font-family: Georgia, serif; font-size: 31px; }
      strong, small { display: block; }
      strong { font-size: 17px; margin-bottom: 7px; }
      small { color: #6f736f; font-size: 14px; }
      b { align-items: center; border: 2px solid #b38a32; border-radius: 50%; color: #9b7629; display: flex; font-size: 18px; height: 36px; justify-content: center; width: 36px; }
    `,
  });

  await render({
    name: "favicon",
    width: 512,
    height: 512,
    body: `<main><div>B<span>.</span></div></main>`,
    style: `
      body { background: #142126; }
      main { align-items: center; display: flex; height: 100%; justify-content: center; width: 100%; }
      div { color: #fffaf0; font-family: Georgia, serif; font-size: 355px; line-height: 1; margin: -35px 0 0 -5px; }
      span { color: #c49b43; font-size: 165px; }
    `,
  });
} finally {
  await browser.close();
  await rm(temporaryDirectory, { force: true, recursive: true });
}

console.log("Generated Bookzenvo-owned social-share and favicon assets.");
