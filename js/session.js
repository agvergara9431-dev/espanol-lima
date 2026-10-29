// The full session (review, new phrases, grammar, active practice, mission, closing quiz, weekly test),
// plus the optional review and "Extra oefenen". One runner plays a list of steps; progress is kept in
// localStorage so she can continue later, but a session only counts once it is finished.
import { icon, starIcon } from "./icons.js";
import { t, tr, trEx, L, grammarIn, getLang } from "./i18n.js";
import {
  $, esc, S, todayStr, shuffle, norm, closeEnough, similarity, hasEs, speak, voicesReady, Recognition, canRecord,
  itemsUpTo, weekSessions, testsFor, schedule, updateCard, updateToday, save, allSaved, ls, stampDate,
} from "./core.js";

const SECTION = { review: "sec.review", new: "sec.new", grammar: "sec.grammar", active: "sec.active", mission: "sec.mission", quiz: "sec.quiz", test: "sec.test", extra: "sec.extra" };
const MAX_MSG = 300;
let onClose = () => {};
export const setOnClose = (fn) => (onClose = fn);
const runKey = () => "run-" + S.uid;

// ---------- building exercises (texts are resolved when shown, so a language switch applies everywhere) ----------
const sayBtn = (text, label = t("ex.listenBtn")) => (hasEs() ? `<button class="speak" data-say="${esc(text)}">${icon("speaker", 20)}${esc(label)}</button>` : "");
function itemEx(item, kind, section, pool) {
  const words = item.es.split(" ");
  if (kind === "listen" && !hasEs()) kind = "type";
  if (kind === "speak" && !Recognition && !canRecord()) kind = "type";
  if (kind === "order" && words.length < 3) kind = "type";
  const others = shuffle(pool.filter((x) => x.id !== item.id)).slice(0, 3);
  const base = { section, itemId: item.id, es: item.es };
  if (kind === "mc_es") return { ...base, k: "mc", q: "ex.meaning", prompt: item.es, lang: "es", say: item.es, opts: shuffle([item, ...others].map((o) => tr(o))), answer: tr(item) };
  if (kind === "mc_nl") return { ...base, k: "mc", q: "ex.toEs", promptItem: item.id, opts: shuffle([item.es, ...others.map((o) => o.es)]), answer: item.es };
  if (kind === "order") { const extra = shuffle(others.flatMap((o) => o.es.split(" "))).filter((w) => !words.map(norm).includes(norm(w))).slice(0, 2); return { ...base, k: "order", q: "ex.order", promptItem: item.id, tokens: shuffle([...words, ...extra]), answer: item.es }; }
  if (kind === "listen") return { ...base, k: "listen", q: "ex.listen", answer: item.es, say: item.es };
  if (kind === "speak") return { ...base, k: "speak", q: "ex.speak", prompt: item.es, lang: "es", say: item.es, answer: item.es };
  return { ...base, k: "type", q: "ex.write", promptItem: item.id, answer: item.es, alt: [] };
}
function grammarEx(g0, ex, section) {
  const g = grammarIn(g0);
  const base = { section, grammarId: g.id, qText: ex.q, why: ex.why };
  if (ex.type === "mc") return { ...base, k: "mc", prompt: ex.prompt, opts: shuffle(ex.opts), answer: ex.answer };
  if (ex.type === "fill") return { ...base, k: "mc", prompt: ex.prompt, blank: true, lang: "es", opts: shuffle(ex.opts), answer: ex.answer };
  if (ex.type === "order") return { ...base, k: "order", prompt: ex.prompt, tokens: shuffle(ex.answer.split(" ")), answer: ex.answer };
  return { ...base, k: "type", prompt: ex.prompt, answer: ex.answer, alt: ex.alt || [] };
}
// Review: what is due, the missed ones first.
function dueItems(n, max) {
  const td = todayStr();
  return itemsUpTo(n).filter((it) => S.cards[it.id] && S.cards[it.id].due <= td)
    .sort((a, b) => { const A = S.cards[a.id], B = S.cards[b.id]; return (A.box - B.box) || (B.ko - A.ko) || A.due.localeCompare(B.due); })
    .slice(0, max);
}

