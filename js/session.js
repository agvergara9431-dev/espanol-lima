// The full session (review, new phrases, grammar, active practice, mission, closing quiz, weekly test),
// plus the optional review and "Extra oefenen". One runner plays a list of steps; progress is kept in
// localStorage so she can continue later, but a session only counts once it is finished.
import { icon, starIcon } from "./icons.js";
import {
  $, esc, S, todayStr, shuffle, norm, closeEnough, similarity, hasEs, speak, voicesReady, Recognition, canRecord,
  itemsUpTo, weekSessions, testsFor, schedule, updateCard, updateToday, save, allSaved, ls, stampDate,
} from "./core.js";

const SECTION = { review: "Herhalen", new: "Nieuwe zinnen", grammar: "Grammatica", active: "Oefenen", mission: "Missie", quiz: "Afsluitende quiz", test: "Weektoets", extra: "Extra oefenen" };
const MAX_MSG = 300;
let onClose = () => {};
export const setOnClose = (fn) => (onClose = fn);
const runKey = () => "run-" + S.uid;

// ---------- building exercises ----------
const sayBtn = (text, label = "Luisteren") => (hasEs() ? `<button class="speak" data-say="${esc(text)}">${icon("speaker", 20)}${label}</button>` : "");
function itemEx(item, kind, section, pool) {
  const words = item.es.split(" ");
  if (kind === "listen" && !hasEs()) kind = "type";
  if (kind === "speak" && !Recognition && !canRecord()) kind = "type";
  if (kind === "order" && words.length < 3) kind = "type";
  const others = shuffle(pool.filter((x) => x.id !== item.id)).slice(0, 3);
  const base = { section, itemId: item.id, es: item.es, nl: item.nl };
  if (kind === "mc_es") return { ...base, k: "mc", q: "Wat betekent dit?", prompt: item.es, lang: "es", say: item.es, opts: shuffle([item.nl, ...others.map((o) => o.nl)]), answer: item.nl };
  if (kind === "mc_nl") return { ...base, k: "mc", q: "Hoe zeg je dit in het Spaans?", prompt: item.nl, opts: shuffle([item.es, ...others.map((o) => o.es)]), answer: item.es };
  if (kind === "order") { const extra = shuffle(others.flatMap((o) => o.es.split(" "))).filter((w) => !words.map(norm).includes(norm(w))).slice(0, 2); return { ...base, k: "order", q: "Zet de woorden in de goede volgorde", prompt: item.nl, tokens: shuffle([...words, ...extra]), answer: item.es }; }
  if (kind === "listen") return { ...base, k: "listen", q: "Dictee: luister en schrijf wat je hoort", answer: item.es, say: item.es };
  if (kind === "speak") return { ...base, k: "speak", q: "Zeg het hardop", prompt: item.es, lang: "es", say: item.es, answer: item.es };
  return { ...base, k: "type", q: "Schrijf het in het Spaans", prompt: item.nl, answer: item.es, alt: [] };
}
function grammarEx(g, ex, section) {
  const base = { section, grammarId: g.id, q: ex.q, why: ex.why };
  if (ex.type === "mc") return { ...base, k: "mc", prompt: ex.prompt, opts: shuffle(ex.opts), answer: ex.answer };
  if (ex.type === "fill") return { ...base, k: "mc", prompt: ex.prompt, blank: true, lang: "es", opts: shuffle(ex.opts), answer: ex.answer };
  if (ex.type === "order") return { ...base, k: "order", prompt: ex.prompt, tokens: shuffle(ex.answer.split(" ")), answer: ex.answer };
  return { ...base, k: "type", prompt: ex.prompt, answer: ex.answer, alt: ex.alt || [] };
}
// Review: what is due, the missed ones first.
function dueItems(n, max) {
  const t = todayStr();
  return itemsUpTo(n).filter((it) => S.cards[it.id] && S.cards[it.id].due <= t)
    .sort((a, b) => { const A = S.cards[a.id], B = S.cards[b.id]; return (A.box - B.box) || (B.ko - A.ko) || A.due.localeCompare(B.due); })
    .slice(0, max);
}

