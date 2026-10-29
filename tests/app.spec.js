// End-to-end in iPhone size with the mock backend (localStorage, localhost only). No cloud involved.
// Covers the full session, weekly test (pass and fail), rest day with optional review, a late session,
// resuming a half-done session, and Augusto's panel (including the <60% quiz flag).
import { test, expect } from "@playwright/test";

const LEARNER = "00000000-0000-0000-0000-00000000000c";
const shots = "test-results/screens/";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

// Speech recognition stub: "hears" the expected answer (or nonsense when window.__wrongSpeak is set).
const speechStub = () => {
  const Fake = class {
    start() { setTimeout(() => { const s = window.__step?.(); const said = window.__wrongSpeak ? "nada que ver" : s?.ex?.answer || ""; this.onresult?.({ results: [[{ transcript: said }]] }); this.onend?.(); }, 50); }
    stop() {}
  };
  window.SpeechRecognition = Fake;
  window.webkitSpeechRecognition = Fake;
};

async function seed(page, { results = [], cards = [], days = [] } = {}) {
  await page.goto("/index.html?mock=learner");
  await page.evaluate(({ results, cards, days, LEARNER }) => {
    localStorage.clear();
    localStorage.setItem("mockdb-v1", JSON.stringify({
      session_results: results.map((r) => ({ user_id: LEARNER, week: 1, minutes: 20, xp: 100, quiz_ok: 5, quiz_total: 5, mission_met: true, detail: {}, ...r })),
      cards: cards.map((c) => ({ user_id: LEARNER, box: 1, ok: 1, ko: 0, ...c })),
      progress_days: days.map((d) => ({ user_id: LEARNER, lessons: 1, dialog: true, phrase: false, minutes: 20, xp: 100, ...d })),
    }));
  }, { results, cards, days, LEARNER });
  await page.reload();
  await expect(page.locator("#routeMap")).toBeVisible();
}