export function buildSession(n) {
  const sess = S.sessions[n], pool = itemsUpTo(n), g = grammarIn(sess.grammar);
  const steps = [];
  const review = dueItems(n - 1, 12);
  if (review.length) {
    steps.push({ t: "intro", section: "review", title: "sec.review", text: ["intro.review", { n: review.length }] });
    review.forEach((it, i) => steps.push({ t: "ex", ex: itemEx(it, ["mc_es", "mc_nl", "type"][i % 3], "review", pool) }));
  }
  steps.push({ t: "intro", section: "new", title: "sec.new", text: ["intro.new", { n: sess.items.length }] });
  sess.items.forEach((it) => steps.push({ t: "phrase", item: it }));
  steps.push({ t: "grammar", g: sess.grammar });
  shuffle(g.exercises).forEach((ex) => steps.push({ t: "ex", ex: grammarEx(sess.grammar, ex, "grammar") }));
  steps.push({ t: "intro", section: "active", title: "intro.active.title", text: ["intro.active", {}] });
  const kinds = ["type", "order", "listen", "speak"];
  shuffle(sess.items).forEach((it, i) => steps.push({ t: "ex", ex: itemEx(it, kinds[i % kinds.length], "active", pool) }));
  steps.push({ t: "mission", m: sess.mission, week: sess.week, n });
  steps.push({ t: "intro", section: "quiz", title: "sec.quiz", text: ["intro.quiz", {}] });
  shuffle(sess.items).slice(0, 4).forEach((it, i) => steps.push({ t: "ex", ex: itemEx(it, i % 2 ? "type" : "mc_nl", "quiz", pool) }));
  steps.push({ t: "ex", ex: grammarEx(sess.grammar, shuffle(g.exercises)[0], "quiz") });
  for (const w of testsFor(n)) {
    const ws = weekSessions(w).filter((s) => s.items?.length);
    const items = shuffle(ws.flatMap((s) => s.items)).slice(0, 8);
    const gs = shuffle(ws.flatMap((s) => grammarIn(s.grammar).exercises.map((ex) => [s.grammar, ex]))).slice(0, 2);
    const week = S.weeks.find((x) => x.week === w);
    steps.push({ t: "intro", section: "test", title: ["intro.test.title", { w }], text: ["intro.test", { w, stamp: week.stamp }] });
    items.forEach((it, i) => steps.push({ t: "ex", ex: { ...itemEx(it, ["mc_nl", "type", "mc_es"][i % 3], "test", pool), testWeek: w } }));
    gs.forEach(([gr, ex]) => steps.push({ t: "ex", ex: { ...grammarEx(gr, ex, "test"), testWeek: w } }));
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
  const words = (weak.length >= 3 ? weak : shuffle(pool)).slice(0, 10).map((it) => ({ es: it.es, nl: tr(it) }));
  const { exercises } = await S.store.ai("/extra", { words, lang: getLang() });
  const byEs = Object.fromEntries(pool.map((it) => [norm(it.es), it]));
  const steps = exercises.map((ex) => {
    const it = byEs[norm(ex.word || "")];
    const e = ex.type === "type" ? { k: "type", prompt: ex.prompt, answer: ex.answer, alt: ex.alt || [] }
      : { k: "mc", prompt: ex.prompt, blank: ex.type === "fill", opts: shuffle(ex.opts.includes(ex.answer) ? ex.opts : [ex.answer, ...ex.opts].slice(0, 4)), answer: ex.answer };
    return { t: "ex", ex: { ...e, section: "extra", qText: ex.q, why: ex.why, itemId: it?.id, es: it?.es } };
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
  $("quitBtn").setAttribute("aria-label", t("quit.label"));
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
    $("verdict").innerHTML = `${esc(t(R.kind === "session" ? "quit.session" : "quit.other"))}<small>${esc(t("quit.again"))}</small>`;
    return;
  }
  persist(); close();
};
const txt = (v) => (Array.isArray(v) ? t(v[0], v[1]) : t(v));

function render() {
  const R = S.run, step = R.steps[R.i];
  R.quit = false; R.answered = false; R.sel = null; R.built = [];
  $("lbar").style.width = (R.i / (R.steps.length - 1)) * 100 + "%";
  const sec = step.ex?.section || step.section || (step.t === "phrase" ? "new" : step.t === "grammar" ? "grammar" : step.t);
  $("lessonTitle").textContent = step.t === "finish" || !SECTION[sec] ? "" : t(SECTION[sec]);
  $("lfoot").className = "lfoot"; $("verdict").hidden = true; $("lfoot").hidden = false;
  const btn = $("checkBtn"); btn.disabled = false; btn.textContent = t("btn.next"); btn.onclick = next;
  const b = $("lbody"); b.scrollTop = 0;
  if (S.store?.mode === "mock") window.__step = () => S.run?.steps[S.run.i]; // test hook, localhost mock only
  if (step.t === "intro") b.innerHTML = `<div class="intro"><span class="mono">${esc(t(SECTION[step.section]))}</span><h2 class="display">${esc(txt(step.title))}</h2><p>${esc(txt(step.text))}</p></div>`;
  if (step.t === "phrase") {
    const it = step.item;
    b.innerHTML = `<div class="phrase"><div class="prompt display" lang="es">${esc(it.es)}</div>${sayBtn(it.es)}<p class="nl">${esc(tr(it))}</p>
      ${it.ex ? `<div class="example"><span class="mono">${esc(t("ex.exampleLabel"))}</span><p lang="es"><b>${esc(it.ex.es)}</b></p><p class="muted">${esc(trEx(it.ex))}</p>${sayBtn(it.ex.es, t("ex.example"))}</div>` : ""}</div>`;
    setTimeout(() => speak(it.es), 250);
  }
  if (step.t === "grammar") {
    const g = grammarIn(step.g);
    b.innerHTML = `<div class="grammar"><span class="mono">${esc(t("grammar.label"))}</span><h2 class="display">${esc(g.title)}</h2>${g.explain.map((p) => `<p>${esc(p)}</p>`).join("")}
      <div class="compare"><span class="mono">${esc(t("grammar.compare"))}</span><p>${esc(g.compare)}</p></div>
      <ul class="examples">${g.examples.map((x) => `<li><b lang="es">${esc(x.es)}</b><span>${esc(x.en && getLang() === "en" ? x.en : x.nl)}</span></li>`).join("")}</ul></div>`;
    btn.textContent = t("btn.toExercises");
  }
  if (step.t === "ex") renderEx(step.ex);
  if (step.t === "mission") renderMission(step);
  if (step.t === "finish") finish();
}
function next() { const R = S.run; R.i++; persist(); render(); }

function renderEx(e) {
  const R = S.run, b = $("lbody"), btn = $("checkBtn");
  btn.textContent = t("btn.check"); btn.disabled = true; btn.onclick = check;
  const prompt = e.promptItem ? tr(S.items[e.promptItem]) : e.prompt;
  let h = `<div class="kind mono">${esc(e.q ? t(e.q) : e.qText || "")}</div>`;
  const opts = () => `<div class="opts">${e.opts.map((o, i) => `<button class="opt" data-o="${i}" ${e.blank || /[áéíóúñ¿¡]/i.test(o) ? 'lang="es"' : ""}>${esc(o)}</button>`).join("")}</div>`;
  const input = `<input class="ans" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="es" placeholder="${esc(t("ex.placeholder"))}">`;
  const pr = prompt ? `<div class="prompt display" ${e.lang === "es" ? 'lang="es"' : ""}>${e.blank ? esc(prompt).replace("___", '<span class="blank"></span>') : esc(prompt)}</div>` : "";
  if (e.k === "mc") h += pr + (e.say ? sayBtn(e.say) : "") + opts();
  if (e.k === "order") h += `${pr}<div class="built" id="built" lang="es"></div><div class="bank" lang="es">${e.tokens.map((tk, i) => `<button class="tok" data-t="${i}">${esc(tk)}</button>`).join("")}</div>`;
  if (e.k === "type") h += pr + input;
  if (e.k === "listen") h += `${sayBtn(e.say, t("ex.listenAgain"))}${input}`;
  if (e.k === "speak") h += `${pr}<p class="muted">${esc(e.itemId ? tr(S.items[e.itemId]) : "")}</p>${sayBtn(e.say, t("ex.listenFirst"))}<div id="speakArea"></div>`;
  b.innerHTML = h;
  if (e.k === "listen") setTimeout(() => speak(e.say), 300);
  b.querySelectorAll(".opt").forEach((o) => (o.onclick = () => { if (R.answered) return; b.querySelectorAll(".opt").forEach((x) => x.classList.remove("sel")); o.classList.add("sel"); R.sel = e.opts[o.dataset.o]; btn.disabled = false; }));
  b.querySelectorAll(".tok").forEach((tk) => (tk.onclick = () => { if (R.answered) return; tk.classList.add("used"); R.built.push({ w: e.tokens[tk.dataset.t], el: tk }); renderBuilt(); }));
  const a = $("ans");
  if (a) { a.oninput = () => (btn.disabled = !a.value.trim()); a.onkeydown = (ev) => { if (ev.key === "Enter" && !btn.disabled) btn.click(); }; a.focus(); }
  if (e.k === "speak") { $("lfoot").hidden = true; renderSpeak(e); }
}
function renderBuilt() {
  const R = S.run, bb = $("built");
  bb.innerHTML = R.built.map((x, i) => `<button class="tok" data-b="${i}">${esc(x.w)}</button>`).join("");
  bb.querySelectorAll("[data-b]").forEach((tk) => (tk.onclick = () => { if (R.answered) return; const x = R.built.splice(+tk.dataset.b, 1)[0]; x.el.classList.remove("used"); renderBuilt(); }));
  $("checkBtn").disabled = !R.built.length;
}
function check() {
  const R = S.run, e = R.steps[R.i].ex;
  const given = e.k === "order" ? R.built.map((x) => x.w).join(" ") : e.k === "type" || e.k === "listen" ? $("ans").value : R.sel;
  // Typed answers forgive accents and small typos; picked options must be exact, because some differ only by an
  // accent (tomo / tomó). Word order compares the words, ignoring punctuation.
  const ok = e.k === "type" || e.k === "listen" ? closeEnough(given, [e.answer, ...(e.alt || [])]) : e.k === "mc" ? given === e.answer : norm(given) === norm(e.answer);
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
  const meaning = item ? tr(item) : "";
  const fix = e.k === "mc" && e.lang === "es" && !e.blank ? esc(e.answer) : `<span lang="es">${esc(e.answer)}</span>${meaning && e.k !== "mc" ? " · " + esc(meaning) : ""}`;
  $("verdict").innerHTML = (ok ? esc(t("ex.good")) : `${esc(t("ex.almost"))}<small>${fix}</small>`) + (e.why ? `<small class="why">${esc(e.why)}</small>` : "") + (heard ? `<small>${esc(t("ex.heard", { text: heard }))}</small>` : "");
  $("lbody").querySelectorAll(".opt").forEach((o) => { const v = e.opts[o.dataset.o]; if (v === e.answer) o.classList.add("right"); else if (o.classList.contains("sel")) o.classList.add("wrong"); });
  if (!ok && e.es) speak(e.es);
  const btn = $("checkBtn"); btn.disabled = false; btn.textContent = t("btn.next"); btn.onclick = next;
  persist(1);
}

// ---------- speaking ----------
function renderSpeak(e) {
  const area = $("speakArea");
  if (Recognition) {
    area.innerHTML = `<button class="btn wide" id="recBtn">${icon("mic", 20)} ${esc(t("speak.rec"))}</button><p class="status" id="recStatus"></p><button class="link small" id="skipSpeak">${esc(t("speak.skip"))}</button>`;
    $("recBtn").onclick = () => {
      const rec = new Recognition();
      rec.lang = "es-PE"; rec.interimResults = false; rec.maxAlternatives = 3;
      $("recBtn").disabled = true; $("recStatus").textContent = t("speak.listening");
      rec.onresult = (ev) => {
        const alts = Array.from(ev.results[0]).map((a) => a.transcript);
        const best = alts.reduce((a, b) => (similarity(b, e.answer) > similarity(a, e.answer) ? b : a), alts[0] || "");
        answered(similarity(best, e.answer) >= 0.7, best, best);
      };
      rec.onerror = () => { $("recBtn").disabled = false; $("recStatus").textContent = t("speak.retry"); };
      rec.onend = () => { if (!S.run?.answered) $("recBtn").disabled = false; };
      try { rec.start(); } catch { $("recBtn").disabled = false; }
    };
  } else {
    area.innerHTML = `<button class="btn wide" id="recBtn">${icon("mic", 20)} ${esc(t("speak.record"))}</button><div id="cmp" hidden><p>${esc(t("speak.compare"))}</p><div class="row"><button class="btn ghost" id="playMe">${icon("speaker", 18)} ${esc(t("speak.mine"))}</button>${sayBtn(e.say, t("speak.original"))}</div><div class="row"><button class="btn" id="rateOk">${esc(t("speak.ok"))}</button><button class="btn ghost" id="rateNo">${esc(t("speak.no"))}</button></div></div><button class="link small" id="skipSpeak">${esc(t("speak.skip"))}</button>`;
    let rec = null, chunks = [], url = null;
    $("recBtn").onclick = async () => {
      if (rec && rec.state === "recording") { rec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream); chunks = [];
        rec.ondataavailable = (ev) => chunks.push(ev.data);
        rec.onstop = () => { stream.getTracks().forEach((tr2) => tr2.stop()); url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })); $("cmp").hidden = false; $("recBtn").innerHTML = `${icon("mic", 20)} ${esc(t("speak.again"))}`; };
        rec.start(); $("recBtn").innerHTML = `${icon("mic", 20)} ${esc(t("speak.stop"))}`;
      } catch { $("recBtn").disabled = true; $("recBtn").textContent = t("speak.noMic"); }
    };
    area.addEventListener("click", (ev) => { if (ev.target.closest("#playMe") && url) new Audio(url).play(); });
    $("rateOk").onclick = () => answered(true);
    $("rateNo").onclick = () => answered(false);
  }
  $("skipSpeak").onclick = () => { const R = S.run; R.answered = true; $("lfoot").hidden = false; next(); };
}

