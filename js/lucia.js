// Lucía tab: chat with corrections under the user's messages, live proactive messages, unread badge, settings
// (language, on/off, time window, messages per day, notifications, password) and "Practise a situation".
import { CONFIG } from "./config.js";
import { icon } from "./icons.js";
import { t, getLang } from "./i18n.js";
import { $, esc, S, speak, hasEs, status, isOwner, esVoices, isFemale, setVoice, voiceName, voicesReady } from "./core.js";
import { passwordForm } from "./login.js";

export const luciaActions = { scenarios() {}, badge() {}, setLang() {} };
let messages = [], unsub = null;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// Oldest first, newest at the bottom: server time (ts), and the id breaks ties so a reply saved in the same
// instant as the message it answers comes after it. Messages not saved yet ("tmp…") always go last.
const tsOf = (m) => (String(m.id).startsWith("tmp") ? Infinity : Date.parse(m.ts) || 0);
const byTime = (a, b) => tsOf(a) - tsOf(b) || (Number(a.id) || 0) - (Number(b.id) || 0);
const sorted = (list) => [...list].sort(byTime);

export const unread = () => messages.filter((m) => m.role === "lucia" && !m.read_at).length;

// Loads the chat and keeps listening for new messages (also when another tab is open, for the badge).
export async function startLucia() {
  try { messages = sorted(await S.store.chatList()); } catch { messages = []; }
  unsub?.();
  unsub = S.store.onChat((m) => {
    if (messages.some((x) => x.id === m.id)) return;
    messages = sorted([...messages, m]);
    if (S.tab === "lucia") { renderMessages(); markRead(); } else luciaActions.badge();
  });
  luciaActions.badge();
}
async function markRead() {
  if (!unread() || S.readonly) return;
  messages = messages.map((m) => (m.role === "lucia" && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m));
  luciaActions.badge();
  try { await S.store.chatMarkRead(); } catch {}
}

// The Lucía screen is fixed between the top (with the iPhone's safe area) and the tab bar, like WhatsApp:
// header on top, messages scroll in the middle, the input box stays just above the tabs (or the keyboard).
function fit() {
  const page = document.querySelector("#tab-lucia .lucia"); if (!page) return;
  const vv = window.visualViewport, h = vv ? vv.height : innerHeight;
  const keyboard = innerHeight - h > 120, tabs = $("nav")?.offsetHeight || 0;
  page.style.top = (vv ? vv.offsetTop : 0) + "px";
  page.style.height = h - (keyboard ? 0 : tabs) + "px";
  toBottom();
}
const toBottom = () => { const el = $("lchat"); if (el) el.scrollTop = el.scrollHeight; };
if (!window.__luciaFit) { window.__luciaFit = true; addEventListener("resize", fit); window.visualViewport?.addEventListener("resize", fit); window.visualViewport?.addEventListener("scroll", fit); }

