// Lucía (mock backend): chat with a correction, a simulated proactive message with the unread badge,
// settings, the "Oefen een situatie" button, and the panel showing only the daily summary (never the chat).
import { test, expect } from "@playwright/test";

const LEARNER = "00000000-0000-0000-0000-00000000000c";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

async function open(page) {
  await page.goto("/index.html?mock=learner");
  await page.evaluate(({ LEARNER, d }) => {
    localStorage.clear();
    localStorage.setItem("mockdb-v1", JSON.stringify({ session_results: [{ user_id: LEARNER, n: 1, week: 1, done_on: d, on_time: true, detail: {} }] }));
  }, { LEARNER, d: dayAgo(1) });
  await page.reload();
  await expect(page.locator("#routeMap")).toBeVisible();
}

test("chat with Lucía: reply, correction and privacy line", async ({ page }) => {
  await open(page);
  await expect(page.locator('#nav [data-tab="chat"]')).toHaveCount(0); // Gesprek tab is gone
  await page.locator('#nav [data-tab="lucia"]').click();
  await expect(page.locator("#privacy")).toHaveText(/Augusto ziet een samenvatting van je oefening \(onderwerpen en fouten\), niet het hele gesprek\./);
  await page.locator("#linput").fill("Hola Lucía, yo soy de Holanda");
  await page.locator("#lsend").click();
  await expect(page.locator("#lchat .msg.them").last()).toContainText("doctorado");
  await expect(page.locator("#lchat .fix")).toContainText("Soy de Holanda");
  await expect(page.locator("#lchat .fix small")).toContainText("'Yo' mag weg");
  await page.screenshot({ path: "test-results/screens/lucia-chat.png" });
});

test("proactive message arrives live with an unread badge", async ({ page, context }) => {
  await open(page);
  await expect(page.locator("#luciaBadge")).toHaveCount(0);
  // Another tab writes the message, like the cron does through Supabase Realtime.
  const cron = await context.newPage();
  await cron.goto("/index.html?mock=learner");
  await cron.evaluate((LEARNER) => {
    const d = JSON.parse(localStorage.getItem("mockdb-v1"));
    d.chat_messages = [...(d.chat_messages || []), { id: 999, user_id: LEARNER, ts: new Date().toISOString(), role: "lucia", kind: "review", text: "¡Hola, Claire! Hoy descansas (helemaal optioneel): 1. ¿Cómo se dice 'ik heb het koud'?", corrections: [], read_at: null }];
    localStorage.setItem("mockdb-v1", JSON.stringify(d));
  }, LEARNER);
  await expect(page.locator("#luciaBadge")).toHaveText("1");
  await page.locator('#nav [data-tab="lucia"]').click();
  await expect(page.locator("#lchat .msg.proactive")).toContainText("ik heb het koud");
  await expect(page.locator("#lchat .msg.proactive .who")).toContainText("even herhalen");
  await expect(page.locator("#luciaBadge")).toHaveCount(0);
});

test("settings: pause, window and messages per day are saved", async ({ page }) => {
  await open(page);
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#luciaSettings").click();
  await page.locator("#setEnabled").uncheck();
  await page.locator("#setStart").selectOption("12");
  await page.locator("#setEnd").selectOption("10");
  await page.locator("#setSave").click();
  await expect(page.locator("#setStatus")).toContainText("eindtijd");
  await page.locator("#setStart").selectOption("10");
  await page.locator("#setEnd").selectOption("20");
  await page.locator('#setPerDay [data-n="3"]').click();
  await page.locator("#setSave").click();
  await expect(page.locator("#setStatus")).toHaveText("Opgeslagen.");
  await page.screenshot({ path: "test-results/screens/lucia-settings.png" });
  await page.locator("#setBack").click();
  await page.reload();
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#luciaSettings").click();
  await expect(page.locator("#setEnabled")).not.toBeChecked();
  await expect(page.locator("#setStart")).toHaveValue("10");
  await expect(page.locator("#setEnd")).toHaveValue("20");
  await expect(page.locator('#setPerDay [data-n="3"]')).toHaveAttribute("aria-pressed", "true");
});

