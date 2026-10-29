// Same session flow against the real Supabase project, using ONLY the owner account (Augusto).
// Claire's real progress is never written: her state is only checked read-only through "Ver como Claire".
// Only runs with REAL_TEST=1, SB_SERVICE_KEY and OWNER_EMAIL; afterwards deletes the owner's rows only.
// AI calls are intercepted here (the Worker only allows the GitHub Pages origin); the Worker is tested separately.
import { test, expect } from "@playwright/test";

const REF = "zesmxymaxnpcyrswaksf";
const BASE = `https://${REF}.supabase.co`;
const KEY = process.env.SB_SERVICE_KEY, OWNER = process.env.OWNER_EMAIL;
test.skip(!process.env.REAL_TEST || !KEY || !OWNER, "real backend test disabled");
test.describe.configure({ mode: "serial" }); // a new magic link invalidates the previous one

const admin = { apikey: KEY, authorization: "Bearer " + KEY };
let ownerId = null;
async function magicLink(email) {
  const json = await (await fetch(`${BASE}/auth/v1/admin/generate_link`, { method: "POST", headers: { ...admin, "content-type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) })).json();
  ownerId = json.id || json.user?.id || ownerId;
  return `https://example.invalid/verify?token=${json.hashed_token || json.properties.hashed_token}&type=magiclink`;
}
async function wipeOwner() {
  if (!ownerId) {
    const users = await (await fetch(`${BASE}/auth/v1/admin/users?per_page=50`, { headers: admin })).json();
    ownerId = users.users.find((u) => u.email === OWNER)?.id;
  }
  if (!ownerId) throw new Error("owner not found");
  for (const t of ["progress_days", "cards", "session_results", "sessions", "dialogs", "stops", "api_usage"]) {
    const r = await fetch(`${BASE}/rest/v1/${t}?user_id=eq.${ownerId}`, { method: "DELETE", headers: admin });
    if (!r.ok) throw new Error(`wipe ${t}: ${r.status}`);
  }
}
test.beforeAll(wipeOwner);
test.afterAll(wipeOwner);

test("real backend: owner plays session 1, it is saved; Claire's migrated state reads correctly", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => { const F = class { start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: window.__said || "" }]] }); this.onend?.(); }, 30); } stop() {} }; window.SpeechRecognition = F; window.webkitSpeechRecognition = F; });
  await page.route("**/espanol-lima.claude-messages.workers.dev/**", (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    const out = r.request().url().endsWith("/dialog") ? { text: "¡Qué bien! ¿Y de dónde eres?" } : { goal_met: true, goal_note: "Goed.", score: 4, praise: "Goed gedaan.", errors: [] };
    r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(out) });
  });

  await page.goto("/index.html");
  await expect(page.locator("#loginForm")).toBeVisible();
  await page.evaluate(() => { document.getElementById("pasteForm").hidden = false; });
  await page.locator("#paste").fill(await magicLink(OWNER));
  await page.locator("#pasteBtn").click();
  await expect(page.locator("#homeName")).toHaveText("Augusto", { timeout: 15000 });
  await expect(page.locator("#ticketDay")).toHaveText("INSTAPKAART · SESSIE 1");

  // Play the whole session. The real store has no test hook, so answers are read from the content file.
  const content = await (await page.request.get("/content/semana-1.json")).json();
  const s1 = content.sessions[0];
  const esByNl = Object.fromEntries(s1.items.map((i) => [i.nl, i.es]));
  const answersEs = new Set(s1.items.map((i) => i.es));
  await page.locator("#board").click();
  for (let i = 0; i < 150; i++) {
    const btn = page.locator("#checkBtn");
    if (await page.locator(".finish").count()) break;
    if (await page.locator("#chatInput").isVisible().catch(() => false)) {
      await page.locator("#chatInput").fill("Me llamo Claire, soy de Holanda y vivo en Róterdam");
      await page.locator("#sendBtn").click();
      await expect(page.locator("#chat .msg.them")).toHaveCount(2);
      await btn.click(); await expect(page.locator("#feedback")).toBeVisible(); await btn.click();
      continue;
    }
    if (await page.locator("#recBtn").isVisible().catch(() => false)) {
      const said = (await page.locator("#lbody .prompt").textContent()).trim();
      await page.evaluate((s) => (window.__said = s), said);
      await page.locator("#recBtn").click(); await expect(page.locator("#verdict")).toBeVisible(); await btn.click();
      continue;
    }
    if (await page.locator("#lbody .opt").count()) await page.locator("#lbody .opt").first().click();
    else if (await page.locator("#lbody .bank .tok").count()) await page.locator("#lbody .bank .tok").first().click();
    else if (await page.locator("#ans").count()) { const p = (await page.locator("#lbody .prompt").count()) ? (await page.locator("#lbody .prompt").textContent()).trim() : ""; await page.locator("#ans").fill(esByNl[p] || [...answersEs][0]); }
    if (await btn.isDisabled()) continue;
    await btn.click();
    if (await page.locator("#verdict").isVisible()) await btn.click();
  }
  await expect(page.locator(".finish")).toContainText("SESSIE 1 KLAAR");
  await expect(page.locator("#checkBtn")).toHaveText("Terug naar paspoort", { timeout: 15000 });
  await page.locator("#checkBtn").click();

  // Saved in Supabase: survives a reload
  await page.reload();
  await expect(page.locator("#ticketDay")).toHaveText("RUSTDAG");
  await expect(page.locator("#homeStats")).toContainText("1 sessie op tijd");

  // Claire's migrated progress, read-only
  await page.locator('#nav [data-tab="panel"]').click();
  await expect(page.locator("#pSessionsTable tbody tr")).toHaveCount(1);
  await page.locator("#viewAs").click();
  await expect(page.locator("#homeName")).toHaveText("Claire");
  await expect(page.locator("#homeStats")).toHaveText("1 sessie op tijd · 1435 XP");
  await expect(page.locator(".banner")).toContainText("solo lectura");
  expect(errors).toEqual([]);
});
