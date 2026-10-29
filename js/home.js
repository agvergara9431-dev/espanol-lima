// Paspoort (home): boarding pass for the next session or a rest-day card, and the AMS → LIM route:
// 24 stops (one per session) in 7 rows, each ending in that week's stamp.
import { CONFIG } from "./config.js";
import { icon } from "./icons.js";
import {
  $, esc, S, isOwner, todayStr, addDays, between, dayLabelNl, stampDate, schedule, streak, totalXp, sessionReady,
  weekSessions, testsFor, weekPassed,
} from "./core.js";
import { savedRun } from "./session.js";

export const actions = { session() {}, review() {}, extra() {}, backToOwner() {} };
const viewName = () => (S.readonly || !isOwner() ? CONFIG.NAMES.learner : CONFIG.NAMES.owner);

export function renderHome() {
  const t = todayStr(), sch = schedule(), st = streak();
  const left = Math.max(0, between(t, CONFIG.TRIP));
  const xp = totalXp(S.days), note = S.note?.text;
  const stamps = S.weeks.filter((w) => weekPassed(w.week)).length;
  $("tab-home").innerHTML = `
    <header class="pass">
      <div class="pass-row"><span class="mono gold">PASAPORTE · ESPAÑOL</span><span class="mono gold">NL → PE</span></div>
      <div class="pass-row end">
        <div><h1 class="display" id="homeName">${esc(viewName())}</h1><div class="sub" id="homeStats">${st} ${st === 1 ? "sessie" : "sessies"} op tijd · ${xp} XP</div></div>
        <div class="count"><b class="display" id="daysLeft">${left}</b><span>dagen tot vertrek</span></div>
      </div>
    </header>
    <div class="page">
      ${S.readonly ? `<div class="banner">${icon("eye", 18)}<span>Vista de Claire, solo lectura. Lo que hagas aquí no se guarda.</span><button class="link" id="backToMe">Volver</button></div>` : ""}
      ${note ? `<div class="note" id="augNote"><small class="mono">BERICHTJE VAN AUGUSTO</small>${esc(note)}</div>` : ""}
      ${ticket(sch)}
      <div class="sec-head"><h2 class="display">Route AMS → LIM</h2><span class="muted small">${stamps} van ${S.weeks.length} stempels</span></div>
      <div class="route" id="route">${S.weeks.map((w) => routeRow(w, sch)).join("")}</div>
    </div>`;
  $("backToMe")?.addEventListener("click", () => actions.backToOwner());
  $("board")?.addEventListener("click", () => actions.session());
  $("reviewBtn")?.addEventListener("click", () => actions.review());
  $("extraBtn")?.addEventListener("click", () => actions.extra());
  $("route").querySelectorAll("[data-week]").forEach((b) => (b.onclick = () => openWeek(+b.dataset.week)));
}

