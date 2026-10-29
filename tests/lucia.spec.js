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