export function buildSession(n) {
  const sess = S.sessions[n], pool = itemsUpTo(n);
  const steps = [];
  const review = dueItems(n - 1, 12);
  if (review.length) {
    steps.push({ t: "intro", section: "review", title: "Herhalen", text: `${review.length} zinnen die vandaag terugkomen. De fouten van vorige keer eerst.` });
    review.forEach((it, i) => steps.push({ t: "ex", ex: itemEx(it, ["mc_es", "mc_nl", "type"][i % 3], "review", pool) }));
  }
  steps.push({ t: "intro", section: "new", title: "Nieuwe zinnen", text: `${sess.items.length} nieuwe zinnen. Luister, lees het voorbeeld en zeg ze even na.` });
  sess.items.forEach((it) => steps.push({ t: "phrase", item: it }));
  steps.push({ t: "grammar", g: sess.grammar });
  shuffle(sess.grammar.exercises).forEach((ex) => steps.push({ t: "ex", ex: grammarEx(sess.grammar, ex, "grammar") }));
  steps.push({ t: "intro", section: "active", title: "Actief oefenen", text: "Schrijven, woorden ordenen, een dictee en hardop zeggen. Kleine typfouten en accenten tellen niet." });
  const kinds = ["type", "order", "listen", "speak"];
  shuffle(sess.items).forEach((it, i) => steps.push({ t: "ex", ex: itemEx(it, kinds[i % kinds.length], "active", pool) }));
  steps.push({ t: "mission", m: sess.mission, week: sess.week, n });
  steps.push({ t: "intro", section: "quiz", title: "Afsluitende quiz", text: "5 vragen over vandaag. Wat je mist, komt morgen terug in je herhaling." });
  shuffle(sess.items).slice(0, 4).forEach((it, i) => steps.push({ t: "ex", ex: itemEx(it, i % 2 ? "type" : "mc_nl", "quiz", pool) }));
  const gq = shuffle(sess.grammar.exercises)[0];
  steps.push({ t: "ex", ex: grammarEx(sess.grammar, gq, "quiz") });
  for (const w of testsFor(n)) {
    const ws = weekSessions(w).filter((s) => s.items?.length);
    const items = shuffle(ws.flatMap((s) => s.items)).slice(0, 8);
    const gs = shuffle(ws.flatMap((s) => s.grammar.exercises.map((ex) => [s.grammar, ex]))).slice(0, 2);
    const week = S.weeks.find((x) => x.week === w);
    steps.push({ t: "intro", section: "test", title: `Weektoets week ${w}`, text: `10 vragen over week ${w}. Met 70% of meer krijg je de stempel "${week.stamp}".` });
    items.forEach((it, i) => steps.push({ t: "ex", ex: { ...itemEx(it, ["mc_nl", "type", "mc_es"][i % 3], "test", pool), testWeek: w } }));
    gs.forEach(([g, ex]) => steps.push({ t: "ex", ex: { ...grammarEx(g, ex, "test"), testWeek: w } }));
  }
  steps.push({ t: "finish" });
  return { kind: "session", n, week: sess.week, steps, tests: testsFor(n) };
}
export function buildReview(n) {
  const pool = itemsUpTo(n);
  let items = dueItems(n, 12);
  if (items.length < 6) items = items.concat(shuffle(pool.filter((x) => !items.includes(x))).slice(0, 10 - items.length));
  const steps = items.map((it, i) => ({ t: "ex", ex: itemEx(it, ["mc_es", "type", "mc_nl", "listen"][i % 4], "review", pool) }));
  return { kind: "review", n, steps: [...steps, { t: "finish" }] };
}
export async function buildExtra(n) {
  const pool = itemsUpTo(n);
  const weak = pool.filter((it) => S.cards[it.id] && (S.cards[it.id].ko > 0 && S.cards[it.id].box <= 1));
  const words = (weak.length >= 3 ? weak : shuffle(pool)).slice(0, 10).map((it) => ({ es: it.es, nl: it.nl }));
  const { exercises } = await S.store.ai("/extra", { words });
  const byEs = Object.fromEntries(pool.map((it) => [norm(it.es), it]));
  const steps = exercises.map((ex) => {
    const it = byEs[norm(ex.word || "")];
    const e = ex.type === "type" ? { k: "type", prompt: ex.prompt, answer: ex.answer, alt: ex.alt || [] }
      : { k: "mc", prompt: ex.prompt, blank: ex.type === "fill", opts: shuffle(ex.opts.includes(ex.answer) ? ex.opts : [ex.answer, ...ex.opts].slice(0, 4)), answer: ex.answer };
    return { t: "ex", ex: { ...e, section: "extra", q: ex.q, why: ex.why, itemId: it?.id, es: it?.es } };
  });
  return { kind: "extra", n, steps: [...steps, { t: "finish" }] };
}