test("'Oefen een situatie' opens the free scenarios and goes back to Lucía", async ({ page }) => {
  await open(page);
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#practiceBtn").click();
  await expect(page.locator("#tab-chat [data-sc]").first()).toBeVisible();
  await expect(page.locator('#nav [data-tab="lucia"]')).toHaveAttribute("aria-selected", "true");
  await page.locator("#scenBack").click();
  await expect(page.locator("#privacy")).toBeVisible();
});

test("panel shows the daily Lucía summary but never the chat text", async ({ page, context }) => {
  await open(page);
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#linput").fill("Hola, yo soy Claire y mi secreto es azul");
  await page.locator("#lsend").click();
  await expect(page.locator("#lchat .fix")).toBeVisible();
  const aug = await context.newPage();
  await aug.goto("/index.html?mock=owner");
  await aug.locator('#nav [data-tab="panel"]').click();
  await expect(aug.locator("#pLucia")).toContainText("2 messages");
  await expect(aug.locator("#pLucia")).toContainText("su doctorado");
  await expect(aug.locator("#pLucia")).toContainText("pronombre sobrante (1)");
  await expect(aug.locator("#tab-panel")).not.toContainText("mi secreto es azul");
  await aug.locator("#luciaTest").click();
  await expect(aug.locator("#luciaTestStatus")).toContainText("15 minutes");
});

test("chat order: oldest first, same-second messages ordered by id, input fixed above the tabs", async ({ page }) => {
  await open(page);
  // Two messages saved in the same second (same ts); stored in reverse order to prove the app sorts them.
  await page.evaluate((LEARNER) => {
    const d = JSON.parse(localStorage.getItem("mockdb-v1"));
    const ts = "2026-10-29T10:00:00.000Z", old = "2026-10-29T09:00:00.000Z";
    const m = (id, role, text, at) => ({ id, user_id: LEARNER, ts: at, role, kind: "chat", text, corrections: [], read_at: at });
    d.chat_messages = [m(12, "lucia", "¡Qué chévere, Claire! ¿Y tu hermana?", ts), m(11, "claire", "Mi familia es pequeña", ts), m(10, "lucia", "Hola, ¿cómo estás?", old)];
    for (let i = 0; i < 8; i++) d.chat_messages.push(m(i + 1, i % 2 ? "lucia" : "claire", "Mensaje viejo " + (i + 1), "2026-10-28T1" + i + ":00:00.000Z"));
    localStorage.setItem("mockdb-v1", JSON.stringify(d));
  }, LEARNER);
  await page.reload();
  await page.locator('#nav [data-tab="lucia"]').click();
  const texts = await page.locator("#lchat .msg span[lang=es]").allTextContents();
  expect(texts.slice(-3)).toEqual(["Hola, ¿cómo estás?", "Mi familia es pequeña", "¡Qué chévere, Claire! ¿Y tu hermana?"]);
  expect(texts[0]).toBe("Mensaje viejo 1");
  // Scrolled to the newest message.
  const chat = page.locator("#lchat");
  await expect.poll(() => chat.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
  // Input box sits right above the tab bar; the practice button is up in the header.
  const form = await page.locator("#lform").boundingBox(), nav = await page.locator("#nav").boundingBox();
  expect(Math.abs(nav.y - (form.y + form.height))).toBeLessThan(20);
  expect((await page.locator("#practiceBtn").boundingBox()).y).toBeLessThan(form.y);
  await page.screenshot({ path: "test-results/screens/lucia-order.png" });
  // A new message arriving live is appended at the bottom and scrolled into view.
  await page.locator("#linput").fill("Hola Lucía, yo soy de Holanda");
  await page.locator("#lsend").click();
  await expect(page.locator("#lchat .msg.them").last()).toContainText("doctorado");
  const after = await page.locator("#lchat .msg span[lang=es]").allTextContents();
  expect(after.slice(-2)).toEqual(["Hola Lucía, yo soy de Holanda", "¡Qué bacán! ¿Y qué estás investigando en tu doctorado?"]);
  await expect.poll(() => chat.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
  await page.screenshot({ path: "test-results/screens/lucia-after-send.png" });
});
