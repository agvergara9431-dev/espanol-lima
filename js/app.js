// App shell: boot, language, navigation, Words, free scenarios, and wiring between home, sessions, Lucía and the panel.
import { createStore } from "./store.js";
import { icon } from "./icons.js";
import { t, tr, trEx, L, setLang } from "./i18n.js";
import { $, esc, S, isOwner, schedule, loadContent, loadUser, voicesReady, setVoice, hasEs, speak, status, updateToday, save, allSaved } from "./core.js";
import { buildSession, buildReview, buildExtra, start, savedRun, setOnClose, showStamp } from "./session.js";
import { renderHome, renderPassport, actions } from "./home.js";
import { renderPanel, panelActions } from "./panel.js";
import { renderLogin } from "./login.js";
import { renderLucia, startLucia, unread, luciaActions } from "./lucia.js";

const MAX_MSG = 300;
let ownLang = "nl";

// ---------- language: per account; "view as Claire" always shows Dutch ----------
export async function applyLang(lang, { persist = false } = {}) {
  if (persist) { await S.store.savePrefs({ lang }); ownLang = lang; }
  setLang(lang);
  $("tab-panel").dataset.built = "";
  show(S.tab);
}
luciaActions.setLang = (lang) => applyLang(lang, { persist: true });
panelActions.setLang = (lang) => applyLang(lang, { persist: true });

