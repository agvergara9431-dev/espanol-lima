// Same flow against the real Supabase project (only runs with REAL_TEST=1 and SB_SERVICE_KEY in the environment).
// Logs in by pasting a magic link generated with the admin API (no mail is sent), then deletes all test data.
import { test, expect } from "@playwright/test";

const REF = "zesmxymaxnpcyrswaksf";
const BASE = `https://${REF}.supabase.co`;
const KEY = process.env.SB_SERVICE_KEY;
const LEARNER = process.env.LEARNER_EMAIL, OWNER = process.env.OWNER_EMAIL;
test.skip(!process.env.REAL_TEST || !KEY || !LEARNER || !OWNER, "real backend test disabled");
// A new magic link invalidates the previous one for the same email, so never run copies of this test in parallel.
test.describe.configure({ mode: "serial" });

async function magicLink(email) {
  const res = await fetch(`${BASE}/auth/v1/admin/generate_link`, {
    method: "POST", headers: { apikey: KEY, authorization: "Bearer " + KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const json = await res.json();
  if (!json.hashed_token && !json.properties?.hashed_token) throw new Error("no link: " + JSON.stringify(json).slice(0, 200));
  return `https://example.invalid/verify?token=${json.hashed_token || json.properties.hashed_token}&type=magiclink`;
}
async function login(page, email) {
  await page.goto("/index.html");
  await expect(page.locator("#loginForm")).toBeVisible();
  await page.evaluate(() => { document.getElementById("pasteForm").hidden = false; });
  await page.locator("#paste").fill(await magicLink(email));
  await page.locator("#pasteBtn").click();
  await expect(page.locator("#homeName")).toBeVisible({ timeout: 15000 });
}
async function wipe() {
  // Delete through the REST API with the service key (bypasses RLS) so the app starts from zero.
  for (const t of ["progress_days", "cards", "stops", "sessions", "dialogs", "api_usage"]) {
    await fetch(`${BASE}/rest/v1/${t}?user_id=not.is.null`, { method: "DELETE", headers: { apikey: KEY, authorization: "Bearer " + KEY } });
  }
  await fetch(`${BASE}/rest/v1/notes?id=eq.1`, { method: "DELETE", headers: { apikey: KEY, authorization: "Bearer " + KEY } });
}

test.beforeAll(wipe);
test.afterAll(wipe);

test("real backend: lesson by Claire shows up live in Augusto's panel", async ({ browser }) => {
  const errors = [];
  const watch = (p, who) => { p.on("pageerror", (e) => errors.push(who + ": " + e.message)); p.on("console", (m) => m.type() === "error" && errors.push(who + ": " + m.text())); };
  const opts = test.info().project.use;
  const cc = await browser.newContext(opts), ac = await browser.newContext(opts);
  await cc.route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
  const claire = await cc.newPage(); watch(claire, "claire");
  const aug = await ac.newPage(); watch(aug, "augusto");

  await login(claire, LEARNER);
  await expect(claire.locator("#homeName")).toHaveText("Claire");
  await expect(claire.locator("#homeStats")).toHaveText("0 dagen op rij · 0 XP");
  await expect(claire.locator("#ticketDay")).toHaveText("INSTAPKAART · DAG 1");

  await login(aug, OWNER);
  await expect(aug.locator("#homeName")).toHaveText("Augusto");
  await aug.locator('#nav [data-tab="panel"]').click();
  await expect(aug.locator("#pSessions")).toContainText("Todavía nada");

  // Claire: full lesson
  await claire.locator("#board").click();
  for (let i = 0; i < 12; i++) {
    const body = claire.locator("#lbody");
    if (await body.locator(".opt").count()) await body.locator(".opt").first().click();
    else if (await body.locator(".bank .tok").count()) await body.locator(".bank .tok").first().click();
    else await body.locator("#ans").fill("hola");
    await claire.locator("#checkBtn").click();
    await claire.locator("#checkBtn").click();
  }
  await expect(claire.locator("#finish")).toBeVisible();
  await claire.locator("#checkBtn").click();
  await expect(claire.locator('[data-task="lesson"]')).toHaveClass(/done/);

  // Saved: survives a reload
  await claire.reload();
  await expect(claire.locator('[data-task="lesson"]')).toHaveClass(/done/);
  await expect(claire.locator("#homeStats")).toContainText("1 dag op rij");

  // Augusto's panel updates via Realtime, no reload
  await expect(aug.locator("#pSessions")).toContainText("Lección · Begroeten", { timeout: 15000 });
  await expect(aug.locator("#pToday .on")).toContainText("Lección");
  await claire.locator('[data-task="phrase"]').click();
  await expect(aug.locator("#pSessions")).toContainText("Frase por WhatsApp", { timeout: 15000 });

  // Note reaches Claire live; Claire cannot write a note (RLS)
  await aug.locator("#noteInput").fill("Prueba");
  await aug.locator("#noteSave").click();
  await expect(aug.locator("#noteStatus")).toHaveText("Guardada.");
  await expect(claire.locator("#augNote")).toContainText("Prueba", { timeout: 15000 });

  // Ver como Claire
  await aug.locator("#viewAs").click();
  await expect(aug.locator("#homeName")).toHaveText("Claire");
  await expect(aug.locator('[data-task="lesson"]')).toHaveClass(/done/);

  expect(errors).toEqual([]);
  await cc.close(); await ac.close();
});
