// Route (home): stats row, a short card for today, and a dotted route winding from Amsterdam to Lima through
// 24 session stops, with a stamp stop at the end of each week. Paspoort: the collection of earned stamps.
import { CONFIG } from "./config.js";
import { icon } from "./icons.js";
import {
  $, esc, S, isOwner, todayStr, addDays, between, dayLabelNl, stampDate, schedule, streak, totalXp, sessionReady,
  weekSessions, testsFor, weekPassed, itemsUpTo,
} from "./core.js";
import { savedRun } from "./session.js";

export const actions = { session() {}, review() {}, extra() {}, backToOwner() {}, passport() {} };
const ROW = 136, TOP = 70;
const plane = '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';
const star = '<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--gold)" stroke="var(--gold-ink)" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/></svg>';

export function renderHome() {
  const t = todayStr(), sch = schedule(), st = streak();
  const left = Math.max(0, between(t, CONFIG.TRIP));
  const note = S.note?.text;
  $("tab-home").innerHTML = `
    <div class="page home">
      <div class="home-top">
      <div class="stats-row">
        <span class="streak" title="Sessies op tijd achter elkaar">${icon("flame", 20)}<b id="streakN">${st}</b></span>
        <span class="xp">${star}<b id="xpN">${totalXp(S.days)} XP</b></span>
        <span class="pill-days" id="daysLeft">${left} ${left === 1 ? "dag" : "dagen"} tot Lima</span>
      </div>
      ${S.readonly ? `<div class="banner">${icon("eye", 18)}<span>Vista de Claire, solo lectura. Lo que hagas aquí no se guarda.</span><button class="link" id="backToMe">Volver</button></div>` : ""}
      ${todayCard(sch)}
      </div>
      ${note ? `<div class="note" id="augNote"><small class="mono">Berichtje van Augusto</small>${esc(note)}</div>` : ""}
      <div class="route-map" id="routeMap">${routeMap(sch)}</div>
    </div>`;
  $("backToMe")?.addEventListener("click", () => actions.backToOwner());
  $("todayCard")?.addEventListener("click", () => actions.session());
  $("startBtn")?.addEventListener("click", (e) => { e.stopPropagation(); actions.session(); });
  $("reviewBtn")?.addEventListener("click", () => actions.review());
  $("extraBtn")?.addEventListener("click", () => actions.extra());
  $("routeMap").querySelectorAll("[data-week]").forEach((b) => (b.onclick = () => openWeek(+b.dataset.week)));
  $("routeMap").querySelectorAll("[data-stamp]").forEach((b) => (b.onclick = () => actions.passport()));
  requestAnimationFrame(() => $("curNode")?.scrollIntoView({ block: "center" }));
}

function todayCard(sch) {
  const t = todayStr();
  const extras = `<div class="row tight"><button class="btn ghost" id="reviewBtn">${icon("words", 18)} Herhalen</button><button class="btn ghost" id="extraBtn">${icon("flame", 18)} Extra oefenen</button></div>`;
  if (sch.state === "finished") return `<section class="today-card"><div class="tile">${plane}</div><div class="tc-text"><b class="display" id="todayTitle">¡Buen viaje!</b><span>Alle ${sch.doneCount} sessies zijn klaar.</span></div></section>${extras}`;
  if (sch.state === "rest") {
    const doneToday = sch.last && sch.last.done_on === t;
    return `<section class="today-card rest"><div class="tile rest-tile">${icon("check", 26)}</div><div class="tc-text"><b class="display" id="todayTitle">Rustdag</b>
      <span id="nextSession">${doneToday ? `Sessie ${sch.last.n} is klaar. ` : ""}Volgende sessie: ${esc(dayLabelNl(sch.planned))}</span></div></section>
      ${extras}`;
  }
  const s = S.sessions[sch.next];
  if (!sessionReady(sch.next)) return `<section class="today-card rest"><div class="tile">${plane}</div><div class="tc-text"><b class="display" id="todayTitle">Sessie ${sch.next} komt eraan</b><span>Augusto zet hem zo klaar.</span></div></section>${extras}`;
  const resume = savedRun();
  const week = S.weeks.find((w) => w.week === s.week);
  const tests = testsFor(sch.next);
  return `<button class="today-card due" id="todayCard" ${S.readonly ? "disabled" : ""}><span class="tile">${plane}</span><span class="tc-text"><b class="display" id="todayTitle">Week ${s.week} · ${esc(week.title)}</b>
    <span id="todaySub">Sessie ${sch.next} van ${Object.keys(S.sessions).length} · ${esc(s.title)} · ±30 min${tests.length ? " · met weektoets" : ""}</span>
    ${sch.late ? `<span class="late" id="late">Gepland op ${esc(dayLabelNl(sch.planned))}. Geen probleem: doe hem vandaag, de planning schuift mee.</span>` : ""}
    ${resume ? '<span class="late">Je was al begonnen. Je gaat verder waar je was.</span>' : ""}</span></button>`;
}

// Max XP of the next session: every exercise right, mission met, perfect quiz, weekly test passed.
function maxXp(n) {
  const s = S.sessions[n];
  const due = itemsUpTo(n - 1).filter((it) => S.cards[it.id] && S.cards[it.id].due <= todayStr()).length;
  return 10 * (Math.min(due, 12) + 5 + s.items.length + 5) + 80 + 100 * testsFor(n).length + 10 * 10 * testsFor(n).length;
}

