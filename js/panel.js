// Augusto's panel (Spanish): live progress, sessions with quiz/mission/test results, grammar accuracy,
// real minutes per day, and sessions flagged when the closing quiz is below 60%.
import { icon } from "./icons.js";
import { passwordForm } from "./login.js";
import {
  $, esc, S, todayStr, addDays, parse, fmtEs, dateEs, byKey, schedule, streak, totalXp, totalMin, TOTAL,
} from "./core.js";

export const panelActions = { viewAs() {}, logout() {} };
const FLAG = 0.6;

export async function renderPanel() {
  const el = $("tab-panel");
  if (!el.dataset.built) {
    el.dataset.built = "1";
    const pw = passwordForm("es");
    el.innerHTML = `<div class="page" lang="es">
      <div class="sec-head"><h2 class="display">Panel de Augusto</h2><span class="live mono"><i></i>EN VIVO</span></div>
      <p class="muted">Se actualiza solo cuando Claire practica.</p>
      <button class="btn ghost wide" id="viewAs">${icon("eye", 18)} Ver como Claire</button>
      <div class="stats" id="pStats"></div>
      <p id="pWhere" class="where"></p>
      <div id="pFlags"></div>
      <h3 class="mono">HOY</h3><div class="today" id="pToday"></div>
      <h3 class="mono">MINUTOS REALES POR DÍA · ÚLTIMAS 2 SEMANAS</h3><div class="days" id="pDays"></div>
      <h3 class="mono">SESIONES</h3><div class="table-wrap"><table class="sess-table" id="pSessionsTable"></table></div>
      <h3 class="mono">PRUEBAS SEMANALES</h3><div class="list" id="pTests"></div>
      <h3 class="mono">PRECISIÓN POR GRAMÁTICA</h3><div class="bars" id="pGrammar"></div>
      <h3 class="mono">LUCÍA · RESUMEN POR DÍA</h3>
      <p class="small muted">Solo cuántos mensajes, de qué temas y qué errores; la conversación es privada de Claire.</p>
      <div class="list" id="pLucia"></div>
      <button class="btn ghost wide" id="luciaTest">${icon("bell", 18)} Enviar un mensaje de prueba de Lucía a mi cuenta</button>
      <p class="status" id="luciaTestStatus"></p>
      <h3 class="mono">NOTA PARA CLAIRE</h3>
      <textarea id="noteInput" maxlength="500" placeholder="Ella la ve al abrir la app."></textarea>
      <div class="row"><button class="btn" id="noteSave">Guardar nota</button><span class="status" id="noteStatus"></span></div>
      <h3 class="mono">ÚLTIMA ACTIVIDAD</h3><div class="list" id="pLog"></div>
      <h3 class="mono">PALABRAS FLOJAS</h3><div class="chips" id="pWeak"></div>
      <h3 class="mono">PALABRAS DOMINADAS</h3><div class="chips" id="pStrong"></div>
      <h3 class="mono">DIÁLOGOS DE LAS MISIONES</h3><div id="pDialogs"></div>
      <h3 class="mono">MI CUENTA</h3>
      ${pw.html}
      <button class="link small" id="logout">${icon("logout", 16)} Cerrar sesión</button></div>`;
    pw.bind();
    $("viewAs").onclick = () => panelActions.viewAs();
    $("noteInput").value = S.note?.text || "";
    $("noteSave").onclick = async () => {
      try { await S.store.setNote($("noteInput").value.trim()); $("noteStatus").textContent = "Guardada."; }
      catch { $("noteStatus").textContent = "No se pudo guardar."; }
    };
    $("logout").onclick = () => panelActions.logout();
    $("luciaTest").onclick = async () => {
      try { await S.store.saveSettings({ test_requested: true }); $("luciaTestStatus").textContent = "Pedido. Lucía te escribe en los próximos 15 minutos (pestaña Lucía y, si activaste las notificaciones en tu teléfono, también como aviso)."; }
      catch { $("luciaTestStatus").textContent = "No se pudo pedir el mensaje de prueba."; }
    };
    let t = null;
    S.panelUnsub?.();
    S.panelUnsub = S.store.subscribe(S.store.learnerId, () => { clearTimeout(t); t = setTimeout(fillPanel, 300); });
  }
  await fillPanel();
}