export function renderLucia() {
  $("tab-lucia").innerHTML = `<div class="page chat-page lucia">
    <div class="sec-head"><div class="lucia-head"><span class="avatar">L</span><div><h2 class="display">Lucía</h2><span class="muted small">${esc(t("lucia.sub"))}</span></div></div>
      <div class="head-actions"><button class="chip-btn" id="practiceBtn">${icon("chat", 16)} ${esc(t("lucia.practice"))}</button>
      <button class="icon-btn" id="luciaSettings" aria-label="${esc(t("lucia.settings"))}">${icon("gear", 22)}</button></div></div>
    <p class="privacy small" id="privacy">${icon("eye", 16)} ${esc(t("lucia.privacy"))}</p>
    <div class="chat lchat" id="lchat" aria-live="polite"></div>
    <form class="chat-form" id="lform"><input class="chatin" id="linput" maxlength="400" placeholder="${esc(t("chat.placeholder"))}" autocomplete="off" lang="es"><button class="btn" id="lsend" aria-label="${esc(t("btn.send"))}">${icon("send", 20)}</button></form>
    <p class="status" id="lstatus"></p></div>`;
  $("lform").onsubmit = (e) => { e.preventDefault(); send(); };
  $("luciaSettings").onclick = openSettings;
  $("practiceBtn").onclick = () => luciaActions.scenarios();
  renderMessages();
  fit();
  markRead();
}
function renderMessages(pending) {
  const el = $("lchat"); if (!el) return;
  const name = isOwner() && !S.readonly ? CONFIG.NAMES.owner : CONFIG.NAMES.learner;
  el.innerHTML = (messages.length ? "" : `<div class="msg them"><span class="who mono">Lucía</span><span lang="es">${esc(t("lucia.welcome", { name }))}</span></div>`)
    + messages.map((m) => m.role === "claire"
      ? `<div class="msg me"><span class="who mono">${esc(t("chat.you"))}</span><span lang="es">${esc(m.text)}</span></div>${(m.corrections || []).map((c) => `<div class="fix"><span class="mono">${esc(t("lucia.correction"))}</span><b lang="es">${esc(c.better)}</b><small>${esc(c.why)}</small></div>`).join("")}`
      : `<div class="msg them ${m.kind !== "chat" ? "proactive" : ""}"><span class="who mono">Lucía${m.kind === "reminder" ? esc(t("lucia.reminder")) : m.kind === "review" ? esc(t("lucia.review")) : ""}</span><span lang="es">${esc(m.text)}</span>${hasEs() ? `<button class="speak" data-say="${esc(m.text)}">${icon("speaker", 16)}</button>` : ""}</div>`).join("")
    + (pending ? '<div class="msg them typing"><span></span><span></span><span></span></div>' : "");
  toBottom();
}
async function send() {
  const inp = $("linput"), text = inp.value.trim().slice(0, 400);
  if (!text || send.busy) return;
  send.busy = true; inp.value = ""; $("lsend").disabled = true; $("lstatus").textContent = "";
  const local = { id: "tmp" + Date.now(), ts: new Date().toISOString(), role: "claire", text, corrections: [], kind: "chat", read_at: new Date().toISOString() };
  messages.push(local); renderMessages(true);
  try {
    const out = await S.store.ai("/chat", { text });
    messages = messages.filter((m) => m !== local);
    const fresh = await S.store.chatList().catch(() => null);
    if (fresh) messages = sorted(fresh); else messages.push({ ...local, corrections: out.corrections }, { id: "tmpL" + Date.now(), role: "lucia", kind: "chat", text: out.reply, read_at: new Date().toISOString() });
    renderMessages(); speak(out.reply);
  } catch (e) {
    messages = messages.filter((m) => m !== local); inp.value = text; renderMessages();
    $("lstatus").textContent = t(e.code === "limit" ? "lucia.limit" : "lucia.fail");
  }
  send.busy = false; $("lsend").disabled = false; inp.focus();
}