function routeMap(sch) {
  const nodes = [];
  for (const w of S.weeks) { for (const s of weekSessions(w.week)) nodes.push({ type: "session", s, week: w.week }); nodes.push({ type: "stamp", w }); }
  const xs = nodes.map((_, i) => 50 + 28 * Math.sin(i * 0.9 + 0.4));
  const ys = nodes.map((_, i) => TOP + i * ROW);
  const H = TOP + nodes.length * ROW + 40;
  const pts = [[50, 24], ...xs.map((x, i) => [x, ys[i]]), [50, H - 24]];
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) { // Catmull-Rom to cubic Bézier: a smooth line through every stop
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }
  const resume = savedRun();
  const html = nodes.map((nd, i) => {
    const pos = `left:${xs[i]}%;top:${ys[i]}px`;
    if (nd.type === "stamp") {
      const passed = weekPassed(nd.w.week);
      return `<button class="r-stamp ${passed ? "earned" : ""}" style="${pos}" data-stamp="${nd.w.week}" aria-label="Stempel week ${nd.w.week}"><span class="seal">${passed ? `<b>${esc(nd.w.stamp)}</b><small>${stampDate(passed)}</small>` : `<small>Week ${nd.w.week}</small><b>${esc(nd.w.stamp)}</b>`}</span></button>`;
    }
    const n = nd.s.n, done = S.results[n], cur = n === sch.next && sch.state !== "finished";
    const cls = done ? "done" : cur ? "cur" : "locked";
    const inner = done ? icon("check", 30) : cur ? plane : icon("lock", 24);
    let btn = "";
    if (cur) {
      const side = xs[i] > 50 ? "left" : "right";
      const label = sch.state === "due" && sessionReady(n) ? (resume ? "VERDER" : `START · tot +${maxXp(n)} XP`) : sch.state === "rest" ? "Op " + dayLabelNl(sch.planned).split(" ").slice(0, 1)[0] : "Bijna klaar";
      btn = `<button class="start-btn ${side}" id="startBtn" ${sch.state === "due" && sessionReady(n) && !S.readonly ? "" : "disabled"}>${esc(label)}</button>`;
    }
    return `<div class="r-node ${cls}" style="${pos}" ${cur ? 'id="curNode"' : ""}><button class="r-dot" data-week="${nd.week}" aria-label="Sessie ${n}: ${esc(nd.s.title)}">${inner}</button><span class="r-label">${esc(nd.s.title)}</span>${btn}</div>`;
  }).join("");
  return `<svg class="r-path" viewBox="0 0 100 ${H}" preserveAspectRatio="none" style="height:${H}px" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--sand)" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    <span class="r-city top">Amsterdam</span>${html}<span class="r-city bottom" style="top:${H - 24}px">Lima</span>
    <div style="height:${H}px"></div>`;
}

export function renderPassport() {
  const earned = S.weeks.filter((w) => weekPassed(w.week)).length;
  $("tab-passport").innerHTML = `<div class="page">
    <div class="sec-head"><h2 class="display">Paspoort</h2><span class="muted small" id="stampCount">${earned} van ${S.weeks.length} stempels</span></div>
    <p class="muted">Elke week eindigt met een toets. Met 70% of meer krijg je de stempel.</p>
    <div class="stamp-book">${S.weeks.map((w) => {
      const passed = weekPassed(w.week);
      return `<div class="book-stamp ${passed ? "earned" : ""}" data-week="${w.week}"><span class="seal">${passed ? `<small>SEMANA ${w.week}</small><b>${esc(w.stamp)}</b><small>${stampDate(passed)}</small>` : `<small>Week ${w.week}</small><b>${esc(w.stamp)}</b>`}</span><span class="bs-title">${esc(w.title)}</span><span class="bs-status">${passed ? "Verdiend op " + esc(dayLabelNl(passed)) : "Nog niet"}</span></div>`;
    }).join("")}</div></div>`;
}

function openWeek(wn) {
  const w = S.weeks.find((x) => x.week === wn), sch = schedule();
  const planned = (n) => addDays(sch.planned, 2 * (n - sch.next));
  $("week").hidden = false;
  $("week").innerHTML = `
    <div class="sheet-head"><button class="icon-btn" id="weekBack" aria-label="Terug">${icon("back")}</button><div><span class="mono muted">Week ${w.week}</span><h2 class="display">${esc(w.title)}</h2></div></div>
    <ol class="stops">${weekSessions(wn).map((s) => {
      const r = S.results[s.n], cur = s.n === sch.next;
      const info = r ? `${r.quiz_total ? `Quiz ${r.quiz_ok}/${r.quiz_total}` : "Klaar"}${r.mission_met === true ? " · missie gehaald" : r.mission_met === false ? " · missie niet gehaald" : ""}`
        : cur ? (sch.state === "due" ? "Vandaag" : dayLabelNl(sch.planned)) : s.n > sch.next ? "Rond " + dayLabelNl(planned(s.n)) : "";
      return `<li class="stop ${r ? "done" : ""} ${cur ? "next" : ""}"><span class="node">${r ? icon("check", 16) : s.n}</span>
        <div class="stop-card"><span class="mono muted">Sessie ${s.n}</span><b>${esc(s.title)}</b><span class="small muted">${esc(info)}</span></div></li>`;
    }).join("")}</ol>
    ${weekPassed(wn) ? `<p class="center">Stempel "${esc(w.stamp)}" verdiend op ${esc(dayLabelNl(weekPassed(wn)))}.</p>` : `<p class="center muted">Na de laatste sessie volgt de weektoets (10 vragen, 70% voor de stempel).</p>`}`;
  $("weekBack").onclick = () => { $("week").hidden = true; $("week").innerHTML = ""; };
}
export const viewName = () => (S.readonly || !isOwner() ? CONFIG.NAMES.learner : CONFIG.NAMES.owner);
