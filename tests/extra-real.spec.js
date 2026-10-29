// "Extra oefenen" against the real Worker and model: asks for at least 20 exercises and fails if any of them is
// incomplete (no phrase to translate, no answer, bad options...). Uses ONLY the owner account (Augusto); it only
// reads content and calls /extra, which writes nothing but the owner's own usage counter.
// Runs with REAL_TEST=1, SB_SERVICE_KEY and OWNER_EMAIL (the service key is only used to sign the owner in).
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { completeExercise } from "../js/extra-check.js";

const REF = "zesmxymaxnpcyrswaksf", BASE = `https://${REF}.supabase.co`;
const WORKER = "https://espanol-lima.claude-messages.workers.dev", ORIGIN = "https://agvergara9431-dev.github.io";
const KEY = process.env.SB_SERVICE_KEY, OWNER = process.env.OWNER_EMAIL;
test.skip(!process.env.REAL_TEST || !KEY || !OWNER, "real backend test disabled");

async function ownerToken() {
  const roles = await (await fetch(`${BASE}/rest/v1/allowed_users?select=role&email=eq.${encodeURIComponent(OWNER.toLowerCase())}`, { headers: { apikey: KEY, authorization: "Bearer " + KEY } })).json();
  if (!Array.isArray(roles) || roles[0]?.role !== "owner") throw new Error("OWNER_EMAIL is not the owner account");
  const link = await (await fetch(`${BASE}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: KEY, authorization: "Bearer " + KEY, "content-type": "application/json" }, body: JSON.stringify({ type: "magiclink", email: OWNER }) })).json();
  const anon = readFileSync("js/config.js", "utf8").match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)[1];
  const session = await (await fetch(`${BASE}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token || link.properties.hashed_token }) })).json();
  if (!session.access_token) throw new Error("could not sign the owner in");
  return session.access_token;
}

test("real Worker: 20+ Extra oefenen exercises, all complete (Dutch and English)", async () => {
  test.setTimeout(300_000);
  const token = await ownerToken();
  const items = [1, 2, 3, 4, 5].flatMap((w) => JSON.parse(readFileSync(`content/semana-${w}.json`, "utf8")).sessions.flatMap((s) => s.items));
  const all = [], bad = [];
  for (let round = 0; all.length < 20 && round < 5; round++) {
    const words = items.sort(() => Math.random() - 0.5).slice(0, 10).map((it) => ({ es: it.es, nl: round % 2 ? it.en : it.nl }));
    const r = await fetch(WORKER + "/extra", { method: "POST", headers: { origin: ORIGIN, authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ words, lang: round % 2 ? "en" : "nl" }) });
    expect(r.status, await r.clone().text()).toBe(200);
    const { exercises } = await r.json();
    expect(exercises.length).toBeGreaterThanOrEqual(4);
    for (const e of exercises) { all.push(e); if (!completeExercise(e)) bad.push(e); }
  }
  console.log(`${all.length} exercises: ${["mc", "fill", "type"].map((k) => k + " " + all.filter((e) => e.type === k).length).join(", ")}`);
  expect(all.length).toBeGreaterThanOrEqual(20);
  expect(bad).toEqual([]);
});
