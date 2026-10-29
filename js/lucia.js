// Lucía tab: chat with corrections under Claire's messages, live proactive messages, unread badge, settings
// (on/off, time window, messages per day, notifications) and the "Oefen een situatie" button for free scenarios.
import { CONFIG } from "./config.js";
import { icon } from "./icons.js";
import { $, esc, S, speak, hasEs, status } from "./core.js";
import { passwordForm } from "./login.js";

export const luciaActions = { scenarios() {}, badge() {} };
let messages = [], unsub = null;
const PRIVACY = "Augusto ziet een samenvatting van je oefening (onderwerpen en fouten), niet het hele gesprek.";
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export const unread = () => messages.filter((m) => m.role === "lucia" && !m.read_at).length;

// Loads the chat and keeps listening for new messages (also when another tab is open, for the badge).
export async function startLucia() {
  try { messages = await S.store.chatList(); } catch { messages = []; }
  unsub?.();
  unsub = S.store.onChat((m) => {
    if (messages.some((x) => x.id === m.id)) return;
    messages.push(m);
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

export function renderLucia() {
  $("tab-lucia").innerHTML = `<div class="page chat-page lucia">
    <div class="sec-head"><div class="lucia-head"><span class="avatar">L</span><div><h2 class="display">Lucía</h2><span class="muted small">Je Spaanse maatje uit Lima</span></div></div>
      <button class="icon-btn" id="luciaSettings" aria-label="Instellingen">${icon("gear", 22)}</button></div>
    <p class="privacy small" id="privacy">${icon("eye", 16)} ${esc(PRIVACY)}</p>
    <div class="chat lchat" id="lchat" aria-live="polite"></div>
    <form class="chat-form" id="lform"><input class="chatin" id="linput" maxlength="400" placeholder="Schrijf in het Spaans..." autocomplete="off" lang="es"><button class="btn" id="lsend" aria-label="Sturen">${icon("send", 20)}</button></form>
    <p class="status" id="lstatus"></p>
    <button class="btn ghost wide" id="practiceBtn">${icon("chat", 18)} Oefen een situatie</button></div>`;
  $("lform").onsubmit = (e) => { e.preventDefault(); send(); };
  $("luciaSettings").onclick = openSettings;
  $("practiceBtn").onclick = () => luciaActions.scenarios();
  renderMessages();
  markRead();
}
function renderMessages(pending) {
  const el = $("lchat"); if (!el) return;
  el.innerHTML = (messages.length ? "" : `<div class="msg them"><span class="who mono">Lucía</span><span lang="es">¡Hola, Claire! Soy Lucía, de Lima. Escríbeme lo que quieras en español, aunque sea con errores. ¿Cómo estás hoy?</span></div>`)
    + messages.map((m) => m.role === "claire"
      ? `<div class="msg me"><span class="who mono">Jij</span><span lang="es">${esc(m.text)}</span></div>${(m.corrections || []).map((c) => `<div class="fix"><span class="mono">Correctie</span><b lang="es">${esc(c.better)}</b><small>${esc(c.why)}</small></div>`).join("")}`
      : `<div class="msg them ${m.kind !== "chat" ? "proactive" : ""}"><span class="who mono">Lucía${m.kind === "reminder" ? " · herinnering" : m.kind === "review" ? " · even herhalen" : ""}</span><span lang="es">${esc(m.text)}</span>${hasEs() ? `<button class="speak" data-say="${esc(m.text)}">${icon("speaker", 16)}</button>` : ""}</div>`).join("")
    + (pending ? '<div class="msg them typing"><span></span><span></span><span></span></div>' : "");
  el.lastElementChild?.scrollIntoView({ block: "nearest" });
}
async function send() {
  const inp = $("linput"), text = inp.value.trim().slice(0, 400);
  if (!text || send.busy) return;
  send.busy = true; inp.value = ""; $("lsend").disabled = true; $("lstatus").textContent = "";
  const local = { id: "tmp" + Date.now(), role: "claire", text, corrections: [], kind: "chat", read_at: new Date().toISOString() };
  messages.push(local); renderMessages(true);
  try {
    const out = await S.store.ai("/chat", { text });
    messages = messages.filter((m) => m !== local);
    const fresh = await S.store.chatList().catch(() => null);
    if (fresh) messages = fresh; else messages.push({ ...local, corrections: out.corrections }, { id: "tmpL" + Date.now(), role: "lucia", kind: "chat", text: out.reply, read_at: new Date().toISOString() });
    renderMessages(); speak(out.reply);
  } catch (e) {
    messages = messages.filter((m) => m !== local); inp.value = text; renderMessages();
    $("lstatus").textContent = e.code === "limit" ? "Je hebt het maximum voor vandaag bereikt. Morgen kan het weer." : "Lucía kon nu niet antwoorden. Probeer het zo nog eens.";
  }
  send.busy = false; $("lsend").disabled = false; inp.focus();
}

// ---------- settings ----------
async function openSettings() {
  const st = { enabled: true, window_start: 9, window_end: 21, per_day: 2, ...((await S.store.settings().catch(() => null)) || {}) };
  const hours = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  const pw = passwordForm("nl");
  const pushState = !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window) ? "unsupported" : Notification.permission;
  $("week").hidden = false;
  $("week").innerHTML = `<div class="sheet-head"><button class="icon-btn" id="setBack" aria-label="Terug">${icon("back")}</button><div><span class="mono muted">Lucía</span><h2 class="display">Instellingen</h2></div></div>
    <div class="settings">
      <label class="switch-row"><span><b>Berichtjes van Lucía</b><small>Lucía stuurt je zelf af en toe een bericht.</small></span><input type="checkbox" id="setEnabled" ${st.enabled ? "checked" : ""}></label>
      <div class="set-row"><b>Tussen</b><div class="row"><select id="setStart">${hours(st.window_start, 6, 22)}</select><span>en</span><select id="setEnd">${hours(st.window_end, 7, 24)}</select></div><small>Nederlandse tijd</small></div>
      <div class="set-row"><b>Berichtjes per dag</b><div class="seg" id="setPerDay">${[0, 1, 2, 3, 4].map((n) => `<button type="button" data-n="${n}" aria-pressed="${n === st.per_day}">${n}</button>`).join("")}</div><small>Op rustdagen stuurt Lucía er hooguit één, met 2 of 3 korte herhaalvragen. Op sessiedagen krijg je om 9:00 en 19:00 een herinnering als je sessie nog openstaat.</small></div>
      <div class="set-row"><b>Meldingen</b><small>Met meldingen zie je een berichtje van Lucía ook als de app dicht is. Zonder meldingen staan ze gewoon in de chat, met een teller op het tabblad.</small>
        ${pushState === "unsupported" ? `<p class="small">${isIOS() && !installed() ? "Op de iPhone werken meldingen alleen als je de app op je beginscherm zet: Delen → Zet op beginscherm. Open hem daarna vanaf het beginscherm." : "Deze browser ondersteunt geen meldingen."}</p>`
          : pushState === "granted" && st.push_subscription ? `<p class="small ok-text" id="pushOn">${icon("check", 16)} Meldingen staan aan op dit toestel.</p><button class="link small" id="pushOff">Meldingen uitzetten</button>`
          : pushState === "denied" ? '<p class="small">Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je telefoon of browser.</p>'
          : `<button class="btn wide" id="pushBtn">${icon("bell", 18)} Meldingen aanzetten</button>`}</div>
      <button class="btn wide" id="setSave">Opslaan</button><p class="status" id="setStatus"></p>
      ${pw.html}</div>`;
  pw.bind();
  let perDay = st.per_day;
  $("setPerDay").querySelectorAll("button").forEach((b) => (b.onclick = () => { perDay = +b.dataset.n; $("setPerDay").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
  $("setBack").onclick = closeSettings;
  $("setSave").onclick = async () => {
    const start = +$("setStart").value, end = +$("setEnd").value;
    if (end <= start) { $("setStatus").textContent = "De eindtijd moet na de begintijd liggen."; return; }
    try { await S.store.saveSettings({ enabled: $("setEnabled").checked, window_start: start, window_end: end, per_day: perDay }); $("setStatus").textContent = "Opgeslagen."; }
    catch { $("setStatus").textContent = "Opslaan lukte niet."; }
  };
  $("pushBtn")?.addEventListener("click", enablePush);
  $("pushOff")?.addEventListener("click", async () => { const reg = await navigator.serviceWorker.ready; (await reg.pushManager.getSubscription())?.unsubscribe(); await S.store.saveSettings({ push_subscription: null }); openSettings(); });
}
function closeSettings() { $("week").hidden = true; $("week").innerHTML = ""; }
async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { status("Zonder toestemming geen meldingen. Berichtjes staan wel in de chat."); openSettings(); return; }
    const reg = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(CONFIG.VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (CONFIG.VAPID_PUBLIC_KEY.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await S.store.saveSettings({ push_subscription: sub.toJSON() });
    openSettings();
  } catch (e) { console.warn(e); status("Meldingen aanzetten lukte niet."); }
}
