// Installed app on an iPhone with a notch: the status bar takes the top 47px (safe-area-inset-top) and the home
// indicator the bottom 34px. Playwright can't emulate env(), so the stylesheet is served with those values filled in.
// Every screen must keep its first content below the status bar, and the Lucía input must stay above the tabs.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const LEARNER = "00000000-0000-0000-0000-00000000000c";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const TOP = 47, BOTTOM = 34;

test.beforeEach(async ({ page }) => {
  const css = readFileSync("css/app.css", "utf8").replaceAll("env(safe-area-inset-top, 0px)", TOP + "px").replaceAll("env(safe-area-inset-bottom, 0px)", BOTTOM + "px");
  await page.route("**/css/app.css*", (r) => r.fulfill({ body: css, contentType: "text/css" }));
  // A fake status bar so the screenshots show where the iPhone's clock is.
  await page.addInitScript((TOP) => addEventListener("DOMContentLoaded", () => { const b = document.createElement("div"); b.id = "fakeStatus"; b.textContent = "9:41"; b.style.cssText = `position:fixed;top:0;left:0;right:0;height:${TOP}px;z-index:9999;background:rgba(0,0,0,.25);color:#fff;font:600 15px system-ui;display:flex;align-items:center;padding-left:32px;pointer-events:none`; document.body.append(b); }), TOP);
});

async function open(page, mode = "learner") {
  await page.goto(`/index.html?mock=${mode}`);
  await page.evaluate(({ LEARNER, d }) => { localStorage.clear(); localStorage.setItem("mockdb-v1", JSON.stringify({ session_results: [{ user_id: LEARNER, n: 1, week: 1, done_on: d, on_time: true, detail: {} }] })); }, { LEARNER, d: dayAgo(2) });
  await page.reload();
  await expect(page.locator("#routeMap")).toBeVisible();
}
// Topmost visible content of a container (text, buttons, images) must start below the status bar.
const firstTop = (page, sel) => page.locator(sel).evaluate((root) => {
  let min = Infinity;
  for (const el of root.querySelectorAll("h1,h2,h3,p,button,a,input,img,svg,span,b")) { const r = el.getBoundingClientRect(); if (r.width && r.height && r.bottom > 0) min = Math.min(min, r.top); }
  return min;
});

for (const tab of ["home", "passport", "lucia", "words"]) {
  test(`${tab}: content starts below the status bar`, async ({ page }) => {
    await open(page);
    if (tab !== "home") await page.locator(`#nav [data-tab="${tab}"]`).click();
    expect(await firstTop(page, `#tab-${tab}`)).toBeGreaterThanOrEqual(TOP);
    if (tab === "lucia") {
      const form = await page.locator("#lform").boundingBox(), nav = await page.locator("#nav").boundingBox();
      expect(form.y + form.height).toBeLessThanOrEqual(nav.y + 1);
    }
    await page.screenshot({ path: `test-results/screens/safe-${tab}.png` });
  });
}

test("Lucía settings, the session screen and the owner panel start below the status bar", async ({ page }) => {
  await open(page);
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#luciaSettings").click();
  expect(await firstTop(page, "#week")).toBeGreaterThanOrEqual(TOP);
  await page.locator("#setBack").click();
  await page.locator('#nav [data-tab="home"]').click();
  await page.locator("#startBtn").click();
  expect(await firstTop(page, "#lesson")).toBeGreaterThanOrEqual(TOP);
  await open(page, "owner");
  expect(await firstTop(page, "#tab-panel")).toBeGreaterThanOrEqual(TOP);
});
