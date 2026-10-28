// App shell: login, Paspoort (home), week route, lesson engine, Gesprek (dialog), Woorden, and Augusto's panel.
// Rule from a past bug: never mutate rows that came from the store; copy, change, then save the copy.
import { CONFIG } from "./config.js";
import { createStore } from "./store.js";
import { icon, starIcon } from "./icons.js";

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const dstr = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const todayStr = () => dstr(new Date());
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return dstr(d); };
const between = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:"']/g, "").replace(/\s+/g, " ").trim();
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function lev(a, b) { const m = a.length, n = b.length, d = []; for (let i = 0; i <= m; i++) d[i] = [i]; for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const MONTHS = ["JAN", "FEB", "MRT", "APR", "MEI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"];
const stampDate = (iso) => { const d = new Date(iso); return pad(d.getDate()) + "·" + MONTHS[d.getMonth()]; };
const fmtEs = (ts) => new Date(ts).toLocaleString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const LESSON_LEN = 12, BOX_DAYS = [0, 1, 3, 7, 14], MAX_MSG = 300;

// ---------- speech: always Spanish; no Spanish voice means no listening exercises ----------
let esVoice = null;
const pickVoice = () => {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  esVoice = vs.find((v) => /^es[-_](PE|419|MX|US|CO)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
};
function voicesReady() {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  pickVoice();
  if (esVoice) return Promise.resolve();
  return new Promise((r) => {
    const t = setTimeout(r, 1200);
    speechSynthesis.addEventListener("voiceschanged", () => { pickVoice(); if (esVoice) { clearTimeout(t); r(); } });
  });
}
const hasEs = () => !!esVoice;
function speak(text) {
  if (!esVoice) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.voice = esVoice; u.lang = esVoice.lang; u.rate = 0.85; speechSynthesis.speak(u); } catch {}
}
const sayBtn = (text, label = "Luisteren") => (hasEs() ? `<button class="speak" data-say="${esc(text)}">${icon("speaker", 20)}${label}</button>` : "");

// ---------- state ----------
const S = {
  store: null, weeks: [], items: {}, scen: {},
  uid: null, readonly: false, days: {}, cards: {}, stops: {}, note: null,
  tab: "home", L: null, chat: null, panelUnsub: null,
};
const isOwner = () => S.store?.role === "owner";
const viewName = () => (S.readonly || !isOwner() ? CONFIG.NAMES.learner : CONFIG.NAMES.owner);

// ---------- content ----------
async function loadContent() {
  const res = await Promise.all(Array.from({ length: CONFIG.WEEKS }, (_, i) =>
    fetch(`content/semana-${i + 1}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  S.weeks = res.filter(Boolean).sort((a, b) => a.week - b.week);
  for (const w of S.weeks) {
    for (const it of w.items || []) S.items[it.id] = { ...it, week: w.week };
    for (const [k, sc] of Object.entries(w.scenarios || {})) S.scen[k] = { ...sc, key: k, week: w.week };
  }
}
const ready = (w) => (w.lessons || []).length > 0;
const weekItems = (w) => (w.items || []).map((it) => S.items[it.id]);
function activeWeek() {
  const t = todayStr();
  const open = S.weeks.filter((w) => ready(w) && w.start <= t);
  return open[open.length - 1] || S.weeks.find(ready) || null;
}
const knownItems = () => S.weeks.filter((w) => ready(w) && w.start <= todayStr()).flatMap(weekItems);
const stopDone = (id) => !!S.stops[id];
const weekDone = (w) => ready(w) && w.lessons.every((l) => stopDone(l.id));
const nextStop = (w) => w && w.lessons.find((l) => !stopDone(l.id));

// ---------- progress ----------
const blankDay = (day) => ({ day, lessons: 0, dialog: false, phrase: false, minutes: 0, xp: 0 });
const totalXp = (days) => Object.values(days).reduce((a, d) => a + (d.xp || 0), 0);
const totalMin = (days) => Object.values(days).reduce((a, d) => a + Number(d.minutes || 0), 0);
function streak(days) {
  let s = 0; const t = todayStr();
  for (let i = 0; i < 120; i++) {
    const d = days[addDays(t, -i)];
    if (d && (d.lessons > 0 || d.dialog)) s++; else if (i > 0) break;
  }
  return s;
}
const byKey = (rows, key) => Object.fromEntries((rows || []).map((r) => [r[key], r]));

async function loadUser(uid) {
  const data = await S.store.load(uid);
  S.uid = uid;
  S.days = byKey(data.days, "day");
  S.cards = byKey(data.cards, "item_id");
  S.stops = byKey(data.stops, "lesson_id");
  S.note = data.note;
}

function status(msg) { const el = $("toast"); el.textContent = msg; el.hidden = !msg; clearTimeout(status.t); if (msg) status.t = setTimeout(() => (el.hidden = true), 5000); }
async function save(fn) {
  if (S.readonly) return;
  try { await fn(); } catch (e) { console.error(e); status("Je voortgang kon niet worden opgeslagen. Probeer het zo nog eens."); }
}
async function updateToday(change) {
  const t = todayStr();
  const next = { ...(S.days[t] || blankDay(t)) };
  change(next);
  next.minutes = Math.round(next.minutes * 10) / 10;
  S.days = { ...S.days, [t]: next };
  await save(() => S.store.saveDay(next));
}

// ---------- navigation ----------
function tabs() {
  const list = [["home", "passport", "Paspoort"], ["chat", "chat", "Gesprek"], ["words", "words", "Woorden"]];
  if (isOwner() && !S.readonly) list.push(["panel", "panel", "Panel"]);
  $("nav").innerHTML = list.map(([k, ic, label]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${icon(ic)}${label}</button>`).join("");
}
function show(tab) {
  S.tab = tab;
  for (const k of ["home", "chat", "words", "panel"]) $("tab-" + k).hidden = k !== tab;
  tabs();
  if (tab === "home") renderHome();
  if (tab === "chat") renderChatTab();
  if (tab === "words") renderWords();
  if (tab === "panel") renderPanel();
  scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]"); if (t && t.closest("#nav")) show(t.dataset.tab);
  const s = e.target.closest("[data-say]"); if (s) speak(s.dataset.say);
});

// ---------- home (Paspoort) ----------
function renderHome() {
  const t = todayStr(), w = activeWeek(), today = S.days[t] || blankDay(t);
  const left = Math.max(0, between(t, CONFIG.TRIP));
  const xp = totalXp(S.days), st = streak(S.days);
  const dayN = w ? Math.min(between(w.start, t), (w.missions || []).length - 1) : 0;
  const m = w?.missions?.[Math.max(0, dayN)] || {};
  const sc = S.scen[m.dialog];
  const ns = nextStop(w);
  const lessonTitle = ns ? ns.title : "Herhaling";
  const tasks = [
    { key: "lesson", label: today.lessons >= 1 ? "Les van vandaag" : "Les: " + lessonTitle, done: today.lessons >= 1 },
    sc ? { key: "dialog", label: "Gesprek met " + sc.who, done: !!today.dialog } : null,
    m.phrase ? { key: "phrase", label: `Stuur Augusto: "${m.phrase}"`, done: !!today.phrase } : null,
  ].filter(Boolean);
  const first = tasks.find((x) => !x.done);
  const doneWeeks = S.weeks.filter(weekDone).length;
  const note = S.note?.text;

  $("tab-home").innerHTML = `
    <header class="pass">
      <div class="pass-row"><span class="mono gold">PASAPORTE · ESPAÑOL</span><span class="mono gold">NL → PE</span></div>
      <div class="pass-row end">
        <div><h1 class="display" id="homeName">${esc(viewName())}</h1><div class="sub" id="homeStats">${st} ${st === 1 ? "dag" : "dagen"} op rij · ${xp} XP</div></div>
        <div class="count"><b class="display" id="daysLeft">${left}</b><span>dagen tot vertrek</span></div>
      </div>
    </header>
    <div class="page">
      ${S.readonly ? `<div class="banner">${icon("eye", 18)}<span>Vista de Claire, solo lectura. Lo que hagas aquí no se guarda.</span><button class="link" id="backToMe">Volver</button></div>` : ""}
      ${note ? `<div class="note" id="augNote"><small class="mono">BERICHTJE VAN AUGUSTO</small>${esc(note)}</div>` : ""}
      <section class="ticket" aria-label="Missie van vandaag">
        <div class="ticket-main">
          <div class="mono ticket-meta"><span>INSTAPKAART · DAG ${Math.max(0, dayN) + 1}</span><span>GATE W${w ? w.week : 1}</span></div>
          <div class="route"><span class="display">AMS</span><svg width="60" height="14" viewBox="0 0 60 14" aria-hidden="true"><path d="M2 7h50" stroke="var(--sand)" stroke-width="2" stroke-dasharray="3 4"/><path d="M50 2l8 5-8 5z" fill="var(--wine)"/></svg><span class="display">LIM</span></div>
          <ul class="tasks" id="tasks">
            ${tasks.map((x) => `<li><button class="task ${x.done ? "done" : ""} ${x === first ? "next" : ""}" data-task="${x.key}" ${x.done ? 'aria-disabled="true"' : ""}>
              <span class="dot">${x.done ? icon("check", 12) : ""}</span><span class="tl">${esc(x.label)}</span>${x.done ? '<span class="klaar">Klaar</span>' : ""}</button></li>`).join("")}
          </ul>
        </div>
        <div class="perf" aria-hidden="true"></div>
        <button class="board" id="board" ${first ? "" : "disabled"}><span>${first ? "INSTAPPEN" : "KLAAR"}</span></button>
      </section>
      <div class="sec-head"><h2 class="display">Stempels</h2><span class="muted small">${doneWeeks} van ${CONFIG.WEEKS} weken</span></div>
      <div class="stamps" id="stamps">
        ${Array.from({ length: CONFIG.WEEKS }, (_, i) => {
          const wk = S.weeks.find((x) => x.week === i + 1) || { week: i + 1, stamp: "" };
          if (weekDone(wk)) {
            const last = wk.lessons.map((l) => S.stops[l.id].done_at).sort().pop();
            return `<button class="stamp done" data-week="${wk.week}" aria-label="Week ${wk.week} klaar"><span class="mono">SEMANA ${wk.week}</span><b class="display">${esc(wk.stamp)}</b><span class="mono">${stampDate(last)}</span></button>`;
          }
          const open = ready(wk) && wk.start <= todayStr();
          return `<button class="stamp ${open ? "open" : ""}" data-week="${wk.week}" ${open ? "" : 'aria-disabled="true"'}><span class="mono">SEMANA ${wk.week}</span>${esc(wk.stamp)}${open ? "" : `<small>${esc(startLabel(wk.start))}</small>`}</button>`;
        }).join("")}
      </div>
    </div>`;
  $("backToMe")?.addEventListener("click", backToOwner);
  $("tasks").querySelectorAll("[data-task]").forEach((b) => (b.onclick = () => runTask(b.dataset.task, m)));
  $("board").onclick = () => first && runTask(first.key, m);
  $("stamps").querySelectorAll("[data-week]").forEach((b) => (b.onclick = () => {
    const wk = S.weeks.find((x) => x.week === +b.dataset.week);
    if (wk && ready(wk) && wk.start <= todayStr()) openWeek(wk);
    else status("Deze week komt nog. Hij gaat open op " + startLabel(wk?.start || "") + ".");
  }));
}
const startLabel = (s) => { if (!s) return ""; const d = parse(s); return d.getDate() + " " + MONTHS[d.getMonth()].toLowerCase(); };

function runTask(key, m) {
  const t = todayStr(), today = S.days[t] || blankDay(t);
  if (key === "lesson") { if (today.lessons >= 1) return; const w = activeWeek(); const ns = nextStop(w); startLesson(ns ? { mode: "stop", week: w, stop: ns } : { mode: "review", week: w }); }
  if (key === "dialog") { if (today.dialog) return; show("chat"); startDialog(m.dialog); }
  if (key === "phrase") {
    if (today.phrase) return;
    window.open("https://wa.me/?text=" + encodeURIComponent(m.phrase), "_blank", "noopener");
    updateToday((d) => { d.phrase = true; }).then(() => { save(() => S.store.addSession("phrase", { text: m.phrase })); renderHome(); });
  }
}

// ---------- week route ----------
function openWeek(w) {
  const firstOpen = nextStop(w);
  $("week").hidden = false;
  $("week").innerHTML = `
    <div class="sheet-head"><button class="icon-btn" id="weekBack" aria-label="Terug">${icon("back")}</button><div><span class="mono muted">SEMANA ${w.week}</span><h2 class="display">${esc(w.title)}</h2></div></div>
    <ol class="stops">
      ${w.lessons.map((l, i) => {
        const done = stopDone(l.id), isNext = l === firstOpen, locked = !done && !isNext;
        const stars = done ? S.stops[l.id].stars || 0 : 0;
        return `<li class="stop ${done ? "done" : ""} ${isNext ? "next" : ""} ${locked ? "locked" : ""}">
          <span class="node">${done ? icon("check", 16) : locked ? icon("lock", 14) : i + 1}</span>
          <button class="stop-card" data-stop="${l.id}" ${locked ? 'aria-disabled="true"' : ""}>
            <span class="mono muted">HALTE ${i + 1}</span><b>${esc(l.title)}</b>
            ${done ? `<span class="mini-stars" aria-label="${stars} van 3 sterren">${[0, 1, 2].map((k) => starIcon(k < stars, 16)).join("")}</span>` : isNext ? '<span class="go">Start</span>' : ""}
          </button></li>`;
      }).join("")}
    </ol>`;
  $("weekBack").onclick = closeWeek;
  $("week").querySelectorAll("[data-stop]").forEach((b) => (b.onclick = () => {
    const l = w.lessons.find((x) => x.id === b.dataset.stop);
    if (!stopDone(l.id) && l !== firstOpen) { status("Maak eerst de vorige halte af."); return; }
    startLesson({ mode: "stop", week: w, stop: l });
  }));
}
function closeWeek() { $("week").hidden = true; $("week").innerHTML = ""; }

// ---------- lesson engine ----------
function weight(it) {
  const c = S.cards[it.id], t = todayStr();
  if (!c) return 3;
  return (c.due <= t ? 2 : 0.5) + (c.ko > c.ok ? 2 : 0);
}
function weightedPick(pool, n) {
  const bag = pool.map((it) => ({ it, w: weight(it) })), out = [];
  while (out.length < n && bag.length) {
    const tot = bag.reduce((a, x) => a + x.w, 0); let r = Math.random() * tot, i = 0;
    for (; i < bag.length; i++) { r -= bag[i].w; if (r <= 0) break; }
    i = Math.min(i, bag.length - 1); out.push(bag[i].it); bag.splice(i, 1);
  }
  return out;
}
function lessonItems(opts) {
  const all = knownItems();
  if (opts.mode === "weak") { const w = all.filter((it) => S.cards[it.id]?.ko > 0); return weightedPick(w.length >= 4 ? w : all, LESSON_LEN); }
  if (opts.mode !== "stop" || !opts.stop.items.length) return weightedPick(all, LESSON_LEN);
  // A stop drills its own phrases (each twice, different exercise types) and fills up with review of earlier phrases.
  const own = opts.stop.items.map((id) => S.items[id]);
  const seen = new Set(own.map((x) => x.id));
  const earlier = all.filter((it) => !seen.has(it.id) && Object.values(S.stops).length && S.cards[it.id]);
  let list = [...own, ...own];
  list = list.concat(weightedPick(earlier, Math.max(0, LESSON_LEN - list.length)));
  while (list.length < LESSON_LEN) list.push(own[list.length % own.length]);
  return spread(list.slice(0, LESSON_LEN));
}
function spread(list) { // avoid the same phrase twice in a row
  for (let tries = 0; tries < 30; tries++) {
    const s = shuffle(list);
    if (s.every((x, i) => i === 0 || x.id !== s[i - 1].id)) return s;
  }
  return shuffle(list);
}
const TYPES = ["mc_es", "mc_nl", "order", "listen", "blank"];
function buildEx(it, idx, usedKinds) {
  const words = it.es.split(" ");
  let k = TYPES[idx % TYPES.length];
  const prev = usedKinds[it.id] || [];
  if (prev.includes(k)) k = TYPES.find((x) => !prev.includes(x)) || k;
  if (k === "listen" && !hasEs()) k = "type";
  if (k === "blank" && words.length < 3) k = "mc_es";
  if (k === "order" && words.length < 3) k = "mc_nl";
  usedKinds[it.id] = [...prev, k];
  const pool = knownItems().length >= 4 ? knownItems() : Object.values(S.items);
  const others = shuffle(pool.filter((x) => x.id !== it.id)).slice(0, 3);
  if (k === "mc_es") return { k, it, q: "Wat betekent dit?", prompt: it.es, say: true, opts: shuffle([it.nl, ...others.map((o) => o.nl)]), answer: it.nl };
  if (k === "mc_nl") return { k, it, q: "Hoe zeg je dit in het Spaans?", prompt: it.nl, opts: shuffle([it.es, ...others.map((o) => o.es)]), answer: it.es };
  if (k === "order") { const extra = shuffle(others.flatMap((o) => o.es.split(" "))).filter((w) => !words.includes(w)).slice(0, 2); return { k, it, q: "Zet de woorden in de goede volgorde", prompt: it.nl, tokens: shuffle([...words, ...extra]), answer: it.es }; }
  if (k === "listen") return { k, it, q: "Luister en schrijf wat je hoort", answer: it.es };
  if (k === "type") return { k, it, q: "Schrijf het in het Spaans", prompt: it.nl, answer: it.es };
  const bi = 1 + Math.floor(Math.random() * (words.length - 1)), target = words[bi];
  const dis = shuffle([...new Set(pool.flatMap((x) => x.es.split(" ")))].filter((w) => norm(w) !== norm(target) && w.length > 2)).slice(0, 3);
  return { k, it, q: "Maak de zin af", blank: words.map((w, i) => (i === bi ? '<span class="blank"></span>' : esc(w))).join(" "), hint: it.nl, opts: shuffle([target, ...dis]), answer: target };
}
async function startLesson(opts) {
  await voicesReady();
  const items = lessonItems(opts), used = {};
  S.L = { ...opts, ex: items.map((it, i) => buildEx(it, i, used)), i: 0, ok: 0, combo: 0, best: 0, xp: 0, started: Date.now(), sel: null, built: [], answered: false, missed: [], quit: false, finished: false };
  $("lesson").hidden = false;
  document.body.classList.add("lock");
  $("lessonTitle").textContent = opts.stop ? opts.stop.title : opts.mode === "weak" ? "Zwakke woorden" : "Herhaling";
  renderEx();
}
function closeLesson() {
  $("lesson").hidden = true; document.body.classList.remove("lock");
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const L = S.L; S.L = null;
  if (S.tab === "home") renderHome();
  if (S.tab === "words") renderWords();
  if (!$("week").hidden && L?.week) openWeek(L.week);
  if (L?.stampWeek) showStamp(L.stampWeek);
}
$("quitBtn").onclick = () => {
  const L = S.L;
  if (L && !L.finished && L.i > 0 && !L.quit) {
    L.quit = true;
    $("lfoot").className = "lfoot bad"; $("verdict").hidden = false;
    $("verdict").innerHTML = "Stoppen? De les telt alleen als je hem afmaakt.<small>Tik nog eens op het kruisje om toch te stoppen.</small>";
    return;
  }
  closeLesson();
};
function renderEx() {
  const L = S.L, e = L.ex[L.i];
  $("lbar").style.width = (L.i / L.ex.length) * 100 + "%";
  $("combo").innerHTML = L.combo > 1 ? icon("flame", 16) + L.combo : "";
  $("lfoot").className = "lfoot"; $("verdict").hidden = true;
  const btn = $("checkBtn"); btn.textContent = "Controleren"; btn.disabled = true;
  Object.assign(L, { sel: null, built: [], answered: false, quit: false });
  let h = `<div class="kind mono">${esc(e.q)}</div>`;
  const opts = () => `<div class="opts">${e.opts.map((o, i) => `<button class="opt" data-o="${i}">${esc(o)}</button>`).join("")}</div>`;
  const input = '<input class="ans" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="es" placeholder="Schrijf in het Spaans">';
  if (e.k === "mc_es") h += `<div class="prompt display" lang="es">${esc(e.prompt)}</div>${sayBtn(e.it.es)}${opts()}`;
  if (e.k === "mc_nl") h += `<div class="prompt display">${esc(e.prompt)}</div>${opts()}`;
  if (e.k === "blank") h += `<div class="prompt display" lang="es">${e.blank}</div><p class="muted">${esc(e.hint)}</p>${opts()}`;
  if (e.k === "order") h += `<div class="prompt display">${esc(e.prompt)}</div><div class="built" id="built" lang="es"></div><div class="bank" lang="es">${e.tokens.map((t, i) => `<button class="tok" data-t="${i}">${esc(t)}</button>`).join("")}</div>`;
  if (e.k === "listen") h += `${sayBtn(e.it.es, "Nog eens luisteren")}${input}`;
  if (e.k === "type") h += `<div class="prompt display">${esc(e.prompt)}</div>${input}`;
  const b = $("lbody"); b.innerHTML = h; b.scrollTop = 0;
  if (e.k === "listen") setTimeout(() => speak(e.it.es), 300);
  b.querySelectorAll(".opt").forEach((o) => (o.onclick = () => {
    if (L.answered) return;
    b.querySelectorAll(".opt").forEach((x) => x.classList.remove("sel")); o.classList.add("sel");
    L.sel = e.opts[o.dataset.o]; btn.disabled = false;
  }));
  b.querySelectorAll(".tok").forEach((t) => (t.onclick = () => { if (L.answered) return; t.classList.add("used"); L.built.push({ w: e.tokens[t.dataset.t], el: t }); renderBuilt(); }));
  const a = $("ans");
  if (a) { a.oninput = () => (btn.disabled = !a.value.trim()); a.onkeydown = (ev) => { if (ev.key === "Enter" && !btn.disabled) btn.click(); }; a.focus(); }
}
function renderBuilt() {
  const L = S.L, bb = $("built");
  bb.innerHTML = L.built.map((x, i) => `<button class="tok" data-b="${i}">${esc(x.w)}</button>`).join("");
  bb.querySelectorAll("[data-b]").forEach((t) => (t.onclick = () => { if (L.answered) return; const x = L.built.splice(+t.dataset.b, 1)[0]; x.el.classList.remove("used"); renderBuilt(); }));
  $("checkBtn").disabled = !L.built.length;
}
$("checkBtn").onclick = () => {
  const L = S.L; if (!L) return;
  if (L.finished) { closeLesson(); return; }
  if (L.answered) { L.i++; if (L.i >= L.ex.length) finishLesson(); else renderEx(); return; }
  const e = L.ex[L.i];
  const given = e.k === "order" ? L.built.map((x) => x.w).join(" ") : e.k === "listen" || e.k === "type" ? $("ans").value : L.sel;
  const g = norm(given), a = norm(e.answer);
  const ok = e.k === "listen" || e.k === "type" ? lev(g, a) <= Math.max(1, Math.floor(a.length * 0.12)) : g === a;
  L.answered = true;
  const gain = ok ? 10 + (L.combo >= 2 ? 5 : 0) : 0;
  if (ok) { L.ok++; L.combo++; L.best = Math.max(L.best, L.combo); L.xp += gain; } else { L.combo = 0; L.missed.push(e.it.es); }
  // spaced repetition: box 0-4, copy the stored card before changing it
  const card = { item_id: e.it.id, es: e.it.es, box: 0, ok: 0, ko: 0, ...(S.cards[e.it.id] || {}) };
  if (ok) { card.box = Math.min(4, card.box + 1); card.ok++; } else { card.box = 0; card.ko++; }
  card.due = addDays(todayStr(), BOX_DAYS[card.box]); card.last = new Date().toISOString();
  delete card.user_id;
  S.cards = { ...S.cards, [card.item_id]: card };
  save(() => S.store.saveCard(card));
  $("lfoot").className = "lfoot " + (ok ? "good" : "bad"); $("verdict").hidden = false;
  $("verdict").innerHTML = ok ? `Goed zo! +${gain} XP${L.combo >= 3 ? " · " + L.combo + " op rij" : ""}` : `Bijna. Het goede antwoord:<small lang="es">${esc(e.answer)}${e.k !== "mc_es" ? " · " + esc(e.it.nl) : ""}</small>`;
  $("lbody").querySelectorAll(".opt").forEach((o) => { const v = e.opts[o.dataset.o]; if (norm(v) === a) o.classList.add("right"); else if (o.classList.contains("sel")) o.classList.add("wrong"); });
  if (!ok && e.k !== "mc_es") speak(e.it.es);
  $("checkBtn").textContent = L.i + 1 >= L.ex.length ? "Afronden" : "Verder";
  $("checkBtn").disabled = false;
  $("combo").innerHTML = L.combo > 1 ? icon("flame", 16) + L.combo : "";
};
async function finishLesson() {
  const L = S.L; L.finished = true;
  const sec = Math.round((Date.now() - L.started) / 1000), n = L.ex.length;
  const stars = L.ok === n ? 3 : L.ok >= n * 0.75 ? 2 : L.ok >= n / 2 ? 1 : 0;
  const bonus = stars === 3 ? 30 : stars === 2 ? 15 : 0, xp = L.xp + bonus;
  const missed = [...new Set(L.missed)];
  $("lbar").style.width = "100%"; $("combo").innerHTML = "";
  $("lbody").innerHTML = `<div class="finish" id="finish">
      <div class="stars" aria-label="${stars} van 3 sterren">${[0, 1, 2].map((k) => starIcon(k < stars)).join("")}</div>
      <div class="big display">+${xp} XP</div>
      <p><b>${L.ok} van ${n}</b> goed · ${Math.max(1, Math.round(sec / 60))} min</p>
      ${L.best >= 3 ? `<p class="muted">Beste reeks: ${L.best} op rij</p>` : ""}
      ${missed.length ? `<div class="review"><h3 class="mono">NOG EENS OEFENEN</h3><ul>${missed.map((es) => { const it = Object.values(S.items).find((x) => x.es === es); return `<li><b lang="es">${esc(es)}</b><span>${esc(it?.nl || "")}</span></li>`; }).join("")}</ul></div>` : '<p class="muted">Alles goed. Geen woorden om te herhalen.</p>'}
    </div>`;
  $("lfoot").className = "lfoot"; $("verdict").hidden = true;
  $("checkBtn").textContent = "Terug naar paspoort"; $("checkBtn").disabled = false;
  const wasDone = L.week ? weekDone(L.week) : false;
  if (L.mode === "stop") {
    const prev = S.stops[L.stop.id];
    const row = { lesson_id: L.stop.id, week: L.week.week, stars: Math.max(stars, prev?.stars || 0), done_at: prev?.done_at || new Date().toISOString() };
    S.stops = { ...S.stops, [row.lesson_id]: row };
    save(() => S.store.saveStop(row));
  }
  if (L.week && !wasDone && weekDone(L.week)) L.stampWeek = L.week;
  await updateToday((d) => { d.lessons += 1; d.minutes += sec / 60; d.xp += xp; });
  save(() => S.store.addSession("lesson", { mode: L.mode, lesson: L.stop?.id || null, title: $("lessonTitle").textContent, score: L.ok + "/" + n, stars, xp, dur: sec, missed }));
}

// ---------- stamp animation ----------
function showStamp(w) {
  const key = "stamped-" + S.uid + "-w" + w.week;
  if (S.readonly || ls.get(key)) return;
  ls.set(key, "1");
  const ov = $("stampOverlay");
  ov.innerHTML = `<div class="big-stamp"><span class="mono">SEMANA ${w.week}</span><b class="display">${esc(w.stamp)}</b><span class="mono">${stampDate(new Date().toISOString())}</span></div><p class="display">Week ${w.week} gestempeld!</p><button class="btn" id="stampOk">Verder</button>`;
  ov.hidden = false;
  $("stampOk").onclick = () => { ov.hidden = true; renderHome(); };
}

// ---------- dialog (Gesprek) ----------
function renderChatTab() {
  if (S.chat) return;
  const list = Object.values(S.scen).filter((s) => { const w = S.weeks.find((x) => x.week === s.week); return w && w.start <= todayStr(); });
  $("tab-chat").innerHTML = `<div class="page">
    <h2 class="display">Gesprek</h2>
    <p class="muted">Schrijf in het Spaans, ook met fouten. Aan het eind krijg je correcties, en Augusto kan het gesprek lezen.</p>
    <div class="scen">${list.map((s) => `<button data-sc="${s.key}"><span class="sc-ico">${icon(s.icon)}</span><b>${esc(s.title)}</b><small>${esc(s.desc)}</small></button>`).join("")}</div></div>`;
  $("tab-chat").querySelectorAll("[data-sc]").forEach((b) => (b.onclick = () => startDialog(b.dataset.sc)));
}
async function startDialog(key) {
  const sc = S.scen[key]; if (!sc) return;
  await voicesReady();
  S.chat = { key, week: sc.week, turns: [{ role: "assistant", content: sc.opener }], started: Date.now(), ended: false };
  $("tab-chat").innerHTML = `<div class="page chat-page">
    <div class="sheet-head"><button class="icon-btn" id="chatBack" aria-label="Terug">${icon("back")}</button><div><span class="mono muted">GESPREK</span><h2 class="display">${esc(sc.title)}</h2></div></div>
    <p class="muted">${esc(sc.desc)}</p>
    <div class="chat" id="chat" aria-live="polite"></div>
    <form class="chat-form" id="chatForm"><input class="chatin" id="chatInput" maxlength="${MAX_MSG}" placeholder="Schrijf in het Spaans..." autocomplete="off" lang="es"><button class="btn" id="sendBtn" aria-label="Sturen">${icon("send", 20)}</button></form>
    <div class="row"><button class="btn ghost" id="endBtn">Stoppen en correcties zien</button><span class="status" id="chatStatus"></span></div>
    <div id="feedback" class="feedback" hidden></div></div>`;
  $("chatBack").onclick = () => { if (S.chat && !S.chat.ended && S.chat.turns.length > 1 && !confirm("Stoppen? Het gesprek telt alleen als je op 'Stoppen en correcties zien' tikt.")) return; S.chat = null; renderChatTab(); };
  $("chatForm").onsubmit = (e) => { e.preventDefault(); sendMsg(); };
  $("endBtn").onclick = endDialog;
  renderChat(); speak(sc.opener);
}
function renderChat(pending) {
  const sc = S.scen[S.chat.key];
  $("chat").innerHTML = S.chat.turns.map((t) => `<div class="msg ${t.role === "user" ? "me" : "them"}"><span class="who mono">${t.role === "user" ? "JIJ" : esc(sc.title.toUpperCase())}</span><span lang="es">${esc(t.content)}</span>${t.role === "assistant" ? sayBtn(t.content, "") : ""}</div>`).join("") + (pending ? '<div class="msg them typing"><span></span><span></span><span></span></div>' : "");
  $("chat").lastElementChild?.scrollIntoView({ block: "nearest" });
}
async function sendMsg() {
  const c = S.chat, inp = $("chatInput"), v = inp.value.trim().slice(0, MAX_MSG);
  if (!v || !c || c.ended || c.busy) return;
  inp.value = ""; c.turns.push({ role: "user", content: v }); c.busy = true; renderChat(true); $("sendBtn").disabled = true; $("chatStatus").textContent = "";
  try { const { text } = await S.store.ai("/dialog", { week: c.week, scenario: c.key, turns: c.turns }); c.turns.push({ role: "assistant", content: text }); renderChat(); speak(text); }
  catch (e) { renderChat(); $("chatStatus").textContent = aiError(e); }
  c.busy = false; $("sendBtn").disabled = false; inp.focus();
}
const aiError = (e) => e.code === "limit" ? "Je hebt het maximum voor vandaag bereikt. Morgen kan het weer." : e.code === "forbidden" ? "Je hebt geen toegang. Log opnieuw in." : "Geen antwoord ontvangen. Probeer het nog eens.";
async function endDialog() {
  const c = S.chat; if (!c || c.ended) return;
  const mine = c.turns.filter((t) => t.role === "user");
  if (!mine.length) { $("chatStatus").textContent = "Schrijf eerst minstens één bericht."; return; }
  c.ended = true; $("endBtn").disabled = true; $("sendBtn").disabled = true; $("chatStatus").textContent = "Correcties ophalen...";
  let fb = null;
  try { fb = await S.store.ai("/feedback", { week: c.week, scenario: c.key, turns: c.turns }); $("chatStatus").textContent = ""; }
  catch (e) { $("chatStatus").textContent = aiError(e) + " Het gesprek telt wel."; }
  if (fb) {
    $("feedback").hidden = false;
    $("feedback").innerHTML = `<span class="pill ${fb.score >= 4 ? "ok" : "warn"}">${esc(fb.score)}/5</span> <b>${esc(fb.praise)}</b>${(fb.errors || []).length ? `<ul>${fb.errors.map((x) => `<li><s lang="es">${esc(x.said)}</s> → <b lang="es">${esc(x.better)}</b><br><small>${esc(x.why)}</small></li>`).join("")}</ul>` : "<p>Geen fouten. Goed gedaan.</p>"}<button class="btn wide" id="chatDone">Klaar</button>`;
    $("chatDone").onclick = () => { S.chat = null; show("home"); };
  } else {
    $("feedback").hidden = false; $("feedback").innerHTML = '<button class="btn wide" id="chatDone">Terug</button>';
    $("chatDone").onclick = () => { S.chat = null; show("home"); };
  }
  const sec = Math.round((Date.now() - c.started) / 1000), xp = 20 + mine.length * 5, sc = S.scen[c.key];
  await updateToday((d) => { d.dialog = true; d.minutes += sec / 60; d.xp += xp; });
  save(() => S.store.addDialog({ scenario: sc.title, turns: c.turns, feedback: fb }));
  save(() => S.store.addSession("dialog", { scenario: sc.title, score: fb ? fb.score + "/5" : "", dur: sec, turns: mine.length, xp }));
}

// ---------- words ----------
function renderWords() {
  const weeks = S.weeks.filter((w) => ready(w) && w.start <= todayStr());
  $("tab-words").innerHTML = `<div class="page">
    <h2 class="display">Woorden</h2>
    <div class="stack"><button class="btn wide" id="extraLesson">Snelle les (12 oefeningen)</button><button class="btn ghost wide" id="weakLesson">Alleen mijn zwakke woorden</button></div>
    ${weeks.map((w) => `<h3 class="mono">SEMANA ${w.week} · ${esc(w.title.toUpperCase())}</h3><ul class="vocab">${weekItems(w).map((it) => {
      const c = S.cards[it.id]; const lvl = !c ? "" : c.box >= 3 ? "strong" : c.ko > 0 && c.box <= 1 ? "weak" : "";
      return `<li class="${lvl}"><div><b lang="es">${esc(it.es)}</b><small>${esc(it.nl)}</small></div>${hasEs() ? `<button class="icon-btn" data-say="${esc(it.es)}" aria-label="Luisteren">${icon("speaker", 20)}</button>` : ""}</li>`;
    }).join("")}</ul>`).join("")}</div>`;
  $("extraLesson").onclick = () => startLesson({ mode: "extra", week: activeWeek() });
  $("weakLesson").onclick = () => startLesson({ mode: "weak", week: activeWeek() });
}

// ---------- Augusto's panel (Spanish) ----------
async function renderPanel() {
  const el = $("tab-panel");
  if (!el.dataset.built) {
    el.dataset.built = "1";
    el.innerHTML = `<div class="page" lang="es">
      <div class="sec-head"><h2 class="display">Panel de Augusto</h2><span class="live mono"><i></i>EN VIVO</span></div>
      <p class="muted">Se actualiza solo cuando Claire practica.</p>
      <button class="btn ghost wide" id="viewAs">${icon("eye", 18)} Ver como Claire</button>
      <div class="stats" id="pStats"></div>
      <h3 class="mono">HOY</h3><div class="today" id="pToday"></div>
      <h3 class="mono">MINUTOS POR DÍA · ÚLTIMAS 2 SEMANAS</h3><div class="days" id="pDays"></div>
      <h3 class="mono">NOTA PARA CLAIRE</h3>
      <textarea id="noteInput" maxlength="500" placeholder="Ella la ve al abrir la app."></textarea>
      <div class="row"><button class="btn" id="noteSave">Guardar nota</button><span class="status" id="noteStatus"></span></div>
      <h3 class="mono">ÚLTIMAS SESIONES</h3><div class="list" id="pSessions"></div>
      <h3 class="mono">PALABRAS FLOJAS</h3><div class="chips" id="pWeak"></div>
      <h3 class="mono">PALABRAS DOMINADAS</h3><div class="chips" id="pStrong"></div>
      <h3 class="mono">DIÁLOGOS COMPLETOS</h3><div id="pDialogs"></div>
      <button class="link small" id="logout">${icon("logout", 16)} Cerrar sesión</button></div>`;
    $("viewAs").onclick = viewAsLearner;
    $("noteInput").value = S.note?.text || "";
    $("noteSave").onclick = async () => {
      try { await S.store.setNote($("noteInput").value.trim()); $("noteStatus").textContent = "Guardada."; }
      catch (e) { $("noteStatus").textContent = "No se pudo guardar."; }
    };
    $("logout").onclick = async () => { await S.store.signOut(); location.reload(); };
    let t = null;
    S.panelUnsub?.();
    S.panelUnsub = S.store.subscribe(S.store.learnerId, () => { clearTimeout(t); t = setTimeout(fillPanel, 300); });
  }
  await fillPanel();
}
async function fillPanel() {
  if (!S.store.learnerId) { $("pStats").innerHTML = '<div class="stat wide"><span>Claire todavía no ha entrado nunca.</span></div>'; return; }
  let p;
  try { p = await S.store.panel(S.store.learnerId); } catch (e) { $("pStats").innerHTML = '<div class="stat wide"><span>No se pudo cargar el progreso.</span></div>'; return; }
  const days = byKey(p.days, "day"), t = todayStr(), today = days[t];
  const st = streak(days);
  $("pStats").innerHTML = `<div class="stat"><b class="display">${st}</b><span>${st === 1 ? "día seguido" : "días seguidos"}</span></div><div class="stat"><b class="display">${totalXp(days)}</b><span>XP</span></div><div class="stat"><b class="display">${Math.round(totalMin(days))}</b><span>minutos</span></div>`;
  $("pToday").innerHTML = today ? [["Lección", today.lessons >= 1, today.lessons > 1 ? today.lessons + " lecciones" : ""], ["Diálogo", today.dialog, ""], ["Frase por WhatsApp", today.phrase, ""]].map(([l, ok, x]) => `<div class="${ok ? "on" : ""}"><span class="dot">${ok ? icon("check", 12) : ""}</span>${l}${x ? ` <small>(${x})</small>` : ""}</div>`).join("") : '<div class="muted">Todavía nada hoy.</div>';
  const maxM = Math.max(10, ...Array.from({ length: 14 }, (_, i) => Number(days[addDays(t, -i)]?.minutes || 0)));
  $("pDays").innerHTML = Array.from({ length: 14 }, (_, i) => { const k = addDays(t, i - 13), m = Number(days[k]?.minutes || 0); return `<div class="day ${m > 0 ? "on" : ""}" title="${k}: ${m > 0 ? Math.max(1, Math.round(m)) : 0} min"><i style="height:${Math.max(m > 0 ? 8 : 3, (m / maxM) * 100)}%"></i><span>${parse(k).getDate()}</span></div>`; }).join("");
  $("pSessions").innerHTML = p.sessions.length ? p.sessions.map((s) => {
    const x = s.detail || {};
    const label = s.kind === "lesson" ? `Lección · ${esc(x.title || "")} · ${esc(x.score)} · ${x.stars ?? 0}★ · +${x.xp} XP${x.missed?.length ? ` · falló: ${esc(x.missed.join(", "))}` : ""}` : s.kind === "dialog" ? `Diálogo · ${esc(x.scenario)} · ${esc(x.score || "sin nota")} · ${x.turns} mensajes` : `Frase por WhatsApp: "${esc(x.text)}"`;
    return `<div class="item">${label}<small>${fmtEs(s.ts)}${x.dur ? ` · ${Math.max(1, Math.round(x.dur / 60))} min` : ""}</small></div>`;
  }).join("") : '<div class="item muted">Todavía nada. Aparece aquí apenas Claire termine algo.</div>';
  const weak = [], strong = [];
  for (const c of p.cards) { if (c.ko > 0 && c.box <= 1) weak.push(c.es); else if (c.box >= 3) strong.push(c.es); }
  $("pWeak").innerHTML = weak.length ? weak.map((x) => `<span class="chip weak">${esc(x)}</span>`).join("") : '<span class="chip">Nada todavía</span>';
  $("pStrong").innerHTML = strong.length ? strong.map((x) => `<span class="chip strong">${esc(x)}</span>`).join("") : '<span class="chip">Nada todavía</span>';
  $("pDialogs").innerHTML = p.dialogs.length ? p.dialogs.map((d) => `<details class="item"><summary>${esc(d.scenario)} · ${fmtEs(d.ts)}${d.feedback ? ` · ${esc(d.feedback.score)}/5` : ""}</summary><div class="chat">${(d.turns || []).map((t) => `<div class="msg ${t.role === "user" ? "me" : "them"}">${esc(t.content)}</div>`).join("")}</div>${d.feedback?.errors?.length ? `<ul class="fixes">${d.feedback.errors.map((e) => `<li><s>${esc(e.said)}</s> → <b>${esc(e.better)}</b></li>`).join("")}</ul>` : ""}</details>`).join("") : '<div class="item muted">Sin diálogos aún.</div>';
}
async function viewAsLearner() {
  if (!S.store.learnerId) { status("Claire todavía no ha entrado nunca."); return; }
  S.readonly = true; await loadUser(S.store.learnerId); show("home");
}
async function backToOwner() { S.readonly = false; await loadUser(S.store.me.id); show("panel"); }

// ---------- login ----------
function renderLogin(msg) {
  $("app").hidden = true; $("login").hidden = false;
  $("login").innerHTML = `<div class="login-card">
    <span class="mono gold">PASAPORTE · ESPAÑOL</span>
    <h1 class="display">Español para Lima</h1>
    <p>Log in met je e-mailadres. Je krijgt een link in je mailbox.</p>
    <form id="loginForm"><label for="email" class="mono">E-MAIL</label><input id="email" type="email" required autocomplete="email" inputmode="email"><button class="btn wide" id="loginBtn">Stuur me een inloglink</button></form>
    <p class="status" id="loginStatus">${esc(msg || "")}</p></div>`;
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    $("loginBtn").disabled = true; $("loginStatus").textContent = "Even geduld...";
    try { await S.store.signIn($("email").value.trim().toLowerCase()); $("loginStatus").textContent = "Check je mail en tik op de link. Open hem op dit toestel."; }
    catch (err) { $("loginStatus").textContent = "Dat lukte niet. Gebruik het e-mailadres dat Augusto heeft ingesteld."; $("loginBtn").disabled = false; }
  };
}

// ---------- boot ----------
async function boot() {
  try {
    await loadContent();
    S.store = await createStore();
    let ok = false;
    try { ok = await S.store.init(); } catch (e) { renderLogin(e.code === "not_allowed" ? "Dit e-mailadres heeft geen toegang." : "Inloggen mislukt. Probeer het opnieuw."); return; }
    if (!ok) { renderLogin(); return; }
    await loadUser(S.store.me.id);
    $("login").hidden = true; $("app").hidden = false;
    S.store.onNote((n) => { S.note = n; if (S.tab === "home" && !S.L) renderHome(); });
    pickVoice();
    show("home");
    const w = activeWeek(); if (w && weekDone(w)) showStamp(w);
  } catch (e) {
    console.error(e);
    $("login").hidden = false; $("login").innerHTML = '<div class="login-card"><h1 class="display">Er ging iets mis</h1><p>Controleer je internetverbinding en probeer het opnieuw.</p><button class="btn" onclick="location.reload()">Opnieuw</button></div>';
  }
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
if ("speechSynthesis" in window) speechSynthesis.getVoices();
boot();