// ---------- runner ----------
let tick = null, lastInput = Date.now();
addEventListener("pointerdown", () => (lastInput = Date.now()), true);
addEventListener("keydown", () => (lastInput = Date.now()), true);
// After an answer, the saved position already points at the next step, so a resume never repeats it.
const persist = (offset = 0) => { const R = S.run; if (R && R.kind === "session" && !S.readonly) ls.set(runKey(), JSON.stringify({ ...R, i: R.i + offset, built: [], sel: null, answered: false, quit: false })); };
export const savedRun = () => { try { const r = JSON.parse(ls.get(runKey()) || "null"); return r && r.kind === "session" && r.n === schedule().next ? r : null; } catch { return null; } };

export async function start(run, resume = false) {
  await voicesReady();
  S.run = resume ? run : { ...run, i: 0, results: [], started: Date.now(), active: 0, mission: null, date: todayStr() };
  $("lesson").hidden = false; document.body.classList.add("lock");
  clearInterval(tick);
  tick = setInterval(() => { const R = S.run; if (R && !document.hidden && Date.now() - lastInput < 90000) R.active += 5; }, 5000);
  render();
}
function close() {
  clearInterval(tick);
  $("lesson").hidden = true; document.body.classList.remove("lock");
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const R = S.run; S.run = null;
  onClose(R);
}
$("quitBtn").onclick = () => {
  const R = S.run;
  if (R && !R.finished && R.i > 0 && !R.quit) {
    R.quit = true;
    $("lfoot").className = "lfoot bad"; $("verdict").hidden = false;
    $("verdict").innerHTML = R.kind === "session" ? "Stoppen? Je voortgang wordt bewaard, maar de sessie telt pas als je hem afmaakt.<small>Tik nog eens op het kruisje om te stoppen.</small>" : "Stoppen?<small>Tik nog eens op het kruisje om te stoppen.</small>";
    return;
  }
  persist(); close();
};

function render() {
  const R = S.run, step = R.steps[R.i];
  R.quit = false; R.answered = false; R.sel = null; R.built = [];
  $("lbar").style.width = (R.i / (R.steps.length - 1)) * 100 + "%";
  $("lessonTitle").textContent = step.t === "finish" ? "" : SECTION[step.ex?.section || step.section || (step.t === "phrase" ? "new" : step.t === "grammar" ? "grammar" : step.t)] || "";
  $("lfoot").className = "lfoot"; $("verdict").hidden = true; $("lfoot").hidden = false;
  const btn = $("checkBtn"); btn.disabled = false; btn.textContent = "Verder"; btn.onclick = next;
  const b = $("lbody"); b.scrollTop = 0;
  if (S.store?.mode === "mock") window.__step = () => S.run?.steps[S.run.i]; // test hook, localhost mock only
  if (step.t === "intro") b.innerHTML = `<div class="intro"><span class="mono">${esc(SECTION[step.section]).toUpperCase()}</span><h2 class="display">${esc(step.title)}</h2><p>${esc(step.text)}</p></div>`;
  if (step.t === "phrase") {
    const it = step.item;
    b.innerHTML = `<div class="phrase"><div class="prompt display" lang="es">${esc(it.es)}</div>${sayBtn(it.es)}<p class="nl">${esc(it.nl)}</p>
      ${it.ex ? `<div class="example"><span class="mono">VOORBEELD</span><p lang="es"><b>${esc(it.ex.es)}</b></p><p class="muted">${esc(it.ex.nl)}</p>${sayBtn(it.ex.es, "Voorbeeld")}</div>` : ""}</div>`;
    setTimeout(() => speak(it.es), 250);
  }
  if (step.t === "grammar") {
    const g = step.g;
    b.innerHTML = `<div class="grammar"><span class="mono">GRAMMATICA</span><h2 class="display">${esc(g.title)}</h2>${g.explain.map((p) => `<p>${esc(p)}</p>`).join("")}
      <div class="compare"><span class="mono">VERGELIJK MET HET NEDERLANDS</span><p>${esc(g.compare)}</p></div>
      <ul class="examples">${g.examples.map((x) => `<li><b lang="es">${esc(x.es)}</b><span>${esc(x.nl)}</span></li>`).join("")}</ul></div>`;
    btn.textContent = "Naar de oefeningen";
  }
  if (step.t === "ex") renderEx(step.ex);
  if (step.t === "mission") renderMission(step);
  if (step.t === "finish") finish();
}
function next() { const R = S.run; R.i++; persist(); render(); }

