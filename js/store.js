// Data layer. Two backends with the same interface:
// - Supabase (production): auth by magic link, tables protected by RLS, Realtime for the panel.
// - Mock (localhost only, ?mock=learner|owner): data in localStorage, used by the Playwright tests.
// Every row handed to the app is a fresh copy, so the app can mutate it without touching cached state.
import { CONFIG } from "./config.js";

const clone = (x) => (x == null ? x : structuredClone(x));

export async function createStore() {
  const params = new URLSearchParams(location.search);
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (local && params.get("mock")) return mockStore(params.get("mock"));
  return supabaseStore();
}

// ---------- Supabase ----------
async function supabaseStore() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    // Implicit flow: the link in the mail carries a token hash that works in any browser. That matters on iPhone,
    // where the installed app does not share storage with Safari, so Claire can paste the link into the app.
    auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" },
  });
  const must = ({ data, error }) => { if (error) throw error; return clone(data); };
  const s = {
    mode: "supabase",
    me: null, role: null, learnerId: null,
    async init() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return false;
      s.me = { id: data.session.user.id, email: data.session.user.email };
      const info = must(await sb.rpc("my_access"));
      if (!info || !info.role) { await sb.auth.signOut(); throw Object.assign(new Error("not allowed"), { code: "not_allowed" }); }
      s.role = info.role; s.learnerId = info.learner_id;
      return true;
    },
    async signIn(email) {
      const redirect = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } });
      if (error) throw error;
    },
    // Accepts the pasted mail link (token hash) or, with a custom mail template, the numeric code.
    async verify(email, input) {
      const text = input.trim();
      const code = text.replace(/\s/g, "");
      let res;
      if (/^\d{6,10}$/.test(code)) res = await sb.auth.verifyOtp({ email, token: code, type: "email" });
      else {
        const url = new URL(text);
        const tokenHash = url.searchParams.get("token") || url.searchParams.get("token_hash");
        if (!tokenHash) throw Object.assign(new Error("no token"), { code: "bad_link" });
        res = await sb.auth.verifyOtp({ token_hash: tokenHash, type: url.searchParams.get("type") || "magiclink" });
      }
      if (res.error) throw res.error;
    },
    async signOut() { await sb.auth.signOut(); },
    async load(uid) {
      const [days, cards, results, note] = await Promise.all([
        sb.from("progress_days").select("*").eq("user_id", uid),
        sb.from("cards").select("*").eq("user_id", uid),
        sb.from("session_results").select("*").eq("user_id", uid),
        sb.from("notes").select("text, updated_at").eq("id", 1).maybeSingle(),
      ]);
      return { days: must(days), cards: must(cards), results: must(results), note: must(note) };
    },
    async saveResult(row) { must(await sb.from("session_results").upsert({ ...row, user_id: s.me.id }, { onConflict: "user_id,n" })); },
    async saveDay(row) { must(await sb.from("progress_days").upsert({ ...row, user_id: s.me.id }, { onConflict: "user_id,day" })); },
    async saveCard(row) { must(await sb.from("cards").upsert({ ...row, user_id: s.me.id }, { onConflict: "user_id,item_id" })); },
    async saveStop(row) { must(await sb.from("stops").upsert({ ...row, user_id: s.me.id }, { onConflict: "user_id,lesson_id" })); },
    async addSession(kind, detail) { must(await sb.from("sessions").insert({ user_id: s.me.id, kind, detail })); },
    async addDialog(row) { must(await sb.from("dialogs").insert({ ...row, user_id: s.me.id })); },
    async setNote(text) { must(await sb.from("notes").upsert({ id: 1, text, updated_at: new Date().toISOString() })); },
    async panel(uid) {
      const [days, cards, sessions, dialogs, results] = await Promise.all([
        sb.from("progress_days").select("*").eq("user_id", uid),
        sb.from("cards").select("*").eq("user_id", uid),
        sb.from("sessions").select("*").eq("user_id", uid).order("ts", { ascending: false }).limit(20),
        sb.from("dialogs").select("*").eq("user_id", uid).order("ts", { ascending: false }).limit(8),
        sb.from("session_results").select("*").eq("user_id", uid),
      ]);
      return { days: must(days), cards: must(cards), sessions: must(sessions), dialogs: must(dialogs), results: must(results) };
    },
    subscribe(uid, onChange) {
      const ch = sb.channel("panel-" + uid);
      for (const table of ["progress_days", "cards", "sessions", "dialogs", "session_results", "chat_daily"]) {
        ch.on("postgres_changes", { event: "*", schema: "public", table, filter: "user_id=eq." + uid }, onChange);
      }
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
    // ---- Lucía (the chat is readable only by its owner; RLS) ----
    async chatList() { return must(await sb.from("chat_messages").select("*").eq("user_id", s.me.id).order("ts", { ascending: false }).limit(60)).reverse(); },
    async chatMarkRead() { must(await sb.from("chat_messages").update({ read_at: new Date().toISOString() }).eq("user_id", s.me.id).eq("role", "lucia").is("read_at", null)); },
    onChat(cb) {
      const ch = sb.channel("chat-" + s.me.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: "user_id=eq." + s.me.id }, (p) => cb(clone(p.new))).subscribe();
      return () => sb.removeChannel(ch);
    },
    async settings() { return must(await sb.from("lucia_settings").select("*").eq("user_id", s.me.id).maybeSingle()); },
    async saveSettings(patch) { must(await sb.from("lucia_settings").upsert({ user_id: s.me.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })); },
    async chatDaily(uid) { return must(await sb.from("chat_daily").select("*").eq("user_id", uid).order("day", { ascending: false }).limit(14)); },
    onNote(cb) {
      const ch = sb.channel("note").on("postgres_changes", { event: "*", schema: "public", table: "notes" }, (p) => cb(clone(p.new))).subscribe();
      return () => sb.removeChannel(ch);
    },
    async ai(path, body) {
      const { data } = await sb.auth.getSession();
      const res = await fetch(CONFIG.WORKER_URL + path, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + data.session.access_token },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(json.error || "ai_failed"), { code: json.error || res.status });
      return json;
    },
  };
  return s;
}