// ---------- navigation ----------
function tabs() {
  const list = [["home", "route", "nav.route"], ["passport", "passport", "nav.passport"], ["lucia", "chat", "nav.lucia"], ["words", "words", "nav.words"]];
  if (isOwner() && !S.readonly) list.push(["panel", "panel", "nav.panel"]);
  const n = unread();
  $("nav").innerHTML = list.map(([k, ic, label]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k || (k === "lucia" && S.tab === "chat")}">${icon(ic)}${esc(t(label))}${k === "lucia" && n ? `<span class="badge" id="luciaBadge" aria-label="${esc(t("nav.new", { n }))}">${n}</span>` : ""}</button>`).join("");
}
function show(tab) {
  S.tab = tab;
  for (const k of ["home", "passport", "lucia", "chat", "words", "panel"]) $("tab-" + k).hidden = k !== tab;
  tabs();
  if (tab === "home") renderHome();
  if (tab === "passport") renderPassport();
  if (tab === "lucia") renderLucia();
  if (tab === "chat") renderChatTab();
  if (tab === "words") renderWords();
  if (tab === "panel") renderPanel();
  scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const tb = e.target.closest("[data-tab]"); if (tb && tb.closest("#nav")) show(tb.dataset.tab);
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
  status(t("extra.making"));
  try { const run = await buildExtra(doneUpTo()); status(""); start(run); }
  catch (e) { status(t(e.code === "limit" ? "extra.limit" : "extra.fail")); }
};
actions.passport = () => show("passport");
luciaActions.scenarios = () => show("chat");
luciaActions.badge = () => tabs();
actions.backToOwner = async () => { S.readonly = false; setLang(ownLang); await loadUser(S.store.me.id); show("panel"); };
panelActions.viewAs = async () => {
  if (!S.store.learnerId) { status(t("p.never")); return; }
  S.readonly = true; setLang("nl"); await loadUser(S.store.learnerId); show("home");
};
panelActions.logout = async () => { await S.store.signOut(); location.reload(); };
setOnClose((R) => {
  show(S.tab);
  const stamps = [...(R?.stampWeeks || [])];
  const nextStamp = () => { const w = stamps.shift(); if (w) showStamp(w, nextStamp); else if (R?.goExtra) actions.extra(); else if (S.tab === "home") renderHome(); };
  nextStamp();
});

// ---------- words ----------
function renderWords() {
  const n = doneUpTo();
  const sessions = Object.values(S.sessions).filter((s) => s.n <= n && s.items?.length).sort((a, b) => b.n - a.n);
  $("tab-words").innerHTML = `<div class="page">
    <h2 class="display">${esc(t("words.title"))}</h2>
    <p class="muted">${esc(t("words.intro"))}</p>
    <div class="stack"><button class="btn wide" id="wReview">${icon("words", 18)} ${esc(t("home.review"))}</button><button class="btn ghost wide" id="wExtra">${icon("flame", 18)} ${esc(t("words.extra"))}</button></div>
    ${sessions.map((s) => `<h3 class="mono">${esc(t("words.session", { n: s.n, title: L(s, "title") }))}</h3><ul class="vocab">${s.items.map((it) => {
      const c = S.cards[it.id]; const lvl = !c ? "" : c.box >= 3 ? "strong" : c.ko > 0 && c.box <= 1 ? "weak" : "";
      return `<li class="${lvl}"><div><b lang="es">${esc(it.es)}</b><small>${esc(tr(it))}</small>${it.ex ? `<small class="ex" lang="es">${esc(it.ex.es)}</small><small class="ex-tr">${esc(trEx(it.ex))}</small>` : ""}</div>${hasEs() ? `<button class="icon-btn" data-say="${esc(it.es)}" aria-label="${esc(t("words.listen"))}">${icon("speaker", 20)}</button>` : ""}</li>`;
    }).join("")}</ul>`).join("")}</div>`;
  $("wReview").onclick = actions.review;
  $("wExtra").onclick = actions.extra;
}

// ---------- free scenarios ("Oefen een situatie", reached from Lucía) ----------
function renderChatTab() {
  if (S.chat) return;
  const wk = S.sessions[Math.min(schedule().next, 24)]?.week || 1;
  const list = Object.values(S.scen).filter((s) => s.week <= wk);
  $("tab-chat").innerHTML = `<div class="page">
    <div class="sheet-head"><button class="icon-btn" id="scenBack" aria-label="${esc(t("scen.back"))}">${icon("back")}</button><div><span class="mono muted">Lucía</span><h2 class="display">${esc(t("scen.title"))}</h2></div></div>
    <p class="muted">${esc(t("scen.intro"))}</p>
    <div class="scen">${list.map((s) => `<button data-sc="${s.key}"><span class="sc-ico">${icon(s.icon)}</span><b>${esc(L(s, "title"))}</b><small>${esc(L(s, "desc"))}</small></button>`).join("")}</div></div>`;
  $("tab-chat").querySelectorAll("[data-sc]").forEach((b) => (b.onclick = () => startDialog(b.dataset.sc)));
  $("scenBack").onclick = () => show("lucia");
}
async function startDialog(key) {
  const sc = S.scen[key]; if (!sc) return;
  await voicesReady();
  S.chat = { key, week: sc.week, turns: [{ role: "assistant", content: sc.opener }], started: Date.now(), ended: false };
  $("tab-chat").innerHTML = `<div class="page chat-page">
    <div class="sheet-head"><button class="icon-btn" id="chatBack" aria-label="${esc(t("btn.back"))}">${icon("back")}</button><div><span class="mono muted">${esc(t("scen.label"))}</span><h2 class="display">${esc(L(sc, "title"))}</h2></div></div>
    <p class="muted">${esc(L(sc, "desc"))}</p>
    <div class="chat" id="fchat" aria-live="polite"></div>
    <form class="chat-form" id="fchatForm"><input class="chatin" id="fchatInput" maxlength="${MAX_MSG}" placeholder="${esc(t("chat.placeholder"))}" autocomplete="off" lang="es"><button class="btn" id="fsendBtn" aria-label="${esc(t("btn.send"))}">${icon("send", 20)}</button></form>
    <div class="row"><button class="btn ghost" id="fendBtn">${esc(t("scen.stop"))}</button><span class="status" id="fchatStatus"></span></div>
    <div id="ffeedback" class="feedback" hidden></div></div>`;
  $("chatBack").onclick = () => { S.chat = null; renderChatTab(); };
  $("fchatForm").onsubmit = (e) => { e.preventDefault(); sendFree(); };
  $("fendBtn").onclick = endFree;
  renderFree(); speak(sc.opener);
}
function renderFree(pending) {
  const sc = S.scen[S.chat.key];
  $("fchat").innerHTML = S.chat.turns.map((x) => `<div class="msg ${x.role === "user" ? "me" : "them"}"><span class="who mono">${esc(x.role === "user" ? t("chat.you") : L(sc, "title"))}</span><span lang="es">${esc(x.content)}</span></div>`).join("") + (pending ? '<div class="msg them typing"><span></span><span></span><span></span></div>' : "");
  $("fchat").lastElementChild?.scrollIntoView({ block: "nearest" });
}
async function sendFree() {
  const c = S.chat, inp = $("fchatInput"), v = inp.value.trim().slice(0, MAX_MSG);
  if (!v || c.ended || c.busy) return;
  inp.value = ""; c.turns.push({ role: "user", content: v }); c.busy = true; renderFree(true); $("fsendBtn").disabled = true;
  try { const { text } = await S.store.ai("/dialog", { week: c.week, scenario: c.key, turns: c.turns }); c.turns.push({ role: "assistant", content: text }); renderFree(); speak(text); }
  catch { c.turns.pop(); inp.value = v; renderFree(); $("fchatStatus").textContent = t("ai.fail"); }
  c.busy = false; $("fsendBtn").disabled = false;
}
async function endFree() {
  const c = S.chat, mine = c.turns.filter((x) => x.role === "user");
  if (!mine.length) { $("fchatStatus").textContent = t("scen.first"); return; }
  c.ended = true; $("fendBtn").disabled = true; $("fchatStatus").textContent = t("scen.fixing");
  let fb = null;
  try { fb = await S.store.ai("/feedback", { week: c.week, scenario: c.key, turns: c.turns, lang: document.documentElement.lang }); $("fchatStatus").textContent = ""; }
  catch { $("fchatStatus").textContent = t("scen.fixFail"); }
  $("ffeedback").hidden = false;
  $("ffeedback").innerHTML = (fb ? `<span class="pill ${fb.score >= 4 ? "ok" : "warn"}">${esc(fb.score)}/5</span> <b>${esc(fb.praise)}</b>${(fb.errors || []).length ? `<ul>${fb.errors.map((x) => `<li><s lang="es">${esc(x.said)}</s> → <b lang="es">${esc(x.better)}</b><br><small>${esc(x.why)}</small></li>`).join("")}</ul>` : `<p>${esc(t("mission.noErrors"))}</p>`}` : "") + `<button class="btn wide" id="fchatDone">${esc(t("btn.done"))}</button>`;
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
  setLang((navigator.language || "nl").toLowerCase().startsWith("nl") ? "nl" : "en");
  try {
    await loadContent();
    S.store = await createStore();
    let ok = false;
    try { ok = await S.store.init(); } catch (e) { renderLogin(t(e.code === "not_allowed" ? "login.noAccess" : "login.failed")); return; }
    if (!ok) { renderLogin(); return; }
    const prefs = await S.store.prefs().catch(() => null);
    ownLang = prefs?.lang || (isOwner() ? "en" : "nl");
    setLang(ownLang);
    await loadUser(S.store.me.id);
    $("login").hidden = true; $("app").hidden = false;
    S.store.onNote((n) => { S.note = n; if (S.tab === "home" && !S.run) renderHome(); });
    setVoice(prefs?.voice);
    await startLucia();
    show(new URLSearchParams(location.search).get("tab") === "lucia" ? "lucia" : "home");
  } catch (e) {
    console.error(e);
    $("login").hidden = false; $("login").innerHTML = `<div class="login-card"><h1 class="display">${esc(t("login.error.title"))}</h1><p>${esc(t("login.error.text"))}</p><button class="btn" onclick="location.reload()">${esc(t("login.retry"))}</button></div>`;
  }
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
if ("speechSynthesis" in window) speechSynthesis.getVoices();
boot();
