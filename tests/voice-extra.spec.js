// Female Spanish voice (auto pick by name, selector with a Try button saved per user, same voice everywhere),
// "Extra oefenen" never showing an incomplete exercise, and audio buttons wherever there is Spanish.
import { test, expect } from "@playwright/test";

const LEARNER = "00000000-0000-0000-0000-00000000000c";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

// Fake speech engine with the voices of an iPhone: a male one first (what Claire heard), then female ones.
const fakeVoices = () => {
  const voices = [{ name: "Jorge", lang: "es-ES" }, { name: "Juan", lang: "es-MX" }, { name: "Mónica", lang: "es-ES" }, { name: "Paulina", lang: "es-MX" }, { name: "Samantha", lang: "en-US" }];
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, "speechSynthesis", { value: { getVoices: () => voices, speak: (u) => window.__spoken.push({ text: u.text, voice: u.voice?.name }), cancel() {}, addEventListener() {} } });
};
async function open(page, d = 1) {
  await page.addInitScript(fakeVoices);
  await page.goto("/index.html?mock=learner");
  await page.evaluate(({ LEARNER, d }) => { localStorage.clear(); localStorage.setItem("mockdb-v1", JSON.stringify({ session_results: [{ user_id: LEARNER, n: 1, week: 1, done_on: d, on_time: true, detail: {} }] })); }, { LEARNER, d: dayAgo(d) });
  await page.reload();
  await expect(page.locator("#routeMap")).toBeVisible();
}
const lastVoice = (page) => page.evaluate(() => window.__spoken.at(-1)?.voice);

test("voice: a female Spanish voice by default, chosen in settings, saved and used everywhere", async ({ page }) => {
  await open(page);
  await page.locator('#nav [data-tab="words"]').click();
  await page.locator("[data-say]").first().click();
  expect(await lastVoice(page)).toBe("Paulina"); // not Jorge, although he comes first
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#luciaSettings").click();
  await expect(page.locator("#setVoice option").first()).toHaveText("Automatisch (vrouwenstem): Paulina");
  await expect(page.locator("#setVoice option")).toHaveCount(5); // auto + 4 Spanish voices, no English one
  await page.locator("#setVoice").selectOption("Mónica");
  expect(await lastVoice(page)).toBe("Mónica");
  await page.locator("#voiceTry").click();
  expect(await page.evaluate(() => window.__spoken.at(-1))).toEqual({ text: "¡Hola! Soy Lucía, de Lima. ¿Cómo estás?", voice: "Mónica" });
  await page.screenshot({ path: "test-results/screens/voice-settings.png" });
  // Saved per user: after a reload the whole app (here the words list) speaks with Mónica.
  await page.reload();
  await page.locator('#nav [data-tab="words"]').click();
  await page.locator("[data-say]").first().click();
  expect(await lastVoice(page)).toBe("Mónica");
});

test("Extra oefenen: incomplete exercises are never shown, and every exercise has Spanish audio", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__mockExtra = () => ({ exercises: [
      { type: "type", word: "Buenos días", q: "Vertaal naar het Spaans", prompt: "", answer: "Buenos días", alt: [], why: "" }, // the bug Claire saw
      { type: "mc", word: "Gracias", q: "Hoe zeg je dit?", prompt: "Dank je", opts: ["Gracias", "Hola"], answer: "Gracias", alt: [], why: "" }, // too few options
      { type: "mc", word: "Gracias", q: "Wat betekent dit?", prompt: "Gracias", opts: ["Dank je", "Hallo", "Tot ziens"], answer: "Dank je", alt: [], why: "Gracias = dank je." },
      { type: "fill", word: "Me llamo", q: "Maak de zin af", prompt: "Me ___ Claire.", opts: ["llamo", "llama", "llamas"], answer: "llamo", alt: [], why: "Ik: me llamo." },
      { type: "type", word: "Buenos días", q: "Vertaal naar het Spaans", prompt: "Goedemorgen", answer: "Buenos días", alt: [], why: "" },
      { type: "mc", word: "Hola", q: "Hoe zeg je dit?", prompt: "Hallo", opts: ["Hola", "Adiós", "Gracias"], answer: "Hola", alt: [], why: "" },
    ] });
  });
  await page.locator("#extraBtn").click();
  await expect(page.locator("#lesson")).toBeVisible();
  const seen = [];
  for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(() => { const s = window.__step(); return { t: s.t, k: s.ex?.k, answer: s.ex?.answer, prompt: s.ex?.prompt, lang: s.ex?.lang, blank: s.ex?.blank }; });
    if (s.t !== "ex") break;
    seen.push(s.prompt);
    await expect(page.locator("#lbody .prompt")).not.toBeEmpty();
    if (s.lang === "es" && !s.blank) await expect(page.locator("#lbody .speak")).toBeVisible(); // Spanish prompt: audio before answering
    if (s.k === "mc") await page.locator("#lbody .opt", { hasText: new RegExp("^" + s.answer + "$") }).click();
    else await page.locator("#ans").fill(s.answer);
    await page.locator("#checkBtn").click();
    await expect(page.locator("#verdict .speak")).toBeVisible(); // the Spanish sentence after answering
    await page.locator("#verdict .speak").click();
    const said = await page.evaluate(() => window.__spoken.at(-1).text);
    expect(said).toBe(s.blank ? s.prompt.replace("___", s.answer) : s.lang === "es" ? s.prompt : s.answer);
    if (i === 1) await page.screenshot({ path: "test-results/screens/extra-audio.png" });
    await page.locator("#checkBtn").click();
  }
  expect(seen.sort()).toEqual(["Gracias", "Goedemorgen", "Hallo", "Me ___ Claire."].sort());
});

test("grammar multiple choice: the side marked Spanish is Spanish, and the other one is not", async () => {
  const { readFileSync } = await import("node:fs");
  const ES = /[áéíóúñ¿¡]|\b(el|la|los|las|un|una|es|soy|que|por|para|con|mi|tu|su|y|del|muy|hay|son|vamos|voltee|podemos|quisiera|dos|ciento|soles)\b|(ientos|enta|ce)$/i;
  const wrong = [];
  for (let w = 1; w <= 7; w++) {
    const week = JSON.parse(readFileSync(`content/semana-${w}.json`, "utf8"));
    for (const s of week.sessions || []) for (const g of [s.grammar, s.grammar?.en].filter(Boolean)) for (const ex of g.exercises || []) {
      if (ex.type !== "mc") continue;
      const side = ex.say || "answer";
      const es = side === "none" ? null : ex[side], other = side === "prompt" ? ex.answer : ex.prompt;
      if (es !== null && !ES.test(es)) wrong.push(`${s.n} Spanish side not Spanish: ${es}`);
      if (ES.test(other) && !/^\d/.test(other)) wrong.push(`${s.n} other side looks Spanish: ${other}`);
    }
  }
  expect(wrong).toEqual([]);
});