// ---------- Mock (localhost only) ----------
function mockStore(who) {
  const KEY = "mockdb-v1";
  const ids = { learner: "00000000-0000-0000-0000-00000000000c", owner: "00000000-0000-0000-0000-00000000000a" };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const db = () => { const d = read(); for (const t of ["progress_days", "cards", "session_results", "sessions", "dialogs", "chat_messages", "lucia_settings", "chat_daily"]) d[t] = d[t] || []; d.notes = d.notes || null; return d; };
  const write = (d) => { localStorage.setItem(KEY, JSON.stringify(d)); listeners.forEach((f) => f()); };
  const listeners = new Set();
  addEventListener("storage", (e) => { if (e.key === KEY) listeners.forEach((f) => f()); });
  const upsert = (table, row, keys) => {
    const d = db(); const i = d[table].findIndex((r) => keys.every((k) => r[k] === row[k]));
    if (i >= 0) d[table][i] = { ...d[table][i], ...row }; else d[table].push(row);
    write(d);
  };
  const role = who === "owner" ? "owner" : "learner";
  const s = {
    mode: "mock",
    me: { id: ids[role], email: role + "@mock.local" }, role, learnerId: ids.learner,
    async init() { return true; },
    async signIn() {}, async verify() {}, async signOut() {},
    async load(uid) {
      const d = db();
      return { days: clone(d.progress_days.filter((r) => r.user_id === uid)), cards: clone(d.cards.filter((r) => r.user_id === uid)), results: clone(d.session_results.filter((r) => r.user_id === uid)), note: clone(d.notes) };
    },
    async saveDay(row) { upsert("progress_days", { ...row, user_id: s.me.id }, ["user_id", "day"]); },
    async saveCard(row) { upsert("cards", { ...row, user_id: s.me.id }, ["user_id", "item_id"]); },
    async saveResult(row) { upsert("session_results", { ...row, user_id: s.me.id }, ["user_id", "n"]); },
    async addSession(kind, detail) { const d = db(); d.sessions.push({ id: Date.now(), user_id: s.me.id, ts: new Date().toISOString(), kind, detail }); write(d); },
    async addDialog(row) { const d = db(); d.dialogs.push({ id: Date.now(), user_id: s.me.id, ts: new Date().toISOString(), ...row }); write(d); },
    async setNote(text) { const d = db(); d.notes = { text, updated_at: new Date().toISOString() }; write(d); },
    async panel(uid) {
      const d = db(); const desc = (a, b) => (a.ts < b.ts ? 1 : -1);
      return {
        days: clone(d.progress_days.filter((r) => r.user_id === uid)), cards: clone(d.cards.filter((r) => r.user_id === uid)),
        sessions: clone(d.sessions.filter((r) => r.user_id === uid).sort(desc).slice(0, 20)), dialogs: clone(d.dialogs.filter((r) => r.user_id === uid).sort(desc).slice(0, 8)),
        results: clone(d.session_results.filter((r) => r.user_id === uid)),
      };
    },
    subscribe(uid, onChange) { listeners.add(onChange); return () => listeners.delete(onChange); },
    onNote(cb) { const f = () => cb(clone(db().notes)); listeners.add(f); return () => listeners.delete(f); },
    async chatList() { return clone(db().chat_messages.filter((m) => m.user_id === s.me.id).sort((a, b) => (a.ts < b.ts ? -1 : 1))); },
    async chatMarkRead() { const d = db(); d.chat_messages.forEach((m) => { if (m.user_id === s.me.id && m.role === "lucia" && !m.read_at) m.read_at = new Date().toISOString(); }); write(d); },
    onChat(cb) { let seen = new Set(db().chat_messages.map((m) => m.id)); const f = () => { for (const m of db().chat_messages) if (!seen.has(m.id) && m.user_id === s.me.id) { seen.add(m.id); cb(clone(m)); } }; listeners.add(f); return () => listeners.delete(f); },
    async settings() { return clone(db().lucia_settings.find((r) => r.user_id === s.me.id) || null); },
    async saveSettings(patch) { upsert("lucia_settings", { enabled: true, window_start: 9, window_end: 21, per_day: 2, ...(db().lucia_settings.find((r) => r.user_id === s.me.id) || {}), ...patch, user_id: s.me.id }, ["user_id"]); },
    async chatDaily(uid) { return clone(db().chat_daily.filter((r) => r.user_id === uid).sort((a, b) => (a.day < b.day ? 1 : -1))); },
    async ai(path, body) {
      await new Promise((r) => setTimeout(r, 150));
      if (path === "/dialog") return { text: "¡Qué bien! ¿Y de dónde eres?" };
      if (path === "/chat") {
        // Same writes the Worker does: both messages and the daily summary (counts, topics, error tags).
        const d = db(), now = Date.now(), day = new Date().toISOString().slice(0, 10);
        const corrections = /yo soy/i.test(body.text) ? [{ said: body.text, better: body.text.replace(/yo soy/i, "Soy"), why: "'Yo' mag weg: aan 'soy' hoor je al dat jij het bent." }] : [];
        d.chat_messages.push({ id: now, user_id: s.me.id, ts: new Date(now).toISOString(), role: "claire", kind: "chat", text: body.text, corrections, read_at: new Date().toISOString() });
        d.chat_messages.push({ id: now + 1, user_id: s.me.id, ts: new Date(now + 1).toISOString(), role: "lucia", kind: "chat", text: "¡Qué bacán! ¿Y qué estás investigando en tu doctorado?", corrections: [], read_at: new Date().toISOString() });
        const row = d.chat_daily.find((r) => r.user_id === s.me.id && r.day === day) || (d.chat_daily.push({ user_id: s.me.id, day, messages: 0, topics: [], errors: [] }), d.chat_daily[d.chat_daily.length - 1]);
        row.messages += 2; row.topics = [...new Set([...row.topics, "su doctorado"])];
        if (corrections.length) { const e = row.errors.find((x) => x.tag === "pronombre sobrante"); if (e) e.count++; else row.errors.push({ tag: "pronombre sobrante", count: 1 }); }
        write(d);
        return { reply: "¡Qué bacán! ¿Y qué estás investigando en tu doctorado?", corrections };
      }
      if (path === "/extra") return { exercises: body.words.slice(0, 4).map((w, i) => i % 2 ? { type: "type", q: "Schrijf het in het Spaans", prompt: w.nl, answer: w.es, word: w.es } : { type: "mc", q: "Wat betekent dit?", prompt: w.es, opts: [w.nl, "Goedemorgen", "Ik ben moe", "Tot ziens"].filter((x, j, a) => a.indexOf(x) === j).slice(0, 4), answer: w.nl, word: w.es }) };
      const goal = body.session ? { goal_met: true, goal_note: "Je hebt alles gevraagd wat nodig was." } : {};
      return { ...goal, score: 4, praise: "Goed gedaan, je schreef hele zinnen.", errors: [{ said: body.turns.find((t) => t.role === "user")?.content || "", better: "Hola, me llamo Claire.", why: "Gebruik 'me llamo' om je naam te zeggen." }] };
    },
  };
  return s;
}