// ---------- mission ----------
function renderMission(step) {
  const R = S.run, sc = S.scen[step.m.scenario], m = step.m;
  R.mission = R.mission || { scenario: step.m.scenario, turns: [{ role: "assistant", content: sc.opener }], fb: null };
  const btn = $("checkBtn"); btn.textContent = t("mission.finish"); btn.onclick = endMission;
  $("lbody").innerHTML = `<div class="mission-card"><span class="mono">${esc(t("mission.label", { who: L(sc, "title") }))}</span><p><b>${esc(L(m, "goal"))}</b></p><p class="muted small">${esc(t("mission.hint", { desc: L(sc, "desc") }))}</p></div>
    <div class="chat" id="chat" aria-live="polite"></div>
    <form class="chat-form" id="chatForm"><input class="chatin" id="chatInput" maxlength="${MAX_MSG}" placeholder="${esc(t("chat.placeholder"))}" autocomplete="off" lang="es"><button class="btn" id="sendBtn" aria-label="${esc(t("btn.send"))}">${icon("send", 20)}</button></form>
    <p class="status" id="chatStatus"></p><div id="feedback" class="feedback" hidden></div>`;
  $("chatForm").onsubmit = (ev) => { ev.preventDefault(); sendMsg(step); };
  btn.disabled = !R.mission.turns.some((x) => x.role === "user");
  renderChat();
  if (R.mission.turns.length === 1) speak(sc.opener);
  if (R.mission.fb || R.mission.skipped) showMissionResult();
}
function renderChat(pending) {
  const R = S.run, sc = S.scen[R.mission.scenario];
  $("chat").innerHTML = R.mission.turns.map((x) => `<div class="msg ${x.role === "user" ? "me" : "them"}"><span class="who mono">${esc(x.role === "user" ? t("chat.you") : L(sc, "title"))}</span><span lang="es">${esc(x.content)}</span>${x.role === "assistant" ? sayBtn(x.content, "") : ""}</div>`).join("") + (pending ? '<div class="msg them typing"><span></span><span></span><span></span></div>' : "");
  $("chat").lastElementChild?.scrollIntoView({ block: "nearest" });
}
const aiError = (e) => t(e.code === "limit" ? "ai.limit" : e.code === "forbidden" ? "ai.forbidden" : "ai.fail");
async function sendMsg(step) {
  const R = S.run, M = R.mission, inp = $("chatInput"), v = inp.value.trim().slice(0, MAX_MSG);
  if (!v || M.busy || M.fb) return;
  inp.value = ""; M.turns.push({ role: "user", content: v }); M.busy = true; renderChat(true); $("sendBtn").disabled = true; $("chatStatus").textContent = "";
  try { const { text } = await S.store.ai("/dialog", { week: step.week, session: step.n, turns: M.turns }); M.turns.push({ role: "assistant", content: text }); renderChat(); speak(text); }
  catch (e) { M.turns.pop(); inp.value = v; renderChat(); $("chatStatus").innerHTML = `${esc(aiError(e))} <button class="link small" id="skipMission">${esc(t("mission.skip"))}</button>`; $("skipMission").onclick = skipMission; }
  M.busy = false; $("sendBtn").disabled = false; $("checkBtn").disabled = !M.turns.some((x) => x.role === "user"); persist(); inp.focus();
}
async function endMission() {
  const R = S.run, M = R.mission, step = R.steps[R.i];
  $("checkBtn").disabled = true; $("chatStatus").textContent = t("mission.checking");
  try { M.fb = await S.store.ai("/feedback", { week: step.week, session: step.n, turns: M.turns, lang: getLang() }); $("chatStatus").textContent = ""; showMissionResult(); }
  catch (e) { $("checkBtn").disabled = false; $("chatStatus").innerHTML = `${esc(aiError(e))} <button class="link small" id="skipMission">${esc(t("mission.skip"))}</button>`; $("skipMission").onclick = skipMission; }
  persist();
}
function skipMission() { const R = S.run; R.mission.skipped = true; showMissionResult(); persist(); }
function showMissionResult() {
  const M = S.run.mission, fb = M.fb, el = $("feedback");
  $("chatForm").hidden = true; el.hidden = false;
  el.innerHTML = M.skipped ? `<p>${esc(t("mission.skipped"))}</p>`
    : `<div class="goal ${fb.goal_met ? "ok" : "no"}">${icon(fb.goal_met ? "check" : "close", 18)} ${esc(t(fb.goal_met ? "mission.ok" : "mission.no"))}</div>${fb.goal_note ? `<p class="small">${esc(fb.goal_note)}</p>` : ""}
      <span class="pill ${fb.score >= 4 ? "ok" : "warn"}">${esc(fb.score)}/5</span> <b>${esc(fb.praise)}</b>${(fb.errors || []).length ? `<ul>${fb.errors.map((x) => `<li><s lang="es">${esc(x.said)}</s> → <b lang="es">${esc(x.better)}</b><br><small>${esc(x.why)}</small></li>`).join("")}</ul>` : `<p>${esc(t("mission.noErrors"))}</p>`}`;
  const btn = $("checkBtn"); btn.disabled = false; btn.textContent = t("btn.next"); btn.onclick = next;
}