function renderEx(e) {
  const R = S.run, b = $("lbody"), btn = $("checkBtn");
  btn.textContent = "Controleren"; btn.disabled = true; btn.onclick = check;
  let h = `<div class="kind mono">${esc(e.q)}</div>`;
  const opts = () => `<div class="opts">${e.opts.map((o, i) => `<button class="opt" data-o="${i}" ${e.blank || /[áéíóúñ¿¡]/i.test(o) ? 'lang="es"' : ""}>${esc(o)}</button>`).join("")}</div>`;
  const input = `<input class="ans" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="es" placeholder="Schrijf in het Spaans">`;
  const prompt = e.prompt ? `<div class="prompt display" ${e.lang === "es" ? 'lang="es"' : ""}>${e.blank ? esc(e.prompt).replace("___", '<span class="blank"></span>') : esc(e.prompt)}</div>` : "";
  if (e.k === "mc") h += prompt + (e.say ? sayBtn(e.say) : "") + opts();
  if (e.k === "order") h += `${prompt}<div class="built" id="built" lang="es"></div><div class="bank" lang="es">${e.tokens.map((t, i) => `<button class="tok" data-t="${i}">${esc(t)}</button>`).join("")}</div>`;
  if (e.k === "type") h += prompt + input;
  if (e.k === "listen") h += `${sayBtn(e.say, "Nog eens luisteren")}${input}`;
  if (e.k === "speak") h += `${prompt}<p class="muted">${esc(e.nl || "")}</p>${sayBtn(e.say, "Eerst luisteren")}<div id="speakArea"></div>`;
  b.innerHTML = h;
  if (e.k === "listen") setTimeout(() => speak(e.say), 300);
  b.querySelectorAll(".opt").forEach((o) => (o.onclick = () => { if (R.answered) return; b.querySelectorAll(".opt").forEach((x) => x.classList.remove("sel")); o.classList.add("sel"); R.sel = e.opts[o.dataset.o]; btn.disabled = false; }));
  b.querySelectorAll(".tok").forEach((t) => (t.onclick = () => { if (R.answered) return; t.classList.add("used"); R.built.push({ w: e.tokens[t.dataset.t], el: t }); renderBuilt(); }));
  const a = $("ans");
  if (a) { a.oninput = () => (btn.disabled = !a.value.trim()); a.onkeydown = (ev) => { if (ev.key === "Enter" && !btn.disabled) btn.click(); }; a.focus(); }
  if (e.k === "speak") { $("lfoot").hidden = true; renderSpeak(e); }
}
function renderBuilt() {
  const R = S.run, bb = $("built");
  bb.innerHTML = R.built.map((x, i) => `<button class="tok" data-b="${i}">${esc(x.w)}</button>`).join("");
  bb.querySelectorAll("[data-b]").forEach((t) => (t.onclick = () => { if (R.answered) return; const x = R.built.splice(+t.dataset.b, 1)[0]; x.el.classList.remove("used"); renderBuilt(); }));
  $("checkBtn").disabled = !R.built.length;
}
function check() {
  const R = S.run, e = R.steps[R.i].ex;
  const given = e.k === "order" ? R.built.map((x) => x.w).join(" ") : e.k === "type" || e.k === "listen" ? $("ans").value : R.sel;
  const ok = e.k === "type" || e.k === "listen" ? closeEnough(given, [e.answer, ...(e.alt || [])]) : norm(given) === norm(e.answer);
  answered(ok, given);
}
// Shared by all exercise kinds: record the result, update the card, show the verdict.
function answered(ok, given, heard) {
  const R = S.run, e = R.steps[R.i].ex;
  if (R.answered) return;
  R.answered = true;
  R.results.push({ section: e.section, ok, itemId: e.itemId || null, grammarId: e.grammarId || null, es: e.es || e.answer, testWeek: e.testWeek || null });
  const item = e.itemId && S.items[e.itemId];
  if (item) updateCard(item, ok, { tomorrow: e.section === "quiz" });
  R.combo = ok ? (R.combo || 0) + 1 : 0;
  $("combo").innerHTML = R.combo > 1 ? icon("flame", 16) + R.combo : "";
  $("lfoot").hidden = false;
  $("lfoot").className = "lfoot " + (ok ? "good" : "bad"); $("verdict").hidden = false;
  const fix = e.k === "mc" && e.lang === "es" && !e.blank ? esc(e.answer) : `<span lang="es">${esc(e.answer)}</span>${e.nl && e.k !== "mc" ? " · " + esc(e.nl) : ""}`;
  $("verdict").innerHTML = (ok ? "Goed zo!" : `Bijna. Het goede antwoord:<small>${fix}</small>`) + (e.why ? `<small class="why">${esc(e.why)}</small>` : "") + (heard ? `<small>Ik hoorde: "${esc(heard)}"</small>` : "");
  $("lbody").querySelectorAll(".opt").forEach((o) => { const v = e.opts[o.dataset.o]; if (norm(v) === norm(e.answer)) o.classList.add("right"); else if (o.classList.contains("sel")) o.classList.add("wrong"); });
  if (!ok && e.es) speak(e.es);
  const btn = $("checkBtn"); btn.disabled = false; btn.textContent = "Verder"; btn.onclick = next;
  persist(1);
}