// ---------- settings ----------
async function openSettings() {
  const st = { enabled: true, window_start: 9, window_end: 21, per_day: 2, ...((await S.store.settings().catch(() => null)) || {}) };
  const hours = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  const pushState = !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window) ? "unsupported" : Notification.permission;
  const pw = passwordForm();
  const lang = getLang();
  await voicesReady();
  const prefs = S.readonly ? null : await S.store.prefs().catch(() => null);
  const voices = esVoices(), chosen = prefs?.voice && voices.some((v) => v.name === prefs.voice) ? prefs.voice : "";
  const voiceOpts = `<option value="">${esc(t("set.voiceAuto", { name: !chosen && voiceName() ? ": " + voiceName() : "" }))}</option>` + voices.map((v) => `<option value="${esc(v.name)}" ${v.name === chosen ? "selected" : ""}>${esc(v.name)} · ${esc(v.lang)}${isFemale(v) ? " ♀" : ""}</option>`).join("");
  $("week").hidden = false;
  $("week").innerHTML = `<div class="sheet-head"><button class="icon-btn" id="setBack" aria-label="${esc(t("btn.back"))}">${icon("back")}</button><div><span class="mono muted">Lucía</span><h2 class="display">${esc(t("lucia.settings"))}</h2></div></div>
    <div class="settings">
      ${S.readonly ? "" : `<div class="set-row"><b>${esc(t("set.lang"))}</b><div class="seg" id="setLang"><button type="button" data-lang="nl" aria-pressed="${lang === "nl"}">Nederlands</button><button type="button" data-lang="en" aria-pressed="${lang === "en"}">English</button></div><small>${esc(t("set.langSub"))}</small></div>`}
      ${S.readonly ? "" : `<div class="set-row"><b>${esc(t("set.voice"))}</b>${voices.length ? `<div class="row"><select id="setVoice">${voiceOpts}</select><button type="button" class="btn ghost" id="voiceTry">${icon("speaker", 18)} ${esc(t("set.voiceTry"))}</button></div><small>${esc(t("set.voiceSub"))}</small>` : `<small>${esc(t("set.voiceNone"))}</small>`}</div>`}
      <label class="switch-row"><span><b>${esc(t("set.messages"))}</b><small>${esc(t("set.messagesSub"))}</small></span><input type="checkbox" id="setEnabled" ${st.enabled ? "checked" : ""}></label>
      <div class="set-row"><b>${esc(t("set.between"))}</b><div class="row"><select id="setStart">${hours(st.window_start, 6, 22)}</select><span>${esc(t("set.and"))}</span><select id="setEnd">${hours(st.window_end, 7, 24)}</select></div><small>${esc(t("set.tz"))}</small></div>
      <div class="set-row"><b>${esc(t("set.perDay"))}</b><div class="seg" id="setPerDay">${[0, 1, 2, 3, 4].map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === st.per_day}">${n}</button>`).join("")}</div><small>${esc(t("set.perDaySub"))}</small></div>
      <div class="set-row"><b>${esc(t("set.push"))}</b><small>${esc(t("set.pushSub"))}</small>
        ${pushState === "unsupported" ? `<p class="small">${esc(t(isIOS() && !installed() ? "set.pushIos" : "set.pushNo"))}</p>`
          : pushState === "granted" && st.push_subscription ? `<p class="small ok-text" id="pushOn">${icon("check", 16)} ${esc(t("set.pushOn"))}</p><button class="link small" id="pushOff">${esc(t("set.pushOff"))}</button>`
          : pushState === "denied" ? `<p class="small">${esc(t("set.pushDenied"))}</p>`
          : `<button class="btn wide" id="pushBtn">${icon("bell", 18)} ${esc(t("set.pushBtn"))}</button>`}</div>
      <button class="btn wide" id="setSave">${esc(t("btn.save"))}</button><p class="status" id="setStatus"></p>
      ${S.readonly ? "" : pw.html}</div>`;
  if (!S.readonly) pw.bind();
  $("setLang")?.querySelectorAll("button").forEach((b) => (b.onclick = async () => { await luciaActions.setLang(b.dataset.lang); openSettings(); }));
  // Voice: applied at once to the whole app and saved per user (a name missing on another device falls back to auto).
  $("setVoice")?.addEventListener("change", async (ev) => {
    setVoice(ev.target.value); speak(t("set.voiceSample"));
    try { await S.store.savePrefs({ lang: getLang(), voice: ev.target.value || null }); $("setStatus").textContent = t("set.saved"); } catch { $("setStatus").textContent = t("set.saveFail"); }
  });
  $("voiceTry")?.addEventListener("click", () => speak(t("set.voiceSample")));
  let perDay = st.per_day;
  $("setPerDay").querySelectorAll("button").forEach((b) => (b.onclick = () => { perDay = +b.dataset.n; $("setPerDay").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
  $("setBack").onclick = closeSettings;
  $("setSave").onclick = async () => {
    const start = +$("setStart").value, end = +$("setEnd").value;
    if (end <= start) { $("setStatus").textContent = t("set.window"); return; }
    try { await S.store.saveSettings({ enabled: $("setEnabled").checked, window_start: start, window_end: end, per_day: perDay }); $("setStatus").textContent = t("set.saved"); }
    catch { $("setStatus").textContent = t("set.saveFail"); }
  };
  $("pushBtn")?.addEventListener("click", enablePush);
  $("pushOff")?.addEventListener("click", async () => { const reg = await navigator.serviceWorker.ready; (await reg.pushManager.getSubscription())?.unsubscribe(); await S.store.saveSettings({ push_subscription: null }); openSettings(); });
}
function closeSettings() { $("week").hidden = true; $("week").innerHTML = ""; }
async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { status(t("set.pushNoPerm")); openSettings(); return; }
    const reg = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(CONFIG.VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (CONFIG.VAPID_PUBLIC_KEY.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await S.store.saveSettings({ push_subscription: sub.toJSON() });
    openSettings();
  } catch (e) { console.warn(e); status(t("set.pushFail")); }
}
