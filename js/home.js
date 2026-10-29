// Route (home): stats row, a short card for today, and a dotted route winding from Amsterdam to Lima through
// 24 session stops, with a stamp stop at the end of each week. Paspoort: the collection of earned stamps.
import { CONFIG } from "./config.js";
import { icon } from "./icons.js";
import { t, L, dayLabel } from "./i18n.js";
import {
  $, esc, S, isOwner, todayStr, addDays, between, stampDate, schedule, streak, totalXp, sessionReady,
  weekSessions, testsFor, weekPassed, itemsUpTo,
} from "./core.js";
import { savedRun } from "./session.js";

export const actions = { session() {}, review() {}, extra() {}, backToOwner() {}, passport() {} };
const ROW = 136, TOP = 70;
const plane = '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';
const star = '<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--gold)" stroke="var(--gold-ink)" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/></svg>';
const total = () => Object.keys(S.sessions).length;

export function renderHome() {
  const td = todayStr(), sch = schedule(), st = streak();
  const left = Math.max(0, between(td, CONFIG.TRIP));
  const note = S.note?.text;
  $("tab-home").innerHTML = `
    <div class="page home">
      <div class="home-top">
      <div class="stats-row">
        <span class="streak" title="${esc(t("home.streak"))}">${icon("flame", 20)}<b id="streakN">${st}</b></span>
        <span class="xp">${star}<b id="xpN">${totalXp(S.days)} XP</b></span>
        <span class="pill-days" id="daysLeft">${left === 1 ? t("home.day") : t("home.days", { n: left })}</span>
      </div>
      ${S.readonly ? `<div class="banner">${icon("eye", 18)}<span>${esc(t("home.readonly"))}</span><button class="link" id="backToMe">${esc(t("home.back"))}</button></div>` : ""}
      ${todayCard(sch)}
      </div>
      ${note ? `<div class="note" id="augNote"><small class="mono">${esc(t("home.note"))}</small>${esc(note)}</div>` : ""}
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
  const extras = `<div class="row tight"><button class="btn ghost" id="reviewBtn">${icon("words", 18)} ${esc(t("home.review"))}</button><button class="btn ghost" id="extraBtn">${icon("flame", 18)} ${esc(t("home.extra"))}</button></div>`;
  if (sch.state === "finished") return `<section class="today-card"><div class="tile">${plane}</div><div class="tc-text"><b class="display" id="todayTitle">${esc(t("home.finished.title"))}</b><span>${esc(t("home.finished.sub", { n: sch.doneCount }))}</span></div></section>${extras}`;
  if (sch.state === "rest") {
    const doneToday = sch.last && sch.last.done_on === todayStr();
    return `<section class="today-card rest"><div class="tile rest-tile">${icon("check", 26)}</div><div class="tc-text"><b class="display" id="todayTitle">${esc(t("home.rest.title"))}</b>
      <span id="nextSession">${doneToday ? esc(t("home.rest.done", { n: sch.last.n })) : ""}${esc(t("home.rest.next", { date: dayLabel(sch.planned) }))}</span></div></section>${extras}`;
  }
  const s = S.sessions[sch.next];
  if (!sessionReady(sch.next)) return `<section class="today-card rest"><div class="tile">${plane}</div><div class="tc-text"><b class="display" id="todayTitle">${esc(t("home.coming.title", { n: sch.next }))}</b><span>${esc(t("home.coming.sub"))}</span></div></section>${extras}`;
  const resume = savedRun();
  const week = S.weeks.find((w) => w.week === s.week);
  const tests = testsFor(sch.next);
  return `<button class="today-card due" id="todayCard" ${S.readonly ? "disabled" : ""}><span class="tile">${plane}</span><span class="tc-text"><b class="display" id="todayTitle">${esc(t("home.due.title", { w: s.week, title: L(week, "title") }))}</b>
    <span id="todaySub">${esc(t("home.due.sub", { n: sch.next, total: total(), title: L(s, "title") }))}${tests.length ? esc(t("home.due.test")) : ""}</span>
    ${sch.late ? `<span class="late" id="late">${esc(t("home.late", { date: dayLabel(sch.planned) }))}</span>` : ""}
    ${resume ? `<span class="late">${esc(t("home.resume"))}</span>` : ""}</span></button>`;
}

// Max XP of the next session: every exercise right, mission met, perfect quiz, weekly test passed.
function maxXp(n) {
  const s = S.sessions[n];
  const due = itemsUpTo(n - 1).filter((it) => S.cards[it.id] && S.cards[it.id].due <= todayStr()).length;
  return 10 * (Math.min(due, 12) + 5 + s.items.length + 5) + 80 + 200 * testsFor(n).length;
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
      return `<button class="r-stamp ${passed ? "earned" : ""}" style="${pos}" data-stamp="${nd.w.week}" aria-label="${esc(t("route.stamp", { w: nd.w.week }))}"><span class="seal">${passed ? `<b>${esc(nd.w.stamp)}</b><small>${stampDate(passed)}</small>` : `<small>${esc(t("route.week", { w: nd.w.week }))}</small><b>${esc(nd.w.stamp)}</b>`}</span></button>`;
    }
    const n = nd.s.n, done = S.results[n], cur = n === sch.next && sch.state !== "finished";
    const cls = done ? "done" : cur ? "cur" : "locked";
    const inner = done ? icon("check", 30) : cur ? plane : icon("lock", 24);
    const title = L(nd.s, "title");
    let btn = "";
    if (cur) {
      const side = xs[i] > 50 ? "left" : "right";
      const label = sch.state === "due" && sessionReady(n) ? (resume ? t("home.continue") : t("home.start", { xp: maxXp(n) })) : sch.state === "rest" ? t("home.on", { day: dayLabel(sch.planned).split(" ")[0] }) : t("home.soon");
      btn = `<button class="start-btn ${side}" id="startBtn" ${sch.state === "due" && sessionReady(n) && !S.readonly ? "" : "disabled"}>${esc(label)}</button>`;
    }
    return `<div class="r-node ${cls}" style="${pos}" ${cur ? 'id="curNode"' : ""}><button class="r-dot" data-week="${nd.week}" aria-label="${esc(t("route.session", { n, title }))}">${inner}</button><span class="r-label">${esc(title)}</span>${btn}</div>`;
  }).join("");
  return `<svg class="r-path" viewBox="0 0 100 ${H}" preserveAspectRatio="none" style="height:${H}px" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--sand)" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    <span class="r-city top">${esc(t("route.from"))}</span>${html}<span class="r-city bottom" style="top:${H - 24}px">${esc(t("route.to"))}</span>
    <div style="height:${H}px"></div>`;
}

export function renderPassport() {
  const earned = S.weeks.filter((w) => weekPassed(w.week)).length;
  $("tab-passport").innerHTML = `<div class="page">
    <div class="sec-head"><h2 class="display">${esc(t("passport.title"))}</h2><span class="muted small" id="stampCount">${esc(t("passport.count", { n: earned, total: S.weeks.length }))}</span></div>
    <p class="muted">${esc(t("passport.intro"))}</p>
    <div class="stamp-book">${S.weeks.map((w) => {
      const passed = weekPassed(w.week);
      return `<div class="book-stamp ${passed ? "earned" : ""}" data-week="${w.week}"><span class="seal">${passed ? `<small>SEMANA ${w.week}</small><b>${esc(w.stamp)}</b><small>${stampDate(passed)}</small>` : `<small>${esc(t("route.week", { w: w.week }))}</small><b>${esc(w.stamp)}</b>`}</span><span class="bs-title">${esc(L(w, "title"))}</span><span class="bs-status">${esc(passed ? t("passport.earned", { date: dayLabel(passed) }) : t("passport.not"))}</span></div>`;
    }).join("")}</div></div>`;
}

function openWeek(wn) {
  const w = S.weeks.find((x) => x.week === wn), sch = schedule();
  const planned = (n) => addDays(sch.planned, 2 * (n - sch.next));
  $("week").hidden = false;
  $("week").innerHTML = `
    <div class="sheet-head"><button class="icon-btn" id="weekBack" aria-label="${esc(t("btn.back"))}">${icon("back")}</button><div><span class="mono muted">${esc(t("route.week", { w: w.week }))}</span><h2 class="display">${esc(L(w, "title"))}</h2></div></div>
    <ol class="stops">${weekSessions(wn).map((s) => {
      const r = S.results[s.n], cur = s.n === sch.next;
      const info = r ? `${r.quiz_total ? t("week.quiz", { ok: r.quiz_ok, total: r.quiz_total }) : t("week.done")}${r.mission_met === true ? t("week.mission.ok") : r.mission_met === false ? t("week.mission.no") : ""}`
        : cur ? (sch.state === "due" ? t("week.today") : dayLabel(sch.planned)) : s.n > sch.next ? t("week.around", { date: dayLabel(planned(s.n)) }) : "";
      return `<li class="stop ${r ? "done" : ""} ${cur ? "next" : ""}"><span class="node">${r ? icon("check", 16) : s.n}</span>
        <div class="stop-card"><span class="mono muted">${esc(t("week.session", { n: s.n }))}</span><b>${esc(L(s, "title"))}</b><span class="small muted">${esc(info)}</span></div></li>`;
    }).join("")}</ol>
    <p class="center ${weekPassed(wn) ? "" : "muted"}">${esc(weekPassed(wn) ? t("week.stamp", { stamp: w.stamp, date: dayLabel(weekPassed(wn)) }) : t("week.test"))}</p>`;
  $("weekBack").onclick = () => { $("week").hidden = true; $("week").innerHTML = ""; };
}
export const viewName = () => (S.readonly || !isOwner() ? CONFIG.NAMES.learner : CONFIG.NAMES.owner);