// ---------- speaking ----------
function renderSpeak(e) {
  const area = $("speakArea");
  if (Recognition) {
    area.innerHTML = `<button class="btn wide" id="recBtn">${icon("mic", 20)} Spreek in</button><p class="status" id="recStatus"></p><button class="link small" id="skipSpeak">Ik kan nu niet praten</button>`;
    $("recBtn").onclick = () => {
      const rec = new Recognition();
      rec.lang = "es-PE"; rec.interimResults = false; rec.maxAlternatives = 3;
      $("recBtn").disabled = true; $("recStatus").textContent = "Ik luister…";
      rec.onresult = (ev) => {
        const alts = Array.from(ev.results[0]).map((a) => a.transcript);
        const best = alts.reduce((a, b) => (similarity(b, e.answer) > similarity(a, e.answer) ? b : a), alts[0] || "");
        answered(similarity(best, e.answer) >= 0.7, best, best);
      };
      rec.onerror = () => { $("recBtn").disabled = false; $("recStatus").textContent = "Dat lukte niet. Probeer het nog eens."; };
      rec.onend = () => { if (!S.run?.answered) $("recBtn").disabled = false; };
      try { rec.start(); } catch { $("recBtn").disabled = false; }
    };
  } else {
    area.innerHTML = `<button class="btn wide" id="recBtn">${icon("mic", 20)} Opnemen</button><div id="cmp" hidden><p>Luister naar jezelf en naar het origineel. Klinkt het hetzelfde?</p><div class="row"><button class="btn ghost" id="playMe">${icon("speaker", 18)} Mijn opname</button>${sayBtn(e.say, "Origineel")}</div><div class="row"><button class="btn" id="rateOk">Klinkt goed</button><button class="btn ghost" id="rateNo">Nog niet</button></div></div><button class="link small" id="skipSpeak">Ik kan nu niet praten</button>`;
    let rec = null, chunks = [], url = null;
    $("recBtn").onclick = async () => {
      if (rec && rec.state === "recording") { rec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream); chunks = [];
        rec.ondataavailable = (ev) => chunks.push(ev.data);
        rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })); $("cmp").hidden = false; $("recBtn").innerHTML = icon("mic", 20) + " Opnieuw opnemen"; };
        rec.start(); $("recBtn").innerHTML = icon("mic", 20) + " Stop";
      } catch { $("recBtn").disabled = true; $("recBtn").textContent = "Geen toegang tot de microfoon"; }
    };
    area.addEventListener("click", (ev) => { if (ev.target.closest("#playMe") && url) new Audio(url).play(); });
    $("rateOk").onclick = () => answered(true);
    $("rateNo").onclick = () => answered(false);
  }
  $("skipSpeak").onclick = () => { const R = S.run; R.answered = true; $("lfoot").hidden = false; const btn = $("checkBtn"); btn.disabled = false; btn.textContent = "Verder"; btn.onclick = next; next(); };
}