// Plays one step. wrong: answer exercises of these sections incorrectly.
async function playStep(page, wrong = []) {
  const step = await page.evaluate(() => { const s = window.__step(); return s && { t: s.t, ex: s.ex && { k: s.ex.k, answer: s.ex.answer, opts: s.ex.opts, section: s.ex.section } }; });
  const btn = page.locator("#checkBtn");
  if (step.t === "finish") return "finish";
  if (step.t === "mission") {
    await page.locator("#chatInput").fill("Hola, me llamo Claire y soy de Holanda");
    await page.locator("#sendBtn").click();
    await expect(page.locator("#chat .msg.them")).toHaveCount(2);
    await btn.click();
    await expect(page.locator("#feedback")).toBeVisible();
    await btn.click();
    return step.t;
  }
  if (step.t !== "ex") { await btn.click(); return step.t; }
  const bad = wrong.includes(step.ex.section);
  const body = page.locator("#lbody");
  if (step.ex.k === "mc") {
    const pick = bad ? step.ex.opts.find((o) => o !== step.ex.answer) : step.ex.answer;
    await body.locator(".opt", { hasText: new RegExp("^" + pick.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }).first().click();
  } else if (step.ex.k === "order") {
    if (bad) await body.locator(".bank .tok").first().click();
    else for (const w of step.ex.answer.split(" ")) await body.locator(".bank .tok:not(.used)", { hasText: new RegExp("^" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }).first().click();
  } else if (step.ex.k === "speak") {
    await page.evaluate((b) => (window.__wrongSpeak = b), bad);
    await page.locator("#recBtn").click();
    await expect(page.locator("#verdict")).toBeVisible();
    await btn.click();
    return step.t;
  } else {
    await body.locator("#ans").fill(bad ? "xyz" : step.ex.answer);
  }
  await btn.click();
  await expect(page.locator("#verdict")).toBeVisible();
  await btn.click();
  return step.t;
}
async function playSession(page, wrong = []) {
  for (let i = 0; i < 120; i++) if ((await playStep(page, wrong)) === "finish") break;
  await expect(page.locator(".finish")).toBeVisible();
  await expect(page.locator("#checkBtn")).toHaveText("Terug naar paspoort");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(speechStub);
  await page.route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
});

test("full session 2: all steps, then rest day and Augusto's panel", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Claire's real state: session 1 done 2 days ago, 30 cards, two of them missed and due today.
  await seed(page, {
    results: [{ n: 1, done_on: dayAgo(2), on_time: true, detail: { legacy: true } }],
    cards: Array.from({ length: 30 }, (_, i) => ({ item_id: "w1-" + pad(i + 1), es: "x", due: i < 2 ? dayAgo(0) : dayAgo(-3), ko: i < 2 ? 2 : 0, box: i < 2 ? 0 : 2 })),
    days: [{ day: dayAgo(2), xp: 1435, minutes: 21.3, lessons: 7 }],
  });
  await expect(page.locator("#todaySub")).toContainText("Sessie 2 van 24");
  await expect(page.locator("#streakN")).toHaveText("1");
  await expect(page.locator("#xpN")).toHaveText("1435 XP");
  await expect(page.locator("#routeMap .r-node")).toHaveCount(24);
  await expect(page.locator("#curNode")).toBeInViewport();
  await expect(page.locator("#routeMap .r-stamp")).toHaveCount(7);
  await page.screenshot({ path: shots + "1-home-session.png", fullPage: true });

  await page.locator("#startBtn").click();
  // Review comes first, and the missed cards are in it.
  const first = await page.evaluate(() => window.__step());
  expect(first.section).toBe("review");
  await playStep(page);
  const firstEx = await page.evaluate(() => window.__step().ex);
  expect(["w1-01", "w1-02"]).toContain(firstEx.itemId);
  let sawGrammar = false, sawMission = false, sawSpeak = false, sawPhrase = false;
  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => window.__step());
    if (s.t === "grammar") { sawGrammar = true; await expect(page.locator(".compare")).toContainText("Nederlands"); await page.screenshot({ path: shots + "2-grammar.png" }); }
    if (s.t === "phrase" && !sawPhrase) { sawPhrase = true; await expect(page.locator(".example")).toBeVisible(); await page.screenshot({ path: shots + "3-phrase.png" }); }
    if (s.t === "mission") { sawMission = true; await expect(page.locator(".mission-card")).toContainText("water zonder koolzuur"); }
    if (s.t === "ex" && s.ex.k === "speak") sawSpeak = true;
    if ((await playStep(page)) === "finish") break;
  }
  expect([sawGrammar, sawMission, sawSpeak, sawPhrase]).toEqual([true, true, true, true]);
  await expect(page.locator("#finish")).toContainText(/sessie 2 klaar/i);
  await expect(page.locator("#finish")).toContainText("Missie geslaagd");
  await page.screenshot({ path: shots + "4-finish.png" });
  await page.locator("#checkBtn").click();

  // Rest day now: nothing asked, next session in 2 days, optional review offered.
  await expect(page.locator("#todayTitle")).toHaveText("Rustdag");
  await expect(page.locator("#nextSession")).toBeVisible();
  await expect(page.locator("#startBtn")).toBeDisabled();
  await expect(page.locator("#streakN")).toHaveText("2");
  await page.screenshot({ path: shots + "5-rest.png", fullPage: true });

  // Augusto's panel
  const aug = await context.newPage();
  await aug.goto("/index.html?mock=owner");
  await aug.locator('#nav [data-tab="panel"]').click();
  await expect(aug.locator("#pSessionsTable")).toContainText("✓");
  await expect(aug.locator("#pSessionsTable tbody tr")).toHaveCount(2);
  await expect(aug.locator("#pGrammar .bar-row")).toHaveCount(1);
  await expect(aug.locator("#pWhere")).toContainText("Rest day today");
  await expect(aug.locator("#pFlags")).toBeEmpty();
  await aug.screenshot({ path: shots + "6-panel.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("no second new session on the same day; optional review works", async ({ page }) => {
  await seed(page, { results: [{ n: 1, done_on: dayAgo(0), on_time: true }], cards: [{ item_id: "w1-05", es: "Me llamo Claire", due: dayAgo(0) }] });
  await expect(page.locator("#todayTitle")).toHaveText("Rustdag");
  await expect(page.locator("#startBtn")).toBeDisabled();
  await page.locator("#reviewBtn").click();
  for (let i = 0; i < 30; i++) if ((await playStep(page)) === "finish") break;
  await expect(page.locator(".finish")).toContainText("XP");
  await page.locator("#checkBtn").click();
  await expect(page.locator("#todayTitle")).toHaveText("Rustdag");
});

