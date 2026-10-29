// Shared helpers, state, content and the session calendar.
// Rule from a past bug: never mutate rows that came from the store; copy, change, then save the copy.
import { CONFIG } from "./config.js";
import { t, stampLabel } from "./i18n.js";

// ---------- helpers ----------
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
export const dstr = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const todayStr = () => dstr(new Date());
export const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
export const between = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:"'…()]/g, "").replace(/\s+/g, " ").trim();
export const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export function lev(a, b) { const m = a.length, n = b.length, d = []; for (let i = 0; i <= m; i++) d[i] = [i]; for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
// Tolerant match for typed answers: accents and punctuation ignored, small typos allowed.
export const closeEnough = (given, answers) => answers.some((a) => { const g = norm(given), t = norm(a); return lev(g, t) <= Math.max(1, Math.floor(t.length * 0.15)); });
export const similarity = (a, b) => { const x = norm(a), y = norm(b); return 1 - lev(x, y) / Math.max(1, x.length, y.length); };
const DAYS_NL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
export const MONTHS = ["JAN", "FEB", "MRT", "APR", "MEI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"];
export const dayLabelNl = (s) => { const d = parse(s); return DAYS_NL[d.getDay()] + " " + d.getDate() + " " + MONTHS_NL[d.getMonth()]; };
export const stampDate = (s) => stampLabel(s);
export const fmtEs = (ts) => new Date(ts).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const dateEs = (s) => parse(s).toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
export const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
export const BOX_DAYS = [0, 1, 3, 7, 14];

// ---------- speech: always Spanish, always a female voice; no Spanish voice means no listening exercises ----------
// Female Spanish voices by name (iOS/macOS, Android/Chrome, Windows/Edge), Latin American first. If none of them
// is installed, any Spanish voice that is not a known male one; only as a last resort a male voice.
const FEMALE = ["paulina", "angelica", "soledad", "francisca", "esperanza", "ximena", "google espanol de estados unidos", "dalia", "sabina",
  "monica", "marisol", "google espanol", "helena", "laura", "elvira", "lucia", "paloma", "flo", "sandy", "shelley", "grandma"];
const MALE = ["jorge", "juan", "diego", "carlos", "pablo", "raul", "alvaro", "eddy", "reed", "rocko", "grandpa", "enrique", "miguel", "jordi", "andres", "gerardo"];
const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const named = (v, n) => new RegExp("(^|[^a-z])" + n + "([^a-z]|$)").test(plain(v.name));
let esVoice = null, wanted = null; // wanted: the voice name saved in the user's settings (per device it may be missing)
export const esVoices = () => ("speechSynthesis" in window ? speechSynthesis.getVoices().filter((v) => /^es([-_]|$)/i.test(v.lang)) : []);
export const isFemale = (v) => FEMALE.some((n) => named(v, n));
export function autoVoice(vs = esVoices()) {
  for (const n of FEMALE) { const v = vs.find((x) => named(x, n)); if (v) return v; }
  return vs.find((v) => !MALE.some((n) => named(v, n))) || vs[0] || null;
}
export const pickVoice = () => {
  if (!("speechSynthesis" in window)) return;
  const vs = esVoices();
  esVoice = (wanted && vs.find((v) => v.name === wanted)) || autoVoice(vs);
};
export const setVoice = (name) => { wanted = name || null; pickVoice(); };
export const voiceName = () => esVoice?.name || "";
export function voicesReady() {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  pickVoice();
  if (esVoice) return Promise.resolve();
  return new Promise((r) => {
    const t = setTimeout(r, 1200);
    speechSynthesis.addEventListener("voiceschanged", () => { pickVoice(); if (esVoice) { clearTimeout(t); r(); } });
  });
}
if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", () => pickVoice());
export const hasEs = () => !!esVoice;
export function speak(text) {
  if (!esVoice) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.voice = esVoice; u.lang = esVoice.lang; u.rate = 0.85; speechSynthesis.speak(u); } catch {}
}
// Speaking practice: speech recognition when the browser has it, otherwise record and compare by ear.
export const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// ---------- state ----------
export const S = {
  store: null, weeks: [], sessions: {}, items: {}, scen: {}, grammar: {},
  uid: null, readonly: false, days: {}, cards: {}, results: {}, note: null,
  tab: "home", run: null, chat: null, panelUnsub: null,
};
export const isOwner = () => S.store?.role === "owner";