// ---------- mission ----------
function renderMission(step) {
  const R = S.run, sc = S.scen[step.m.scenario], m = step.m;
  R.mission = R.mission || { scenario: step.m.scenario, turns: [{ role: "assistant", content: sc.opener }], fb: null };
  const btn = $("checkBtn"); btn.textContent = "Missie afronden"; btn.onclick = endMission;
  $("lbody").innerHTML = `<div class="mission-card"><span class="mono">MISSIE · ${esc(sc.title.toUpperCase())}</span><p><b>${esc(m.goal)}</b></p><p class="muted small">${esc(sc.desc)} Schrijf in het Spaans, fouten mogen.</p></div>
    <div class="chat" id="chat" aria-live="polite"></div>
    <form class="chat-form" id="chatForm"><input class="chatin" id="chatInput" maxlength="${MAX_MSG}" placeholder="Schrijf in het Spaans..." autocomplete="off" lang="es"><button class="btn" id="sendBtn" aria-label="Sturen">${icon("send", 20)}</button></form>
    <p class="status" id="chatStatus"></p><div id="feedback" class="feedback" hidden></div>`;
  $("chatForm").onsubmit = (ev) => { ev.preventDefault(); sendMsg(step); };
  btn.disabled = !R.mission.turns.some((t) => t.role === "user");
  renderChat();
  if (R.mission.turns.length === 1) speak(sc.opener);
  if (R.mission.fb || R.mission.skipped) showMissionResult();
}
function renderChat(pending) {
  const R = S.run, sc = S.scen[R.mission.scenario];
  $("chat").innerHTML = R.mission.turns.map((t) => `<div class="msg ${t.role === "user" ? "me" : "them"}"><span class="who mono">${t.role === "user" ? "JIJ" : esc(sc.title.toUpperCase())}</span><span lang="es">${esc(t.content)}</span>${t.role === "assistant" ? sayBtn(t.content, "") : ""}</div>`).join("") + (pending ? '<div class="msg them typing"><span></span><span></span><span></span></div>' : "");
  $("chat").lastElementChild?.scrollIntoView({ block: "nearest" });
}
const aiError = (e) => e.code === "limit" ? "Je hebt het maximum voor vandaag bereikt." : e.code === "forbidden" ? "Je hebt geen toegang. Log opnieuw in." : "Geen antwoord ontvangen. Probeer het nog eens.";
async function sendMsg(step) {
  const R = S.run, M = R.mission, inp = $("chatInput"), v = inp.value.trim().slice(0, MAX_MSG);
  if (!v || M.busy || M.fb) return;
  inp.value = ""; M.turns.push({ role: "user", content: v }); M.busy = true; renderChat(true); $("sendBtn").disabled = true; $("chatStatus").textContent = "";
  try { const { text } = await S.store.ai("/dialog", { week: step.week, session: step.n, turns: M.turns }); M.turns.push({ role: "assistant", content: text }); renderChat(); speak(text); }
  catch (e) { M.turns.pop(); inp.value = v; renderChat(); $("chatStatus").innerHTML = esc(aiError(e)) + ' <button class="link small" id="skipMission">Missie overslaan</button>'; $("skipMission").onclick = skipMission; }
  M.busy = false; $("sendBtn").disabled = false; $("checkBtn").disabled = !M.turns.some((t) => t.role === "user"); persist(); inp.focus();
}
async function endMission() {
  const R = S.run, M = R.mission, step = R.steps[R.i];
  $("checkBtn").disabled = true; $("chatStatus").textContent = "Missie controleren…";
  try { M.fb = await S.store.ai("/feedback", { week: step.week, session: step.n, turns: M.turns }); $("chatStatus").textContent = ""; showMissionResult(); }
  catch (e) { $("checkBtn").disabled = false; $("chatStatus").innerHTML = esc(aiError(e)) + ' <button class="link small" id="skipMission">Missie overslaan</button>'; $("skipMission").onclick = skipMission; }
  persist();
}
function skipMission() { const R = S.run; R.mission.skipped = true; showMissionResult(); persist(); }
function showMissionResult() {
  const M = S.run.mission, fb = M.fb, el = $("feedback");
  $("chatForm").hidden = true; el.hidden = false;
  el.innerHTML = M.skipped ? "<p>Missie overgeslagen. De rest van de sessie telt gewoon.</p>"
    : `<div class="goal ${fb.goal_met ? "ok" : "no"}">${icon(fb.goal_met ? "check" : "close", 18)} ${fb.goal_met ? "Missie geslaagd!" : "Missie nog niet gehaald"}</div>${fb.goal_note ? `<p class="small">${esc(fb.goal_note)}</p>` : ""}
      <span class="pill ${fb.score >= 4 ? "ok" : "warn"}">${esc(fb.score)}/5</span> <b>${esc(fb.praise)}</b>${(fb.errors || []).length ? `<ul>${fb.errors.map((x) => `<li><s lang="es">${esc(x.said)}</s> → <b lang="es">${esc(x.better)}</b><br><small>${esc(x.why)}</small></li>`).join("")}</ul>` : "<p>Geen fouten. Goed gedaan.</p>"}`;
  const btn = $("checkBtn"); btn.disabled = false; btn.textContent = "Verder"; btn.onclick = next;
}