test("late session: allowed the day after, plan shifts and the streak restarts", async ({ page }) => {
  await seed(page, { results: [{ n: 1, done_on: dayAgo(3), on_time: true }] });
  await expect(page.locator("#late")).toBeVisible();
  await page.locator("#startBtn").click();
  await playSession(page);
  await page.locator("#checkBtn").click();
  await expect(page.locator("#streakN")).toHaveText("0");
  await expect(page.locator("#todayTitle")).toHaveText("Rustdag");
});

test("weekly test passed gives the stamp", async ({ page }) => {
  await seed(page, { results: [1, 2, 3].map((n) => ({ n, done_on: dayAgo(8 - 2 * n), on_time: true })) });
  await expect(page.locator("#todaySub")).toContainText("Sessie 4 van 24");
  await expect(page.locator("#todaySub")).toContainText("met weektoets");
  await page.locator("#startBtn").click();
  await playSession(page);
  await expect(page.locator(".test-result.ok")).toContainText('Stempel "¡Hola!"');
  await page.locator("#checkBtn").click();
  await expect(page.locator(".big-stamp")).toBeVisible();
  await page.screenshot({ path: shots + "7-stamp.png" });
  await page.locator("#stampOk").click();
  await expect(page.locator('#routeMap [data-stamp="1"].earned')).toBeVisible();
});

test("weekly test below 70% is retried, and a quiz below 60% is flagged in the panel", async ({ page, context }) => {
  await seed(page, { results: [1, 2, 3].map((n) => ({ n, done_on: dayAgo(8 - 2 * n), on_time: true })) });
  await page.locator("#startBtn").click();
  await playSession(page, ["quiz", "test"]);
  await expect(page.locator(".test-result.no")).toContainText("volgende sessie opnieuw");
  await page.locator("#checkBtn").click();
  await expect(page.locator('#routeMap [data-stamp="1"].earned')).toHaveCount(0);
  const aug = await context.newPage();
  await aug.goto("/index.html?mock=owner");
  await aug.locator('#nav [data-tab="panel"]').click();
  await expect(aug.locator("#pFlags")).toContainText("Session 4");
  await expect(aug.locator("#pTests")).toContainText("retake next session");
  await expect(aug.locator("#pSessionsTable tr.low")).toHaveCount(1);
});

test("week 2: session 7 ends with the week 2 test and the Restaurant stamp", async ({ page }) => {
  const results = [1, 2, 3, 4, 5, 6].map((n) => ({ n, week: n <= 4 ? 1 : 2, done_on: dayAgo(14 - 2 * n), on_time: true }));
  results[3].detail = { tests: [{ week: 1, ok: 9, total: 10, passed: true }] };
  await seed(page, { results });
  await expect(page.locator("#todaySub")).toContainText("Sessie 7 van 24");
  await expect(page.locator("#todaySub")).toContainText("met weektoets");
  await page.locator("#startBtn").click();
  await playSession(page);
  await expect(page.locator(".test-result.ok")).toContainText('Stempel "Restaurant"');
  await page.locator("#checkBtn").click();
  await page.locator("#stampOk").click();
  await expect(page.locator('#routeMap [data-stamp="2"].earned')).toBeVisible();
  await page.locator('#nav [data-tab="passport"]').click();
  await expect(page.locator("#stampCount")).toHaveText("2 van 7 stempels");
});

