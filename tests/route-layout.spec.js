// Home route layout: the stop before the current one is fully visible below the sticky card, labels have a
// background (the dotted line passes behind them), and stamps show the real date earned, month in the account's language.
import { test, expect } from "@playwright/test";

const LEARNER = "00000000-0000-0000-0000-00000000000c", OWNER = "00000000-0000-0000-0000-00000000000a";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const MON = { en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], nl: ["JAN", "FEB", "MRT", "APR", "MEI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"] };
const label = (s, l) => s.slice(8, 10) + "·" + MON[l][Number(s.slice(5, 7)) - 1];

for (const [who, uid, lang, scheme] of [["owner", OWNER, "en", "light"], ["learner", LEARNER, "nl", "dark"]]) {
  test(`route layout and stamp date (${who}, ${lang})`, async ({ page }) => {
    const earned = dayAgo(5); // the week 1 test was passed on this day (session 4)
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/index.html?mock=${who}`);
    await page.evaluate(({ uid, earned, d }) => {
      localStorage.clear();
      const res = [1, 2, 3, 4].map((n) => ({ user_id: uid, n, week: 1, done_on: n === 4 ? earned : d[n], on_time: true, minutes: 30, xp: 300, quiz_ok: 5, quiz_total: 5, mission_met: true, detail: n === 4 ? { tests: [{ week: 1, ok: 9, total: 10, passed: true }] } : {} }));
      res.push({ user_id: uid, n: 5, week: 2, done_on: d[5], on_time: true, minutes: 30, xp: 300, quiz_ok: 5, quiz_total: 5, mission_met: true, detail: {} });
      localStorage.setItem("mockdb-v1", JSON.stringify({ session_results: res, progress_days: [{ user_id: uid, day: d[1], lessons: 1, minutes: 30, xp: 1435 }] }));
      localStorage.setItem("stamped-" + uid + "-w1", "1");
    }, { uid, earned, d: { 1: dayAgo(11), 2: dayAgo(9), 3: dayAgo(7), 5: dayAgo(2) } });
    await page.reload();
    await expect(page.locator("#curNode")).toBeVisible();
    await page.waitForTimeout(300);
    // stamp: real date, month in the account's language
    await expect(page.locator('#routeMap [data-stamp="1"] small')).toHaveText(label(earned, lang));
    // the stop before the current one is entirely below the sticky card
    const gap = await page.evaluate(() => {
      const top = document.querySelector(".home-top").getBoundingClientRect().bottom;
      const nodes = [...document.querySelectorAll("#routeMap .r-node, #routeMap .r-stamp")];
      const i = nodes.findIndex((n) => n.id === "curNode");
      const prev = nodes[i - 1].getBoundingClientRect();
      return Math.round(prev.top - top);
    });
    expect(gap).toBeGreaterThanOrEqual(8);
    // labels sit on the page background, above the dotted line
    const bg = await page.evaluate(() => { const l = document.querySelector("#routeMap .r-label"); return [getComputedStyle(l).backgroundColor, getComputedStyle(document.body).backgroundColor]; });
    expect(bg[0]).toBe(bg[1]);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/screens/route-${lang}-${scheme}.png` });
    await page.locator('#nav [data-tab="passport"]').click();
    await expect(page.locator('.book-stamp[data-week="1"] .seal small').last()).toHaveText(label(earned, lang));
  });
}