// ---------- finish ----------
const tally = (list) => ({ ok: list.filter((r) => r.ok).length, total: list.length });
async function finish() {
  const R = S.run; R.finished = true;
  const btn = $("checkBtn"); btn.textContent = "Opslaan…"; btn.disabled = true; btn.onclick = close;
  $("lbar").style.width = "100%"; $("combo").innerHTML = "";
  const minutes = Math.max(1, Math.round(R.active / 6) / 10);
  const correct = R.results.filter((r) => r.ok).length;
  const missed = [...new Set(R.results.filter((r) => !r.ok && r.itemId).map((r) => r.es))];
  if (R.kind !== "session") {
    const xp = correct * 5, t = tally(R.results);
    $("lbody").innerHTML = `<div class="finish"><div class="big display">+${xp} XP</div><p><b>${t.ok} van ${t.total}</b> goed · ${Math.round(minutes)} min</p>${missedHtml(missed)}</div>`;
    await updateToday((d) => { d.minutes += minutes; d.xp += xp; });
    save(() => S.store.addSession(R.kind, { score: t.ok + "/" + t.total, xp, dur: Math.round(R.active), missed }));
    await allSaved();
    btn.textContent = "Terug naar paspoort"; btn.disabled = false;
    return;
  }
  const sch = schedule();
  const quiz = tally(R.results.filter((r) => r.section === "quiz"));
  const grammar = {};
  for (const r of R.results.filter((x) => x.grammarId)) { const g = (grammar[r.grammarId] ||= { ok: 0, total: 0 }); g.total++; if (r.ok) g.ok++; }
  const tests = (R.tests || []).map((w) => { const t = tally(R.results.filter((r) => r.testWeek === w)); return { week: w, ...t, passed: t.total > 0 && t.ok / t.total >= 0.7 }; });
  const M = R.mission, met = M?.fb ? !!M.fb.goal_met : null;
  const xp = correct * 10 + (met ? 50 : 0) + (quiz.total && quiz.ok === quiz.total ? 30 : 0) + tests.filter((t) => t.passed).length * 100;
  const stars = !quiz.total ? 0 : quiz.ok === quiz.total ? 3 : quiz.ok / quiz.total >= 0.6 ? 2 : quiz.ok > 0 ? 1 : 0;
  const row = {
    n: R.n, week: R.week, done_on: todayStr(), on_time: todayStr() <= sch.planned, minutes, xp,
    quiz_ok: quiz.ok, quiz_total: quiz.total, mission_met: met, mission_score: M?.fb?.score ?? null,
    detail: { grammar, tests, missed, review: tally(R.results.filter((r) => r.section === "review")), active: tally(R.results.filter((r) => r.section === "active")), mission: { scenario: M?.scenario, goal: S.sessions[R.n].mission.goal, met, score: M?.fb?.score ?? null, note: M?.fb?.goal_note || null, skipped: !!M?.skipped } },
  };
  $("lbody").innerHTML = `<div class="finish" id="finish">
    <span class="mono">SESSIE ${R.n} KLAAR</span>
    <div class="stars" aria-label="${stars} van 3 sterren">${[0, 1, 2].map((k) => starIcon(k < stars)).join("")}</div>
    <div class="big display">+${xp} XP</div>
    <p>Quiz: <b>${quiz.ok} van ${quiz.total}</b> · ${Math.round(minutes)} min</p>
    <p>${met === null ? "Missie overgeslagen" : met ? "Missie geslaagd" : "Missie nog niet gehaald"}</p>
    ${tests.map((t) => `<div class="test-result ${t.passed ? "ok" : "no"}"><b>Weektoets week ${t.week}: ${t.ok} van ${t.total}</b><span>${t.passed ? `Stempel "${esc(S.weeks.find((w) => w.week === t.week).stamp)}" verdiend!` : "Nog geen 70%. Je doet de toets volgende sessie opnieuw."}</span></div>`).join("")}
    ${missedHtml(missed)}
    <button class="btn ghost wide" id="extraAfter">${icon("flame", 18)} Extra oefenen</button></div>`;
  R.stampWeeks = tests.filter((t) => t.passed).map((t) => t.week);
  S.results = { ...S.results, [row.n]: row };
  ls.del(runKey());
  save(() => S.store.saveResult(row));
  await updateToday((d) => { d.lessons += 1; d.minutes += minutes; d.xp += xp; if (met !== null) d.dialog = true; });
  if (M && M.turns.length > 1) save(() => S.store.addDialog({ scenario: S.scen[M.scenario].title, turns: M.turns, feedback: M.fb ? { ...M.fb, goal: row.detail.mission.goal, session: R.n } : null }));
  save(() => S.store.addSession("session", { n: R.n, title: S.sessions[R.n].title_es, quiz: quiz.ok + "/" + quiz.total, mission: met, tests, xp, dur: Math.round(R.active), missed }));
  await allSaved();
  btn.textContent = "Terug naar paspoort"; btn.disabled = false;
  $("extraAfter").onclick = () => { R.goExtra = true; close(); };
}
const missedHtml = (missed) => missed.length
  ? `<div class="review"><h3 class="mono">NOG EENS OEFENEN</h3><ul>${missed.map((es) => { const it = Object.values(S.items).find((x) => x.es === es); return `<li><b lang="es">${esc(es)}</b><span>${esc(it?.nl || "")}</span></li>`; }).join("")}</ul></div>`
  : '<p class="muted">Alles goed. Niets om te herhalen.</p>';

// ---------- stamp animation ----------
export function showStamp(w, done) {
  const key = "stamped-" + S.uid + "-w" + w;
  if (S.readonly || ls.get(key)) { done?.(); return; }
  ls.set(key, "1");
  const week = S.weeks.find((x) => x.week === w), ov = $("stampOverlay");
  ov.innerHTML = `<div class="big-stamp"><span class="mono">SEMANA ${w}</span><b class="display">${esc(week.stamp)}</b><span class="mono">${stampDate(todayStr())}</span></div><p class="display">Week ${w} gestempeld!</p><button class="btn" id="stampOk">Verder</button>`;
  ov.hidden = false;
  $("stampOk").onclick = () => { ov.hidden = true; done?.(); };
}