// ---------- content ----------
export async function loadContent() {
  const res = await Promise.all(Array.from({ length: CONFIG.WEEKS }, (_, i) =>
    fetch(`content/semana-${i + 1}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  S.weeks = res.filter(Boolean).sort((a, b) => a.week - b.week);
  for (const w of S.weeks) {
    for (const [k, sc] of Object.entries(w.scenarios || {})) S.scen[k] = { ...sc, key: k, week: w.week };
    for (const s of w.sessions || []) {
      S.sessions[s.n] = { ...s, week: w.week };
      for (const it of s.items || []) S.items[it.id] = { ...it, week: w.week, session: s.n };
      if (s.grammar) S.grammar[s.grammar.id] = { ...s.grammar, week: w.week, session: s.n };
    }
  }
}
export const TOTAL = () => Object.keys(S.sessions).length || 24;
export const sessionReady = (n) => !!S.sessions[n]?.items?.length;
export const weekOf = (n) => S.sessions[n]?.week || 1;
export const weekSessions = (w) => Object.values(S.sessions).filter((s) => s.week === w).sort((a, b) => a.n - b.n);
export const lastOfWeek = (n) => { const ws = weekSessions(weekOf(n)); return ws[ws.length - 1]?.n === n; };
export const itemsUpTo = (n) => Object.values(S.items).filter((it) => it.session <= n);

// ---------- calendar: one session every 2 days; a missed day shifts everything ----------
// done_on of the last session + 2 is the next planned day. Doing it later is allowed (not on time) and
// the plan moves with it. Never two new sessions on the same day.
export function schedule(results = S.results) {
  const t = todayStr();
  const done = Object.values(results).sort((a, b) => a.n - b.n);
  const last = done[done.length - 1] || null;
  const next = last ? last.n + 1 : 1;
  const planned = last ? addDays(last.done_on, 2) : t;
  let state;
  if (next > TOTAL()) state = "finished";
  else if (last && last.done_on >= t) state = "rest";
  else if (t < planned) state = "rest";
  else state = "due";
  return { next, planned, state, late: state === "due" && t > planned, last, doneCount: done.length };
}
// Streak = sessions done on time in a row, counted back from the latest. Rest days never break it.
export function streak(results = S.results) {
  const done = Object.values(results).sort((a, b) => b.n - a.n);
  let s = 0;
  for (const r of done) { if (r.on_time) s++; else break; }
  return s;
}
// Weekly test: at the end of the last session of a week; failed tests are retried in the next session.
export function testsFor(n, results = S.results) {
  const passed = (w) => Object.values(results).some((r) => (r.detail?.tests || []).some((x) => x.week === w && x.passed));
  const out = [];
  for (const w of S.weeks) {
    const ws = weekSessions(w.week);
    const lastN = ws[ws.length - 1]?.n;
    if (!lastN || passed(w.week)) continue;
    if (lastN < n && results[lastN]) out.push(w.week);
    if (lastN === n) out.push(w.week);
  }
  return out;
}
export const weekPassed = (w, results = S.results) => {
  const r = Object.values(results).find((x) => (x.detail?.tests || []).some((t) => t.week === w && t.passed));
  return r ? r.done_on : null;
};

// ---------- progress ----------
export const blankDay = (day) => ({ day, lessons: 0, dialog: false, phrase: false, minutes: 0, xp: 0 });
export const totalXp = (days) => Object.values(days).reduce((a, d) => a + (d.xp || 0), 0);
export const totalMin = (days) => Object.values(days).reduce((a, d) => a + Number(d.minutes || 0), 0);
export const byKey = (rows, key) => Object.fromEntries((rows || []).map((r) => [r[key], r]));

export async function loadUser(uid) {
  const data = await S.store.load(uid);
  S.uid = uid;
  S.days = byKey(data.days, "day");
  S.cards = byKey(data.cards, "item_id");
  S.results = byKey(data.results, "n");
  S.note = data.note;
}

export function status(msg) { const el = $("toast"); el.textContent = msg; el.hidden = !msg; clearTimeout(status.t); if (msg) status.t = setTimeout(() => (el.hidden = true), 5000); }
// Every write is tracked so the end of a session can wait for all of them before letting her leave.
const pending = new Set();
export async function save(fn) {
  if (S.readonly) return true;
  const p = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await fn(); return true; } catch (e) { console.warn("save failed, retrying", e); await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); }
    }
    status(t("save.fail"));
    return false;
  })();
  pending.add(p); p.finally(() => pending.delete(p));
  return p;
}
export const allSaved = async () => { while (pending.size) await Promise.all([...pending]); };
export async function updateToday(change) {
  const t = todayStr();
  const next = { ...(S.days[t] || blankDay(t)) };
  change(next);
  next.minutes = Math.round(next.minutes * 10) / 10;
  delete next.user_id; delete next.updated_at;
  S.days = { ...S.days, [t]: next };
  await save(() => S.store.saveDay(next));
}
// Spaced repetition, box 0-4. A miss in the closing quiz comes back tomorrow.
export function updateCard(item, ok, { tomorrow = false } = {}) {
  const card = { item_id: item.id, es: item.es, box: 0, ok: 0, ko: 0, ...(S.cards[item.id] || {}) };
  delete card.user_id;
  if (ok) { card.box = Math.min(4, card.box + 1); card.ok++; } else { card.box = 0; card.ko++; }
  card.due = addDays(todayStr(), ok ? BOX_DAYS[card.box] : tomorrow ? 1 : 0);
  card.last = new Date().toISOString();
  S.cards = { ...S.cards, [card.item_id]: card };
  save(() => S.store.saveCard(card));
}