async function fillPanel() {
  if (!S.store.learnerId) { $("pStats").innerHTML = '<div class="stat wide"><span>Claire todavía no ha entrado nunca.</span></div>'; return; }
  let p;
  try { p = await S.store.panel(S.store.learnerId); } catch { $("pStats").innerHTML = '<div class="stat wide"><span>No se pudo cargar el progreso.</span></div>'; return; }
  const days = byKey(p.days, "day"), results = byKey(p.results, "n"), t = todayStr();
  const sch = schedule(results), st = streak(results);
  const res = Object.values(results).sort((a, b) => a.n - b.n);
  $("pStats").innerHTML = `<div class="stat"><b class="display">${st}</b><span>${st === 1 ? "sesión a tiempo" : "sesiones a tiempo"}</span></div><div class="stat"><b class="display">${totalXp(days)}</b><span>XP</span></div><div class="stat"><b class="display">${Math.round(totalMin(days))}</b><span>minutos</span></div>`;
  $("pWhere").textContent = sch.state === "finished" ? `Terminó las ${TOTAL()} sesiones.`
    : `Va en la sesión ${sch.next} de ${TOTAL()}. ` + (sch.state === "rest" ? `Hoy descansa; la próxima es el ${dateEs(sch.planned).replace(/\.$/, "")}.` : sch.late ? `La sesión ${sch.next} estaba para el ${dateEs(sch.planned).replace(/\.$/, "")} y está pendiente.` : `Hoy le toca la sesión ${sch.next}.`);

  const flagged = res.filter((r) => r.quiz_total && r.quiz_ok / r.quiz_total < FLAG);
  $("pFlags").innerHTML = flagged.length ? `<div class="flags">${icon("alert", 18)}<div><b>Sesiones que le costaron (quiz bajo 60%)</b>${flagged.map((r) => `<p>Sesión ${r.n} · ${esc(S.sessions[r.n]?.title_es || "")}: quiz ${r.quiz_ok}/${r.quiz_total}</p>`).join("")}</div></div>` : "";

  const todayLog = p.sessions.filter((s) => s.ts.slice(0, 10) === t || new Date(s.ts).toDateString() === new Date().toDateString());
  $("pToday").innerHTML = todayLog.length ? todayLog.map((s) => `<div class="on"><span class="dot">${icon("check", 12)}</span>${esc(logLabel(s))}</div>`).join("") : `<div class="muted">${sch.state === "rest" ? "Día de descanso. No tiene nada pendiente." : "Todavía nada hoy."}</div>`;

  const maxM = Math.max(10, ...Array.from({ length: 14 }, (_, i) => Number(days[addDays(t, -i)]?.minutes || 0)));
  $("pDays").innerHTML = Array.from({ length: 14 }, (_, i) => { const k = addDays(t, i - 13), d = days[k], m = Number(d?.minutes || 0), on = !!d && (m > 0 || d.lessons > 0 || d.dialog); return `<div class="day ${on ? "on" : ""}" title="${k}: ${on ? Math.max(1, Math.round(m)) : 0} min"><i style="height:${Math.max(on ? 8 : 3, (m / maxM) * 100)}%"></i><span>${parse(k).getDate()}</span></div>`; }).join("");

  $("pSessionsTable").innerHTML = res.length ? `<thead><tr><th>#</th><th>Fecha</th><th>Quiz</th><th>Misión</th><th>Min</th></tr></thead><tbody>${res.map((r) => {
    const low = r.quiz_total && r.quiz_ok / r.quiz_total < FLAG;
    const score = r.mission_score != null ? ` ${r.mission_score}/5` : "";
    const mis = r.mission_met === true ? "✓" + score : r.mission_met === false ? "✗" + score : "—";
    return `<tr class="${low ? "low" : ""}"><td>${r.n}</td><td>${esc(dateEs(r.done_on))}${r.on_time ? "" : ' <small class="late-tag">tarde</small>'}</td><td>${r.quiz_total ? `${r.quiz_ok}/${r.quiz_total}` : "—"}</td><td title="${esc(r.detail?.mission?.goal || "")}">${mis}</td><td>${Math.round(Number(r.minutes || 0))}</td></tr>`;
  }).join("")}</tbody>` : '<tbody><tr><td class="muted">Todavía no hay sesiones.</td></tr></tbody>';

  const tests = res.flatMap((r) => (r.detail?.tests || []).map((x) => ({ ...x, on: r.done_on, n: r.n })));
  $("pTests").innerHTML = tests.length ? tests.map((x) => `<div class="item">${x.passed ? "✓" : "✗"} Semana ${x.week}: ${x.ok}/${x.total} (${Math.round((x.ok / x.total) * 100)}%)${x.passed ? " · sello ganado" : " · la repite en la próxima sesión"}<small>${esc(dateEs(x.on))}, sesión ${x.n}</small></div>`).join("") : '<div class="item muted">Aún no hizo ninguna prueba semanal.</div>';

  const acc = {};
  for (const r of res) for (const [id, g] of Object.entries(r.detail?.grammar || {})) { const a = (acc[id] ||= { ok: 0, total: 0 }); a.ok += g.ok; a.total += g.total; }
  const rows = Object.entries(acc).sort(([a], [b]) => a.localeCompare(b));
  $("pGrammar").innerHTML = rows.length ? rows.map(([id, a]) => { const pct = Math.round((a.ok / a.total) * 100); return `<div class="bar-row ${pct < 60 ? "low" : ""}"><span>${esc(S.grammar[id]?.title_es || id)}</span><div class="bar-track"><i style="width:${pct}%"></i></div><b>${pct}%</b><small>${a.ok}/${a.total}</small></div>`; }).join("") : '<div class="muted">Aparece después de su primera sesión completa.</div>';

  const daily = await S.store.chatDaily(S.store.learnerId).catch(() => []);
  $("pLucia").innerHTML = daily.length ? daily.map((d) => {
    const errs = (d.errors || []).sort((a, b) => b.count - a.count).slice(0, 4);
    return `<div class="item"><b>${esc(dateEs(d.day))}</b> · ${d.messages} ${d.messages === 1 ? "mensaje" : "mensajes"}${d.topics?.length ? `<small>Temas: ${esc(d.topics.join(", "))}</small>` : ""}${errs.length ? `<small>Errores frecuentes: ${esc(errs.map((e) => `${e.tag} (${e.count})`).join(", "))}</small>` : ""}</div>`;
  }).join("") : '<div class="item muted">Claire todavía no ha escrito con Lucía.</div>';

  $("pLog").innerHTML = p.sessions.length ? p.sessions.map((s) => `<div class="item">${esc(logLabel(s))}<small>${fmtEs(s.ts)}${s.detail?.dur ? ` · ${Math.max(1, Math.round(s.detail.dur / 60))} min` : ""}</small></div>`).join("") : '<div class="item muted">Todavía nada.</div>';

  const weak = [], strong = [];
  for (const c of p.cards) { if (c.ko > 0 && c.box <= 1) weak.push(c.es); else if (c.box >= 3) strong.push(c.es); }
  $("pWeak").innerHTML = weak.length ? weak.map((x) => `<span class="chip weak">${esc(x)}</span>`).join("") : '<span class="chip">Nada todavía</span>';
  $("pStrong").innerHTML = strong.length ? strong.map((x) => `<span class="chip strong">${esc(x)}</span>`).join("") : '<span class="chip">Nada todavía</span>';
  $("pDialogs").innerHTML = p.dialogs.length ? p.dialogs.map((d) => `<details class="item"><summary>${esc(d.scenario)} · ${fmtEs(d.ts)}${d.feedback ? ` · ${d.feedback.goal_met === true ? "objetivo cumplido" : d.feedback.goal_met === false ? "objetivo no cumplido" : ""} · ${esc(d.feedback.score)}/5` : ""}</summary>${d.feedback?.goal ? `<p class="small muted">Objetivo: ${esc(d.feedback.goal)}</p>` : ""}<div class="chat">${(d.turns || []).map((x) => `<div class="msg ${x.role === "user" ? "me" : "them"}">${esc(x.content)}</div>`).join("")}</div>${d.feedback?.errors?.length ? `<ul class="fixes">${d.feedback.errors.map((e) => `<li><s>${esc(e.said)}</s> → <b>${esc(e.better)}</b></li>`).join("")}</ul>` : ""}</details>`).join("") : '<div class="item muted">Sin diálogos aún.</div>';
}

function logLabel(s) {
  const x = s.detail || {};
  if (s.kind === "session") return `Sesión ${x.n} · ${x.title || ""} · quiz ${x.quiz}${x.mission === true ? " · misión ✓" : x.mission === false ? " · misión ✗" : ""}${(x.tests || []).map((t) => ` · prueba S${t.week} ${t.ok}/${t.total}`).join("")} · +${x.xp} XP`;
  if (s.kind === "review") return `Repaso opcional · ${x.score} · +${x.xp} XP`;
  if (s.kind === "extra") return `Extra oefenen · ${x.score} · +${x.xp} XP`;
  if (s.kind === "lesson") return `Lección (versión anterior) · ${x.title || ""} · ${x.score}`;
  if (s.kind === "dialog") return `Diálogo libre · ${x.scenario} · ${x.score || "sin nota"}`;
  return `Frase por WhatsApp: "${x.text || ""}"`;
}
