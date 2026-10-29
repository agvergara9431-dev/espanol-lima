// Side margins inside the session, in Chromium and in Safari's engine (WebKit), iPhone size:
// every visible element of every step type must stay at least 16px from the left and right edges.
import { test, expect, webkit, chromium, devices } from "@playwright/test";

const LEARNER = "00000000-0000-0000-0000-00000000000c";
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

for (const [name, engine] of [["webkit", webkit], ["chromium", chromium]]) {
  test(`session screens keep a 16px side margin (${name})`, async () => {
    test.setTimeout(120_000);
    const browser = await engine.launch();
    const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: "http://localhost:5173" });
    const page = await ctx.newPage();
    await page.addInitScript(() => { const F = class { start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: window.__step?.()?.ex?.answer || "" }]] }); this.onend?.(); }, 30); } stop() {} }; window.SpeechRecognition = F; window.webkitSpeechRecognition = F; });
    await page.goto("/index.html?mock=learner");
    await page.evaluate(({ LEARNER, d }) => {
      localStorage.clear();
      localStorage.setItem("mockdb-v1", JSON.stringify({ session_results: [{ user_id: LEARNER, n: 1, week: 1, done_on: d, on_time: true, detail: {} }] }));
    }, { LEARNER, d: dayAgo(2) });
    await page.reload();
    await page.locator("#startBtn").click();
    const seen = new Set(), problems = [];
    const measure = async (label) => {
      const bad = await page.evaluate(() => {
        const W = document.documentElement.clientWidth, out = [];
        if (document.querySelector("#lesson").scrollWidth > W + 1) out.push("horizontal scroll in #lesson");
        for (const el of document.querySelectorAll("#lesson .lbody *, #lesson .lfoot .btn, #lesson .lhead > *")) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.left < 15.5 || W - r.right < 15.5) out.push(`${el.tagName.toLowerCase()}.${el.className || ""}: left ${Math.round(r.left)}, right ${Math.round(W - r.right)}`);
        }
        return out.slice(0, 4);
      });
      if (bad.length) problems.push(label + " -> " + bad.join(" | "));
    };
    for (let i = 0; i < 120; i++) {
      const s = await page.evaluate(() => { const s = window.__step(); return { t: s.t, k: s.ex?.k, answer: s.ex?.answer }; });
      const key = s.t === "ex" ? "ex-" + s.k : s.t;
      if (!seen.has(key)) { seen.add(key); await measure(key); if (key === "phrase") await page.screenshot({ path: `test-results/screens/margin-phrase-${name}.png` }); }
      if (s.t === "mission") break;
      const btn = page.locator("#checkBtn");
      if (s.t !== "ex") { await btn.click(); continue; }
      const b = page.locator("#lbody");
      if (s.k === "mc") await b.locator(".opt", { hasText: new RegExp("^" + s.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }).first().click();
      else if (s.k === "order") for (const w of s.answer.split(" ")) await b.locator(".bank .tok:not(.used)", { hasText: new RegExp("^" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") }).first().click();
      else if (s.k === "speak") { await page.locator("#recBtn").click(); await expect(page.locator("#verdict")).toBeVisible(); await measure("ex-speak-verdict"); await btn.click(); continue; }
      else await b.locator("#ans").fill(s.answer);
      await btn.click();
      if (!seen.has("verdict")) { seen.add("verdict"); await measure("verdict"); }
      await btn.click();
    }
    await browser.close();
    expect(problems).toEqual([]);
  });
}
