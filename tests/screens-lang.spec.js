// Screenshots for review, Safari engine (WebKit), iPhone size: home and "New phrases" in English (owner),
// "Nieuwe zinnen" in Dutch (Claire). Also asserts the language really switched.
import { test, expect, webkit, devices } from "@playwright/test";

const LEARNER = "00000000-0000-0000-0000-00000000000c", OWNER = "00000000-0000-0000-0000-00000000000a";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

async function toFirstPhrase(page) {
  await page.locator("#startBtn").click();
  for (let i = 0; i < 40; i++) { const s = await page.evaluate(() => window.__step().t); if (s === "phrase") return; await page.locator("#checkBtn").click(); }
}

test("language per account: English for Augusto, Dutch for Claire", async () => {
  test.setTimeout(120_000);
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: "http://localhost:5173", locale: "nl-NL" });
  const page = await ctx.newPage();
  await page.goto("/index.html?mock=owner");
  await page.evaluate(({ LEARNER, OWNER, d }) => {
    localStorage.clear();
    const res = (uid) => [1, 2, 3, 4].map((n) => ({ user_id: uid, n, week: 1, done_on: d[n], on_time: true, minutes: 30, xp: 300, quiz_ok: 5, quiz_total: 5, mission_met: true, detail: n === 4 ? { tests: [{ week: 1, ok: 9, total: 10, passed: true }] } : {} }));
    localStorage.setItem("mockdb-v1", JSON.stringify({ session_results: [...res(LEARNER), ...res(OWNER)], progress_days: [{ user_id: OWNER, day: d[1], lessons: 1, minutes: 30, xp: 1200 }, { user_id: LEARNER, day: d[1], lessons: 1, minutes: 30, xp: 1435 }] }));
    localStorage.setItem("stamped-" + OWNER + "-w1", "1"); localStorage.setItem("stamped-" + LEARNER + "-w1", "1");
  }, { LEARNER, OWNER, d: { 1: dayAgo(8), 2: dayAgo(6), 3: dayAgo(4), 4: dayAgo(2) } });
  await page.reload();
  // Augusto: English by default
  await expect(page.locator("#todaySub")).toContainText("Session 5 of 24");
  await expect(page.locator("#nav")).toContainText("Passport");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/screens/lang-home-en.png" });
  await toFirstPhrase(page);
  await expect(page.locator("#lessonTitle")).toHaveText("New phrases");
  await expect(page.locator(".example .mono")).toHaveText("Example");
  await page.screenshot({ path: "test-results/screens/lang-phrase-en.png" });
  await page.locator("#quitBtn").click(); await page.locator("#quitBtn").click();
  // Panel in English, and "View as Claire" switches to Dutch
  await page.locator('#nav [data-tab="panel"]').click();
  await expect(page.locator("#tab-panel h2")).toHaveText("Augusto's panel");
  await page.locator("#viewAs").click();
  await expect(page.locator("#nav")).toContainText("Paspoort");
  await expect(page.locator(".banner")).toContainText("alleen lezen");
  // Claire: Dutch
  const claire = await ctx.newPage();
  await claire.goto("/index.html?mock=learner");
  await expect(claire.locator("#todaySub")).toContainText("Sessie 5 van 24");
  await toFirstPhrase(claire);
  await expect(claire.locator("#lessonTitle")).toHaveText("Nieuwe zinnen");
  await claire.screenshot({ path: "test-results/screens/lang-phrase-nl.png" });
  await browser.close();
});

test("switching language in settings is saved per account", async ({ page }) => {
  await page.goto("/index.html?mock=learner");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#luciaSettings").click();
  await page.locator('#setLang [data-lang="en"]').click();
  await expect(page.locator("#nav")).toContainText("Words");
  await page.reload();
  await expect(page.locator("#nav")).toContainText("Words");
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#luciaSettings").click();
  await page.locator('#setLang [data-lang="nl"]').click();
  await expect(page.locator("#nav")).toContainText("Woorden");
});
