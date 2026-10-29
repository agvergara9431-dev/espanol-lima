// Screenshots for design review (iPhone size, light and dark). Writes to test-results/screens/design-*.png.
import { test, expect } from "@playwright/test";

const LEARNER = "00000000-0000-0000-0000-00000000000c";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

for (const scheme of ["light", "dark"]) {
  test(`design screens (${scheme})`, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/index.html?mock=learner");
    // Claire-like state: sessions 1-4 done (week 1 stamp earned), session 5 due today.
    await page.evaluate(({ LEARNER, days }) => {
      localStorage.clear();
      const res = [1, 2, 3, 4].map((n) => ({ user_id: LEARNER, n, week: 1, done_on: days[n], on_time: true, minutes: 30, xp: 300, quiz_ok: 5, quiz_total: 5, mission_met: true, detail: n === 4 ? { tests: [{ week: 1, ok: 9, total: 10, passed: true }] } : {} }));
      localStorage.setItem("mockdb-v1", JSON.stringify({ session_results: res, progress_days: [{ user_id: LEARNER, day: days[1], lessons: 1, minutes: 30, xp: 1435 }] }));
      localStorage.setItem("stamped-" + LEARNER + "-w1", "1");
    }, { LEARNER, days: { 1: dayAgo(8), 2: dayAgo(6), 3: dayAgo(4), 4: dayAgo(2) } });
    await page.reload();
    await expect(page.locator("#curNode")).toBeInViewport();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/screens/design-home-${scheme}.png` });
    await page.locator('#nav [data-tab="passport"]').click();
    await page.screenshot({ path: `test-results/screens/design-passport-${scheme}.png` });
    await page.locator('#nav [data-tab="home"]').click();
    await page.locator("#startBtn").click();
    for (let i = 0; i < 40; i++) { const s = await page.evaluate(() => window.__step()); if (s.t === "ex" && s.ex.k === "mc") break; await page.locator("#checkBtn").click(); }
    await page.locator("#lbody .opt").first().click();
    await page.screenshot({ path: `test-results/screens/design-exercise-${scheme}.png` });
    const aug = await context.newPage();
    await aug.emulateMedia({ colorScheme: scheme });
    await aug.goto("/index.html?mock=owner");
    await aug.locator('#nav [data-tab="panel"]').click();
    await expect(aug.locator("#pSessionsTable tbody tr")).toHaveCount(4);
    await aug.screenshot({ path: `test-results/screens/design-panel-${scheme}.png` });
  });
}