// ---------- finish ----------
const tally = (list) => ({ ok: list.filter((r) => r.ok).length, total: list.length });
async function finish() {
  const R = S.run; R.finished = true;
  const btn = $("checkBtn"); btn.textContent = t("btn.saving"); btn.disabled = true; btn.onclick = close;
  $("lbar").style.width = "100%"; $("combo").innerHTML = "";
  const minutes = Math.max(1, Math.round(R.active / 6) / 10);
  const correct = R.results.filter((r) => r.ok).length;
  const missed = [...new Set(R.results.filter((r) => !r.ok && r.itemId).map((r) => r.es))];
  if (R.kind !== "session") {
    const xp = correct * 5, tl = tally(R.results);
    $("lbody").innerHTML = `<div class="finish"><div class="big display">+${xp} XP</div><p>${esc(t("finish.score", { ok: tl.ok, total: tl.total, min: Math.round(minutes) }))}</p>${missedHtml(missed)}</div>`;
    await updateToday((d) => { d.minutes += minutes; d.xp += xp; });
    save(() => S.store.addSession(R.kind, { score: tl.ok + "/" + tl.total, xp, dur: Math.round(R.active), missed }));
    await allSaved();
    btn.textContent = t("btn.home"); btn.disabled = false;
    return;
  }
  const sch = schedule();
  const quiz = tally(R.results.filter((r) => r.section === "quiz"));
  const grammar = {};
  for (const r of R.results.filter((x) => x.grammarId)) { const g = (grammar[r.grammarId] ||= { ok: 0, total: 0 }); g.total++; if (r.ok) g.ok++; }
  const tests = (R.tests || []).map((w) => { const tl = tally(R.results.filter((r) => r.testWeek === w)); return { week: w, ...tl, passed: tl.total > 0 && tl.ok / tl.total >= 0.7 }; });
  const M = R.mission, met = M?.fb ? !!M.fb.goal_met : null;
  const xp = correct * 10 + (met ? 50 : 0) + (quiz.total && quiz.ok === quiz.total ? 30 : 0) + tests.filter((x) => x.passed).length * 100;
  const stars = !quiz.total ? 0 : quiz.ok === quiz.total ? 3 : quiz.ok / quiz.total >= 0.6 ? 2 : quiz.ok > 0 ? 1 : 0;
  const row = {
    n: R.n, week: R.week, done_on: todayStr(), on_time: todayStr() <= sch.planned, minutes, xp,
    quiz_ok: quiz.ok, quiz_total: quiz.total, mission_met: met, mission_score: M?.fb?.score ?? null,
    detail: { grammar, tests, missed, review: tally(R.results.filter((r) => r.section === "review")), active: tally(R.results.filter((r) => r.section === "active")), mission: { scenario: M?.scenario, goal: S.sessions[R.n].mission.goal, met, score: M?.fb?.score ?? null, note: M?.fb?.goal_note || null, skipped: !!M?.skipped } },
  };
  $("lbody").innerHTML = `<div class="finish" id="finish">
    <span class="mono">${esc(t("finish.done", { n: R.n }))}</span>
    <div class="stars" aria-label="${esc(t("finish.stars", { n: stars }))}">${[0, 1, 2].map((k) => starIcon(k < stars)).join("")}</div>
    <div class="big display">+${xp} XP</div>
    <p>${esc(t("finish.quiz", { ok: quiz.ok, total: quiz.total, min: Math.round(minutes) }))}</p>
    <p>${esc(t(met === null ? "finish.missionSkipped" : met ? "mission.ok" : "mission.no"))}</p>
    ${tests.map((x) => `<div class="test-result ${x.passed ? "ok" : "no"}"><b>${esc(t("finish.test", { w: x.week, ok: x.ok, total: x.total }))}</b><span>${esc(x.passed ? t("finish.stamp", { stamp: S.weeks.find((w) => w.week === x.week).stamp }) : t("finish.retry"))}</span></div>`).join("")}
    ${missedHtml(missed)}
    <button class="btn ghost wide" id="extraAfter">${icon("flame", 18)} ${esc(t("home.extra"))}</button></div>`;
  R.stampWeeks = tests.filter((x) => x.passed).map((x) => x.week);
  S.results = { ...S.results, [row.n]: row };
  ls.del(runKey());
  save(() => S.store.saveResult(row));
  await updateToday((d) => { d.lessons += 1; d.minutes += minutes; d.xp += xp; if (met !== null) d.dialog = true; });
  if (M && M.turns.length > 1) save(() => S.store.addDialog({ scenario: S.scen[M.scenario].title, turns: M.turns, feedback: M.fb ? { ...M.fb, goal: row.detail.mission.goal, session: R.n } : null }));
  save(() => S.store.addSession("session", { n: R.n, title: S.sessions[R.n].title_es, quiz: quiz.ok + "/" + quiz.total, mission: met, tests, xp, dur: Math.round(R.active), missed }));
  await allSaved();
  btn.textContent = t("btn.home"); btn.disabled = false;
  $("extraAfter").onclick = () => { R.goExtra = true; close(); };
}
const missedHtml = (missed) => missed.length
  ? `<div class="review"><h3 class="mono">${esc(t("finish.review"))}</h3><ul>${missed.map((es) => { const it = Object.values(S.items).find((x) => x.es === es); return `<li><b lang="es">${esc(es)}</b><span>${esc(it ? tr(it) : "")}</span></li>`; }).join("")}</ul></div>`
  : `<p class="muted">${esc(t("finish.allGood"))}</p>`;

// ---------- stamp animation ----------
export function showStamp(w, done) {
  const key = "stamped-" + S.uid + "-w" + w;
  if (S.readonly || ls.get(key)) { done?.(); return; }
  ls.set(key, "1");
  const week = S.weeks.find((x) => x.week === w), ov = $("stampOverlay");
  ov.innerHTML = `<div class="big-stamp"><span class="mono">SEMANA ${w}</span><b class="display">${esc(week.stamp)}</b><span class="mono">${stampDate(todayStr())}</span></div><p class="display">${esc(t("stamp.big", { w }))}</p><button class="btn" id="stampOk">${esc(t("btn.next"))}</button>`;
  ov.hidden = false;
  $("stampOk").onclick = () => { ov.hidden = true; done?.(); };
}
