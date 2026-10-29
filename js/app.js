// App shell: boot, navigation, Woorden, free Gesprek, and wiring between home, sessions and the panel.
import { createStore } from "./store.js";
import { icon } from "./icons.js";
import {
  $, esc, S, isOwner, schedule, itemsUpTo, loadContent, loadUser, voicesReady, pickVoice, hasEs, speak, status, updateToday, save, allSaved, weekPassed,
} from "./core.js";
import { buildSession, buildReview, buildExtra, start, savedRun, setOnClose, showStamp } from "./session.js";
import { renderHome, renderPassport, actions } from "./home.js";
import { renderPanel, panelActions } from "./panel.js";
import { renderLogin } from "./login.js";

const MAX_MSG = 300;

// ---------- navigation ----------
function tabs() {
  const list = [["home", "route", "Route"], ["passport", "passport", "Paspoort"], ["chat", "chat", "Gesprek"], ["words", "words", "Woorden"]];
  if (isOwner() && !S.readonly) list.push(["panel", "panel", "Panel"]);
  $("nav").innerHTML = list.map(([k, ic, label]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${icon(ic)}${label}</button>`).join("");
}
function show(tab) {
  S.tab = tab;
  for (const k of ["home", "passport", "chat", "words", "panel"]) $("tab-" + k).hidden = k !== tab;
  tabs();
  if (tab === "home") renderHome();
  if (tab === "passport") renderPassport();
  if (tab === "chat") renderChatTab();
  if (tab === "words") renderWords();
  if (tab === "panel") renderPanel();
  scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]"); if (t && t.closest("#nav")) show(t.dataset.tab);
  const s = e.target.closest("[data-say]"); if (s) speak(s.dataset.say);
});

// ---------- starting things ----------
const doneUpTo = () => Math.max(1, schedule().next - 1);
actions.session = () => {
  const sch = schedule();
  if (sch.state !== "due" || S.readonly) return;
  const saved = savedRun();
  start(saved || buildSession(sch.next), !!saved);
};
actions.review = () => start(buildReview(doneUpTo()));
actions.extra = async () => {
  status("Oefeningen maken…");
  try { const run = await buildExtra(doneUpTo()); status(""); start(run); }
  catch (e) { status(e.code === "limit" ? "Je hebt het maximum voor vandaag bereikt. Morgen kan het weer." : "Extra oefeningen lukten nu niet. Probeer het zo nog eens."); }
};
actions.passport = () => show("passport");
actions.backToOwner = async () => { S.readonly = false; await loadUser(S.store.me.id); show("panel"); };
panelActions.viewAs = async () => {
  if (!S.store.learnerId) { status("Claire todavía no ha entrado nunca."); return; }
  S.readonly = true; await loadUser(S.store.learnerId); show("home");
};
panelActions.logout = async () => { await S.store.signOut(); location.reload(); };
setOnClose((R) => {
  show(S.tab === "panel" ? "panel" : S.tab);
  const stamps = [...(R?.stampWeeks || [])];
  const nextStamp = () => { const w = stamps.shift(); if (w) showStamp(w, nextStamp); else if (R?.goExtra) actions.extra(); else if (S.tab === "home") renderHome(); };
  nextStamp();
});

// ---------- words ----------
function renderWords() {
  const n = doneUpTo();
  const sessions = Object.values(S.sessions).filter((s) => s.n <= n && s.items?.length).sort((a, b) => b.n - a.n);
  $("tab-words").innerHTML = `<div class="page">
    <h2 class="display">Woorden</h2>
    <p class="muted">Alles wat je al geleerd hebt. Een rood streepje is een zwak woord, groen ken je goed.</p>
    <div class="stack"><button class="btn wide" id="wReview">${icon("words", 18)} Herhalen</button><button class="btn ghost wide" id="wExtra">${icon("flame", 18)} Extra oefenen met mijn zwakke woorden</button></div>
    ${sessions.map((s) => `<h3 class="mono">SESSIE ${s.n} · ${esc(s.title.toUpperCase())}</h3><ul class="vocab">${s.items.map((it) => {
      const c = S.cards[it.id]; const lvl = !c ? "" : c.box >= 3 ? "strong" : c.ko > 0 && c.box <= 1 ? "weak" : "";
      return `<li class="${lvl}"><div><b lang="es">${esc(it.es)}</b><small>${esc(it.nl)}</small>${it.ex ? `<small class="ex" lang="es">${esc(it.ex.es)}</small>` : ""}</div>${hasEs() ? `<button class="icon-btn" data-say="${esc(it.es)}" aria-label="Luisteren">${icon("speaker", 20)}</button>` : ""}</li>`;
    }).join("")}</ul>`).join("")}</div>`;
  $("wReview").onclick = actions.review;
  $("wExtra").onclick = actions.extra;
}

// ---------- free dialog (Gesprek) ----------
function renderChatTab() {
  if (S.chat) return;
  const wk = S.sessions[Math.min(schedule().next, 24)]?.week || 1;
  const list = Object.values(S.scen).filter((s) => s.week <= wk);
  $("tab-chat").innerHTML = `<div class="page">
    <h2 class="display">Gesprek</h2>
    <p class="muted">Vrij oefenen, zonder opdracht. Schrijf in het Spaans, ook met fouten. Aan het eind krijg je correcties.</p>
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
    <div class="chat" id="fchat" aria-live="polite"></div>
    <form class="chat-form" id="fchatForm"><input class="chatin" id="fchatInput" maxlength="${MAX_MSG}" placeholder="Schrijf in het Spaans..." autocomplete="off" lang="es"><button class="btn" id="fsendBtn" aria-label="Sturen">${icon("send", 20)}</button></form>
    <div class="row"><button class="btn ghost" id="fendBtn">Stoppen en correcties zien</button><span class="status" id="fchatStatus"></span></div>
    <div id="ffeedback" class="feedback" hidden></div></div>`;
  $("chatBack").onclick = () => { S.chat = null; renderChatTab(); };
  $("fchatForm").onsubmit = (e) => { e.preventDefault(); sendFree(); };
  $("fendBtn").onclick = endFree;
  renderFree(); speak(sc.opener);
}
function renderFree(pending) {
  const sc = S.scen[S.chat.key];
  $("fchat").innerHTML = S.chat.turns.map((t) => `<div class="msg ${t.role === "user" ? "me" : "them"}"><span class="who mono">${t.role === "user" ? "JIJ" : esc(sc.title.toUpperCase())}</span><span lang="es">${esc(t.content)}</span></div>`).join("") + (pending ? '<div class="msg them typing"><span></span><span></span><span></span></div>' : "");
  $("fchat").lastElementChild?.scrollIntoView({ block: "nearest" });
}
async function sendFree() {
  const c = S.chat, inp = $("fchatInput"), v = inp.value.trim().slice(0, MAX_MSG);
  if (!v || c.ended || c.busy) return;
  inp.value = ""; c.turns.push({ role: "user", content: v }); c.busy = true; renderFree(true); $("fsendBtn").disabled = true;
  try { const { text } = await S.store.ai("/dialog", { week: c.week, scenario: c.key, turns: c.turns }); c.turns.push({ role: "assistant", content: text }); renderFree(); speak(text); }
  catch { c.turns.pop(); inp.value = v; renderFree(); $("fchatStatus").textContent = "Geen antwoord ontvangen. Probeer het nog eens."; }
  c.busy = false; $("fsendBtn").disabled = false;
}
async function endFree() {
  const c = S.chat, mine = c.turns.filter((t) => t.role === "user");
  if (!mine.length) { $("fchatStatus").textContent = "Schrijf eerst minstens één bericht."; return; }
  c.ended = true; $("fendBtn").disabled = true; $("fchatStatus").textContent = "Correcties ophalen…";
  let fb = null;
  try { fb = await S.store.ai("/feedback", { week: c.week, scenario: c.key, turns: c.turns }); $("fchatStatus").textContent = ""; }
  catch { $("fchatStatus").textContent = "Correcties lukten niet. Het gesprek telt wel."; }
  $("ffeedback").hidden = false;
  $("ffeedback").innerHTML = (fb ? `<span class="pill ${fb.score >= 4 ? "ok" : "warn"}">${esc(fb.score)}/5</span> <b>${esc(fb.praise)}</b>${(fb.errors || []).length ? `<ul>${fb.errors.map((x) => `<li><s lang="es">${esc(x.said)}</s> → <b lang="es">${esc(x.better)}</b><br><small>${esc(x.why)}</small></li>`).join("")}</ul>` : "<p>Geen fouten. Goed gedaan.</p>"}` : "") + '<button class="btn wide" id="fchatDone">Klaar</button>';
  $("fchatDone").disabled = true;
  const sec = Math.round((Date.now() - c.started) / 1000), sc = S.scen[c.key];
  await updateToday((d) => { d.minutes += Math.min(sec, 1800) / 60; d.xp += 20 + mine.length * 5; });
  save(() => S.store.addDialog({ scenario: sc.title, turns: c.turns, feedback: fb }));
  save(() => S.store.addSession("dialog", { scenario: sc.title, score: fb ? fb.score + "/5" : "", dur: sec, turns: mine.length, xp: 20 + mine.length * 5 }));
  await allSaved();
  $("fchatDone").disabled = false;
  $("fchatDone").onclick = () => { S.chat = null; renderChatTab(); };
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
    S.store.onNote((n) => { S.note = n; if (S.tab === "home" && !S.run) renderHome(); });
    pickVoice();
    show("home");
  } catch (e) {
    console.error(e);
    $("login").hidden = false; $("login").innerHTML = '<div class="login-card"><h1 class="display">Er ging iets mis</h1><p>Controleer je internetverbinding en probeer het opnieuw.</p><button class="btn" onclick="location.reload()">Opnieuw</button></div>';
  }
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
if ("speechSynthesis" in window) speechSynthesis.getVoices();
boot();
