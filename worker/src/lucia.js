// Lucía: /chat (runs with the user's own token, so RLS applies) and the cron that sends proactive messages.
// The service role key is used ONLY in runCron(), and with it the Worker writes ONLY to Lucía's tables:
// chat_messages, chat_memory, chat_daily, lucia_settings, lucia_schedule. Other tables are only read there.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { sendPush } from "./push.js";

const MODEL = "claude-haiku-5-5";
const LUCIA_TABLES = new Set(["chat_messages", "chat_memory", "chat_daily", "lucia_settings", "lucia_schedule"]);
const Reply = z.object({
  reply: z.string(),
  corrections: z.array(z.object({ said: z.string(), better: z.string(), why: z.string() })).max(2),
  topic: z.string(),
  errors: z.array(z.string()).max(3),
});

// ---------- Supabase REST ----------
const userDb = (env, token) => ({ apikey: env.SUPABASE_ANON_KEY, authorization: "Bearer " + token });
async function rest(env, headers, path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...headers, "content-type": "application/json", ...(prefer ? { prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`db ${method} ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}
// Service-role access, restricted: writes only to Lucía's tables.
function serviceDb(env) {
  const headers = { apikey: env.SUPABASE_SERVICE_KEY, authorization: "Bearer " + env.SUPABASE_SERVICE_KEY };
  return {
    read: (path) => rest(env, headers, path),
    write: (table, query, opts) => {
      if (!LUCIA_TABLES.has(table)) throw new Error("service writes are limited to Lucía's tables: " + table);
      return rest(env, headers, table + query, opts);
    },
    async email(userId) {
      const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers });
      return r.ok ? (await r.json()).email?.toLowerCase() : null;
    },
  };
}

// ---------- helpers ----------
export function nlNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function loadJson(env, path) {
  const res = await fetch(`${env.CONTENT_BASE}/content/${path}?v=${Math.floor(Date.now() / 300000)}`, { cf: { cacheTtl: 300, cacheEverything: true } });
  return res.ok ? res.json() : null;
}
// Where Claire is: the next session, whether today is a session day, and the grammar she is on.
async function context(env, results, cards, today) {
  const done = (results || []).sort((a, b) => a.n - b.n);
  const last = done[done.length - 1];
  const next = last ? last.n + 1 : 1;
  const planned = last ? addDays(last.done_on, 2) : today;
  const rest = (last && last.done_on >= today) || today < planned;
  let grammar = "", sessionTitle = "";
  for (let w = 1; w <= 7 && !grammar; w++) {
    const week = await loadJson(env, `semana-${w}.json`);
    const s = week?.sessions?.find((x) => x.n === Math.min(next, 24)) || week?.sessions?.find((x) => x.n === next - 1);
    if (s?.grammar) { grammar = s.grammar.title_es; sessionTitle = s.title_es; }
  }
  const weak = (cards || []).filter((c) => c.ko > 0 && c.box <= 1).map((c) => c.es).slice(0, 6);
  const due = (cards || []).filter((c) => c.due <= today).sort((a, b) => a.box - b.box || b.ko - a.ko).map((c) => c.es).slice(0, 3);
  return { next, rest, pending: !rest && next <= 24, grammar, sessionTitle, weak, due };
}
function system(lucia, ctx, memory) {
  return [lucia.persona, "Sobre Claire: " + lucia.about_claire, "Reglas:\n- " + lucia.rules.join("\n- "),
    `Contexto de hoy: va por la sesión ${Math.min(ctx.next, 24)} de 24 (${ctx.sessionTitle || "inicio"}); gramática actual: ${ctx.grammar || "ser y presentarse"}. Palabras flojas: ${ctx.weak.join(", ") || "ninguna todavía"}.`,
    memory ? "Lo que Claire te ha contado antes (resumen): " + memory : "Todavía no sabes mucho de Claire más allá de lo de arriba.",
    "Temas posibles: " + lucia.topics.join("; ") + "."].join("\n\n");
}

// ---------- /chat (user token) ----------
export async function handleChat(env, token, userId, body) {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 400) return { status: 400, body: { error: "bad_request" } };
  const db = userDb(env, token), { day } = nlNow();
  const [lucia, recent, memRows, results, cards] = await Promise.all([
    loadJson(env, "lucia.json"),
    rest(env, db, `chat_messages?select=role,text&user_id=eq.${userId}&order=ts.desc&limit=12`),
    rest(env, db, `chat_memory?select=summary,claire_msgs&user_id=eq.${userId}`),
    rest(env, db, `session_results?select=n,done_on&user_id=eq.${userId}`),
    rest(env, db, `cards?select=es,box,ok,ko,due&user_id=eq.${userId}`),
  ]);
  const ctx = await context(env, results, cards, day);
  const memory = memRows?.[0];
  const history = (recent || []).reverse().map((m) => ({ role: m.role === "claire" ? "user" : "assistant", content: m.text }));
  while (history.length && history[0].role !== "user") history.shift(); // the API needs a user turn first
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const msg = await client.messages.parse({
    model: MODEL, max_tokens: 700, thinking: { type: "disabled" },
    system: system(lucia, ctx, memory?.summary) + "\n\nDevuelve: reply (tu mensaje), corrections (0 a 2), topic (tema en 2-4 palabras en español) y errors (0 a 3 etiquetas cortas en español del tipo de error, por ejemplo 'ser/estar', 'género', 'conjugación').",
    messages: [...history, { role: "user", content: text }],
    output_config: { format: zodOutputFormat(Reply) },
  });
  if (msg.stop_reason === "refusal" || !msg.parsed_output) return { status: 502, body: { error: "refusal" } };
  const out = msg.parsed_output;
  const saved = await rest(env, db, "chat_messages", { method: "POST", prefer: "return=representation", body: [
    { user_id: userId, role: "claire", kind: "chat", text, corrections: out.corrections, read_at: new Date().toISOString() },
    { user_id: userId, role: "lucia", kind: "chat", text: out.reply.slice(0, 2000), corrections: [], read_at: new Date().toISOString() },
  ] });
  // Daily summary for Augusto's panel: counts, topics and error tags only.
  const prev = (await rest(env, db, `chat_daily?select=messages,topics,errors&user_id=eq.${userId}&day=eq.${day}`))?.[0];
  const errs = Object.fromEntries((prev?.errors || []).map((e) => [e.tag, e.count]));
  for (const e of out.errors) errs[e] = (errs[e] || 0) + 1;
  const topics = [...new Set([...(prev?.topics || []), out.topic].filter(Boolean))].slice(-8);
  await rest(env, db, "chat_daily?on_conflict=user_id,day", { method: "POST", prefer: "resolution=merge-duplicates", body: { user_id: userId, day, messages: (prev?.messages || 0) + 2, topics, errors: Object.entries(errs).map(([tag, count]) => ({ tag, count })) } });
  // Memory: refreshed every 8 of Claire's messages.
  const count = (memory?.claire_msgs || 0) + 1;
  let summary = memory?.summary || "";
  if (count % 8 === 0) {
    const convo = [...history, { role: "user", content: text }, { role: "assistant", content: out.reply }].map((m) => (m.role === "user" ? "Claire: " : "Lucía: ") + m.content).join("\n");
    const sm = await client.messages.create({ model: MODEL, max_tokens: 400, thinking: { type: "disabled" }, system: "Resume en español, en máximo 6 frases cortas, los datos personales y temas que Claire contó (gustos, planes, su doctorado, su día), para que su tutora los retome otro día. Conserva lo importante del resumen anterior. Solo hechos que Claire dijo.", messages: [{ role: "user", content: `Resumen anterior: ${summary || "(vacío)"}\n\nConversación reciente:\n${convo}` }] });
    summary = sm.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim().slice(0, 1500) || summary;
  }
  await rest(env, db, "chat_memory?on_conflict=user_id", { method: "POST", prefer: "resolution=merge-duplicates", body: { user_id: userId, summary, claire_msgs: count, updated_at: new Date().toISOString() } });
  return { status: 200, body: { reply: out.reply, corrections: out.corrections, ids: (saved || []).map((m) => m.id) } };
}

// ---------- cron (service role) ----------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function plan(settings, ctx) {
  const start = settings.window_start * 60, end = settings.window_end * 60, slots = [];
  const randomTimes = (n, avoid) => {
    const out = [];
    for (let tries = 0; out.length < n && tries < 200; tries++) {
      const t = start + Math.floor(Math.random() * Math.max(1, end - start - 15));
      if ([...out, ...avoid].every((x) => Math.abs(x - t) >= 90)) out.push(t);
    }
    return out.sort((a, b) => a - b);
  };
  if (ctx.rest) { if (settings.per_day > 0) randomTimes(1, []).forEach((at) => slots.push({ at, kind: "review", sent: false })); }
  else {
    if (ctx.pending) slots.push({ at: 9 * 60, kind: "reminder_m", sent: false }, { at: 19 * 60, kind: "reminder_e", sent: false });
    randomTimes(settings.per_day, ctx.pending ? [540, 1140] : []).forEach((at) => slots.push({ at, kind: "proactive", sent: false }));
  }
  return slots.sort((a, b) => a.at - b.at);
}
async function compose(env, lucia, ctx, memory, recent, kind) {
  if (kind === "reminder_m") return pick(lucia.reminders.morning);
  if (kind === "reminder_e") return pick(lucia.reminders.evening);
  const style = kind === "review" ? `${lucia.review_style} Palabras para repasar: ${ctx.due.join("; ") || ctx.weak.join("; ") || "saludos básicos"}.` : lucia.proactive_style;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const last = (recent || []).slice(0, 6).reverse().map((m) => (m.role === "claire" ? "Claire: " : "Lucía: ") + m.text).join("\n");
  const msg = await client.messages.create({ model: MODEL, max_tokens: 250, thinking: { type: "disabled" }, system: system(lucia, ctx, memory), messages: [{ role: "user", content: `Escribe ahora un mensaje tuyo para Claire, por iniciativa propia. ${style}\n\nÚltimos mensajes del chat:\n${last || "(ninguno)"}` }] });
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim().slice(0, 600);
}
async function deliver(env, sdb, lucia, s, ctx, kind) {
  const [mem, recent] = await Promise.all([sdb.read(`chat_memory?select=summary&user_id=eq.${s.user_id}`), sdb.read(`chat_messages?select=role,text&user_id=eq.${s.user_id}&order=ts.desc&limit=6`)]);
  const text = await compose(env, lucia, ctx, mem?.[0]?.summary, recent, kind);
  if (!text) return;
  const dbKind = kind.startsWith("reminder") ? "reminder" : kind;
  await sdb.write("chat_messages", "", { method: "POST", body: { user_id: s.user_id, role: "lucia", kind: dbKind, text } });
  const { day } = nlNow();
  const prev = (await sdb.read(`chat_daily?select=messages,topics,errors&user_id=eq.${s.user_id}&day=eq.${day}`))?.[0];
  await sdb.write("chat_daily", "?on_conflict=user_id,day", { method: "POST", prefer: "resolution=merge-duplicates", body: { user_id: s.user_id, day, messages: (prev?.messages || 0) + 1, topics: prev?.topics || [], errors: prev?.errors || [] } });
  if (s.push_subscription?.endpoint) {
    const status = await sendPush(env, s.push_subscription, { title: "Lucía", body: text.slice(0, 160), url: "./?tab=lucia" }).catch(() => 0);
    if (status === 404 || status === 410) await sdb.write("lucia_settings", `?user_id=eq.${s.user_id}`, { method: "PATCH", body: { push_subscription: null } });
  }
}
export async function runCron(env) {
  const sdb = serviceDb(env), { day, minutes } = nlNow();
  const [lucia, settings, roles] = await Promise.all([loadJson(env, "lucia.json"), sdb.read("lucia_settings?select=*"), sdb.read("allowed_users?select=email,role")]);
  const roleOf = Object.fromEntries((roles || []).map((r) => [r.email, r.role]));
  for (const s of settings || []) {
    try {
      const [results, cards] = await Promise.all([sdb.read(`session_results?select=n,done_on&user_id=eq.${s.user_id}`), sdb.read(`cards?select=es,box,ok,ko,due&user_id=eq.${s.user_id}`)]);
      const ctx = await context(env, results, cards, day);
      if (s.test_requested) {
        await sdb.write("lucia_settings", `?user_id=eq.${s.user_id}`, { method: "PATCH", body: { test_requested: false } });
        await deliver(env, sdb, lucia, s, ctx, "test");
      }
      if (roleOf[await sdb.email(s.user_id)] !== "learner" || !s.enabled) continue; // scheduled messages only for Claire
      let row = (await sdb.read(`lucia_schedule?select=plan&user_id=eq.${s.user_id}&day=eq.${day}`))?.[0];
      if (!row) { row = { plan: plan(s, ctx) }; await sdb.write("lucia_schedule", "", { method: "POST", body: { user_id: s.user_id, day, plan: row.plan } }); }
      let changed = false;
      for (const slot of row.plan) {
        if (slot.sent || slot.at > minutes) continue;
        slot.sent = true; changed = true;
        if (minutes - slot.at > 120) continue; // too late (Worker was down): skip rather than spam
        if (slot.kind.startsWith("reminder") && !ctx.pending) continue; // session already done
        await deliver(env, sdb, lucia, s, ctx, slot.kind);
      }
      if (changed) await sdb.write("lucia_schedule", `?user_id=eq.${s.user_id}&day=eq.${day}`, { method: "PATCH", body: { plan: row.plan } });
    } catch (e) { console.error("cron user failed", s.user_id, e.message); }
  }
}