function ticket(sch) {
  const t = todayStr();
  const extras = `<div class="row tight"><button class="btn ghost" id="reviewBtn">${icon("words", 18)} Herhalen</button><button class="btn ghost" id="extraBtn">${icon("flame", 18)} Extra oefenen</button></div>`;
  if (sch.state === "finished") return `<section class="ticket rest"><div class="ticket-main"><div class="mono ticket-meta"><span>ALLE SESSIES KLAAR</span><span>LIM</span></div><p class="display big-line">¡Buen viaje!</p><p class="muted">Je hebt alle ${sch.doneCount} sessies gedaan. Herhalen kan altijd.</p>${extras}</div><div class="perf" aria-hidden="true"></div><button class="board" disabled><span>KLAAR</span></button></section>`;
  if (sch.state === "rest") {
    const doneToday = sch.last && sch.last.done_on === t;
    return `<section class="ticket rest" aria-label="Rustdag"><div class="ticket-main">
      <div class="mono ticket-meta"><span id="ticketDay">RUSTDAG</span><span>GATE W${S.sessions[sch.next]?.week || 7}</span></div>
      ${doneToday ? `<p class="done-line">${icon("check", 16)} Sessie ${sch.last.n} is klaar. Goed gedaan!</p>` : '<p class="done-line">Vandaag hoef je niets te doen.</p>'}
      <p id="nextSession">Volgende sessie: <b>${esc(dayLabelNl(sch.planned))}</b></p>
      <p class="muted small">Zin in meer? Herhalen of extra oefenen kan, zonder nieuwe stof.</p>${extras}</div>
      <div class="perf" aria-hidden="true"></div><button class="board" disabled><span>RUST</span></button></section>`;
  }
  const s = S.sessions[sch.next];
  if (!sessionReady(sch.next)) return `<section class="ticket rest"><div class="ticket-main"><div class="mono ticket-meta"><span>SESSIE ${sch.next}</span><span>GATE W${s?.week || ""}</span></div><p>Sessie ${sch.next} komt eraan. Augusto zet hem zo klaar.</p>${extras}</div><div class="perf" aria-hidden="true"></div><button class="board" disabled><span>BIJNA</span></button></section>`;
  const resume = savedRun();
  const tests = testsFor(sch.next);
  const steps = ["Herhalen", `Nieuwe zinnen (${s.items.length})`, "Grammatica: " + s.grammar.title, "Actief oefenen", "Missie: " + s.mission.goal, "Afsluitende quiz", ...tests.map((w) => `Weektoets week ${w}`)];
  return `<section class="ticket" aria-label="Sessie van vandaag"><div class="ticket-main">
    <div class="mono ticket-meta"><span id="ticketDay">INSTAPKAART · SESSIE ${sch.next}</span><span id="ticketGate">GATE W${s.week}</span></div>
    <div class="route-line"><span class="display">AMS</span><svg width="60" height="14" viewBox="0 0 60 14" aria-hidden="true"><path d="M2 7h50" stroke="var(--sand)" stroke-width="2" stroke-dasharray="3 4"/><path d="M50 2l8 5-8 5z" fill="var(--wine)"/></svg><span class="display">LIM</span></div>
    <p class="sess-title"><b>${esc(s.title)}</b> <span class="muted small">· ±30 min</span></p>
    ${sch.late ? `<p class="late" id="late">Je sessie stond op ${esc(dayLabelNl(sch.planned))}. Geen probleem: doe hem vandaag, de planning schuift mee.</p>` : ""}
    ${resume ? `<p class="late">Je was al begonnen. Je gaat verder waar je was.</p>` : ""}
    <ol class="steps">${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
    <div class="perf" aria-hidden="true"></div><button class="board" id="board" ${S.readonly ? "disabled" : ""}><span>${resume ? "VERDER" : "INSTAPPEN"}</span></button></section>`;
}

function routeRow(w, sch) {
  const ws = weekSessions(w.week), passed = weekPassed(w.week);
  const dots = ws.map((s) => {
    const done = S.results[s.n], cur = s.n === sch.next && sch.state !== "finished";
    return `<span class="dot ${done ? "done" : cur ? "cur" : ""}" title="Sessie ${s.n}">${done ? icon("check", 12) : s.n}</span>`;
  }).join('<i class="dash"></i>');
  return `<button class="route-row" data-week="${w.week}" aria-label="Week ${w.week}: ${esc(w.title)}"><span class="mono wk">W${w.week}</span><span class="dots">${dots}</span>
    <span class="stamp-mini ${passed ? "done" : ""}">${passed ? `<b>${esc(w.stamp)}</b><small class="mono">${stampDate(passed)}</small>` : `<small class="mono">${esc(w.stamp)}</small>`}</span></button>`;
}

function openWeek(wn) {
  const w = S.weeks.find((x) => x.week === wn), sch = schedule();
  const planned = (n) => addDays(sch.planned, 2 * (n - sch.next));
  $("week").hidden = false;
  $("week").innerHTML = `
    <div class="sheet-head"><button class="icon-btn" id="weekBack" aria-label="Terug">${icon("back")}</button><div><span class="mono muted">WEEK ${w.week}</span><h2 class="display">${esc(w.title)}</h2></div></div>
    <ol class="stops">${weekSessions(wn).map((s) => {
      const r = S.results[s.n], cur = s.n === sch.next;
      const info = r ? `${r.quiz_total ? `Quiz ${r.quiz_ok}/${r.quiz_total}` : "Klaar"}${r.mission_met === true ? " · missie gehaald" : r.mission_met === false ? " · missie niet gehaald" : ""}`
        : cur ? (sch.state === "due" ? "Vandaag" : dayLabelNl(sch.planned)) : s.n > sch.next ? "Rond " + dayLabelNl(planned(s.n)) : "";
      return `<li class="stop ${r ? "done" : ""} ${cur ? "next" : ""}"><span class="node">${r ? icon("check", 16) : s.n}</span>
        <div class="stop-card"><span class="mono muted">SESSIE ${s.n}</span><b>${esc(s.title)}</b><span class="small muted">${esc(info)}</span></div></li>`;
    }).join("")}</ol>
    ${weekPassed(wn) ? `<p class="center">Stempel "${esc(w.stamp)}" verdiend op ${esc(dayLabelNl(weekPassed(wn)))}.</p>` : `<p class="center muted">Na de laatste sessie volgt de weektoets (10 vragen, 70% voor de stempel).</p>`}`;
  $("weekBack").onclick = () => { $("week").hidden = true; $("week").innerHTML = ""; };
}