test("week 3: session 11 ends with the week 3 test and the 'Taxi en geld' stamp", async ({ page }) => {
  const week = (n) => (n <= 4 ? 1 : n <= 7 ? 2 : 3);
  const results = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, week: week(i + 1), done_on: dayAgo(22 - 2 * (i + 1)), on_time: true }));
  results[3].detail = { tests: [{ week: 1, ok: 9, total: 10, passed: true }] };
  results[6].detail = { tests: [{ week: 2, ok: 8, total: 10, passed: true }] };
  await seed(page, { results });
  await expect(page.locator("#todaySub")).toContainText("Sessie 11 van 24");
  await expect(page.locator("#todaySub")).toContainText("met weektoets");
  await page.locator("#startBtn").click();
  await playSession(page);
  await expect(page.locator(".test-result.ok")).toContainText('Stempel "Taxi en geld"');
});

test("week 4: session 14 ends with the week 4 test and the 'Markt' stamp", async ({ page }) => {
  const week = (n) => (n <= 4 ? 1 : n <= 7 ? 2 : n <= 11 ? 3 : 4);
  const results = Array.from({ length: 13 }, (_, i) => ({ n: i + 1, week: week(i + 1), done_on: dayAgo(28 - 2 * (i + 1)), on_time: true }));
  results[3].detail = { tests: [{ week: 1, ok: 9, total: 10, passed: true }] };
  results[6].detail = { tests: [{ week: 2, ok: 8, total: 10, passed: true }] };
  results[10].detail = { tests: [{ week: 3, ok: 8, total: 10, passed: true }] };
  await seed(page, { results });
  await expect(page.locator("#todaySub")).toContainText("Sessie 14 van 24");
  await page.locator("#startBtn").click();
  await playSession(page);
  await expect(page.locator(".test-result.ok")).toContainText('Stempel "Markt"');
});

test("week 5: session 18 ends with the week 5 test and the 'Apotheek' stamp", async ({ page }) => {
  const week = (n) => (n <= 4 ? 1 : n <= 7 ? 2 : n <= 11 ? 3 : n <= 14 ? 4 : 5);
  const results = Array.from({ length: 17 }, (_, i) => ({ n: i + 1, week: week(i + 1), done_on: dayAgo(36 - 2 * (i + 1)), on_time: true }));
  for (const [i, w] of [[3, 1], [6, 2], [10, 3], [13, 4]]) results[i].detail = { tests: [{ week: w, ok: 9, total: 10, passed: true }] };
  await seed(page, { results });
  await expect(page.locator("#todaySub")).toContainText("Sessie 18 van 24");
  await page.locator("#startBtn").click();
  await playSession(page);
  await expect(page.locator(".test-result.ok")).toContainText('Stempel "Apotheek"');
});

test("week 6: session 21 ends with the week 6 test and the 'Familie' stamp", async ({ page }) => {
  const week = (n) => (n <= 4 ? 1 : n <= 7 ? 2 : n <= 11 ? 3 : n <= 14 ? 4 : n <= 18 ? 5 : 6);
  const results = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, week: week(i + 1), done_on: dayAgo(42 - 2 * (i + 1)), on_time: true }));
  for (const [i, w] of [[3, 1], [6, 2], [10, 3], [13, 4], [17, 5]]) results[i].detail = { tests: [{ week: w, ok: 9, total: 10, passed: true }] };
  await seed(page, { results });
  await expect(page.locator("#todaySub")).toContainText("Sessie 21 van 24");
  await page.locator("#startBtn").click();
  await playSession(page);
  await expect(page.locator(".test-result.ok")).toContainText('Stempel "Familie"');
});

test("a half-done session resumes where she left it", async ({ page }) => {
  await seed(page, { results: [{ n: 1, done_on: dayAgo(2), on_time: true }] });
  await page.locator("#startBtn").click();
  for (let i = 0; i < 6; i++) await playStep(page);
  const at = await page.evaluate(() => window.__step());
  await page.locator("#quitBtn").click();
  await expect(page.locator("#verdict")).toContainText("telt pas als je hem afmaakt");
  await page.locator("#quitBtn").click();
  await expect(page.locator("#startBtn")).toHaveText("VERDER");
  await page.reload();
  await page.locator("#startBtn").click();
  const again = await page.evaluate(() => window.__step());
  expect(again).toEqual(at);
});
