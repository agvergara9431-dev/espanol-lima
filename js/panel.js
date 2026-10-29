// Augusto's panel: live progress, sessions with quiz/mission/test results, grammar accuracy, real minutes per day,
// sessions flagged when the closing quiz is below 60%, and Lucía's daily summary (never the chat itself).
import { icon } from "./icons.js";
import { passwordForm } from "./login.js";
import { t, L, getLang, shortDate, dateTime } from "./i18n.js";
import { $, esc, S, todayStr, addDays, parse, byKey, schedule, streak, totalXp, totalMin, TOTAL } from "./core.js";

export const panelActions = { viewAs() {}, logout() {}, setLang() {} };
const FLAG = 0.6;

export async function renderPanel() {
  const el = $("tab-panel");
  if (!el.dataset.built) {
    el.dataset.built = "1";
    const pw = passwordForm(), lang = getLang();
    el.innerHTML = `<div class="page">
      <div class="sec-head"><h2 class="display">${esc(t("p.title"))}</h2><span class="live mono"><i></i>${esc(t("p.live"))}</span></div>
      <p class="muted">${esc(t("p.sub"))}</p>
      <button class="btn ghost wide" id="viewAs">${icon("eye", 18)} ${esc(t("p.viewAs"))}</button>
      <div class="stats" id="pStats"></div>
      <p id="pWhere" class="where"></p>
      <div id="pFlags"></div>
      <h3 class="mono">${esc(t("p.today"))}</h3><div class="today" id="pToday"></div>
      <h3 class="mono">${esc(t("p.minutesChart"))}</h3><div class="days" id="pDays"></div>
      <h3 class="mono">${esc(t("p.sessions"))}</h3><div class="table-wrap"><table class="sess-table" id="pSessionsTable"></table></div>
      <h3 class="mono">${esc(t("p.tests"))}</h3><div class="list" id="pTests"></div>
      <h3 class="mono">${esc(t("p.grammar"))}</h3><div class="bars" id="pGrammar"></div>
      <h3 class="mono">${esc(t("p.lucia"))}</h3>
      <p class="small muted">${esc(t("p.luciaSub"))}</p>
      <div class="list" id="pLucia"></div>
      <button class="btn ghost wide" id="luciaTest">${icon("bell", 18)} ${esc(t("p.luciaTest"))}</button>
      <p class="status" id="luciaTestStatus"></p>
      <h3 class="mono">${esc(t("p.note"))}</h3>
      <textarea id="noteInput" maxlength="500" placeholder="${esc(t("p.notePh"))}"></textarea>
      <div class="row"><button class="btn" id="noteSave">${esc(t("p.noteSave"))}</button><span class="status" id="noteStatus"></span></div>
      <h3 class="mono">${esc(t("p.log"))}</h3><div class="list" id="pLog"></div>
      <h3 class="mono">${esc(t("p.weak"))}</h3><div class="chips" id="pWeak"></div>
      <h3 class="mono">${esc(t("p.strong"))}</h3><div class="chips" id="pStrong"></div>
      <h3 class="mono">${esc(t("p.dialogs"))}</h3><div id="pDialogs"></div>
      <h3 class="mono">${esc(t("p.account"))}</h3>
      <div class="set-row"><b>${esc(t("set.lang"))}</b><div class="seg" id="pLang"><button type="button" data-lang="nl" aria-pressed="${lang === "nl"}">Nederlands</button><button type="button" data-lang="en" aria-pressed="${lang === "en"}">English</button></div></div>
      ${pw.html}
      <button class="link small" id="logout">${icon("logout", 16)} ${esc(t("p.logout"))}</button></div>`;
    pw.bind();
    $("pLang").querySelectorAll("button").forEach((b) => (b.onclick = () => panelActions.setLang(b.dataset.lang)));
    $("viewAs").onclick = () => panelActions.viewAs();
    $("noteInput").value = S.note?.text || "";
    $("noteSave").onclick = async () => {
      try { await S.store.setNote($("noteInput").value.trim()); $("noteStatus").textContent = t("p.noteSaved"); }
      catch { $("noteStatus").textContent = t("p.noteFail"); }
    };
    $("logout").onclick = () => panelActions.logout();
    $("luciaTest").onclick = async () => {
      try { await S.store.saveSettings({ test_requested: true }); $("luciaTestStatus").textContent = t("p.luciaTestOk"); }
      catch { $("luciaTestStatus").textContent = t("p.luciaTestFail"); }
    };
    let tm = null;
    S.panelUnsub?.();
    S.panelUnsub = S.store.subscribe(S.store.learnerId, () => { clearTimeout(tm); tm = setTimeout(fillPanel, 300); });
  }
  await fillPanel();
}

const grammarTitle = (id) => { const g = S.grammar[id]; return !g ? id : getLang() === "en" ? g.en?.title || g.title_es : g.title; };

async function fillPanel() {
  if (!S.store.learnerId) { $("pStats").innerHTML = `<div class="stat wide"><span>${esc(t("p.never"))}</span></div>`; return; }
  let p;
  try { p = await S.store.panel(S.store.learnerId); } catch { $("pStats").innerHTML = `<div class="stat wide"><span>${esc(t("p.loadFail"))}</span></div>`; return; }
  const days = byKey(p.days, "day"), results = byKey(p.results, "n"), td = todayStr();
  const sch = schedule(results), st = streak(results);
  const res = Object.values(results).sort((a, b) => a.n - b.n);
  $("pStats").innerHTML = `<div class="stat"><b class="display">${st}</b><span>${esc(t(st === 1 ? "p.streak1" : "p.streak"))}</span></div><div class="stat"><b class="display">${totalXp(days)}</b><span>${esc(t("p.xp"))}</span></div><div class="stat"><b class="display">${Math.round(totalMin(days))}</b><span>${esc(t("p.minutes"))}</span></div>`;
  $("pWhere").textContent = sch.state === "finished" ? t("p.whereDone", { total: TOTAL() })
    : t("p.where", { n: sch.next, total: TOTAL() }) + (sch.state === "rest" ? t("p.whereRest", { date: shortDate(sch.planned) }) : sch.late ? t("p.whereLate", { n: sch.next, date: shortDate(sch.planned) }) : t("p.whereDue", { n: sch.next }));

  const flagged = res.filter((r) => r.quiz_total && r.quiz_ok / r.quiz_total < FLAG);
  $("pFlags").innerHTML = flagged.length ? `<div class="flags">${icon("alert", 18)}<div><b>${esc(t("p.flags"))}</b>${flagged.map((r) => `<p>${esc(t("p.flagRow", { n: r.n, title: L(S.sessions[r.n], "title") || "", ok: r.quiz_ok, total: r.quiz_total }))}</p>`).join("")}</div></div>` : "";

  const todayLog = p.sessions.filter((s) => new Date(s.ts).toDateString() === new Date().toDateString());
  $("pToday").innerHTML = todayLog.length ? todayLog.map((s) => `<div class="on"><span class="dot">${icon("check", 12)}</span>${esc(logLabel(s))}</div>`).join("") : `<div class="muted">${esc(t(sch.state === "rest" ? "p.todayRest" : "p.todayNone"))}</div>`;

  const maxM = Math.max(10, ...Array.from({ length: 14 }, (_, i) => Number(days[addDays(td, -i)]?.minutes || 0)));
  $("pDays").innerHTML = Array.from({ length: 14 }, (_, i) => { const k = addDays(td, i - 13), d = days[k], m = Number(d?.minutes || 0), on = !!d && (m > 0 || d.lessons > 0 || d.dialog); return `<div class="day ${on ? "on" : ""}" title="${k}: ${on ? Math.max(1, Math.round(m)) : 0} min"><i style="height:${Math.max(on ? 8 : 3, (m / maxM) * 100)}%"></i><span>${parse(k).getDate()}</span></div>`; }).join("");

  $("pSessionsTable").innerHTML = res.length ? `<thead><tr><th>${esc(t("p.col.n"))}</th><th>${esc(t("p.col.date"))}</th><th>${esc(t("p.col.quiz"))}</th><th>${esc(t("p.col.mission"))}</th><th>${esc(t("p.col.min"))}</th></tr></thead><tbody>${res.map((r) => {
    const low = r.quiz_total && r.quiz_ok / r.quiz_total < FLAG;
    const score = r.mission_score != null ? ` ${r.mission_score}/5` : "";
    const mis = r.mission_met === true ? "✓" + score : r.mission_met === false ? "✗" + score : "—";
    return `<tr class="${low ? "low" : ""}"><td>${r.n}</td><td>${esc(shortDate(r.done_on))}${r.on_time ? "" : ` <small class="late-tag">${esc(t("p.late"))}</small>`}</td><td>${r.quiz_total ? `${r.quiz_ok}/${r.quiz_total}` : "—"}</td><td title="${esc(r.detail?.mission?.goal || "")}">${mis}</td><td>${Math.round(Number(r.minutes || 0))}</td></tr>`;
  }).join("")}</tbody>` : `<tbody><tr><td class="muted">${esc(t("p.noSessions"))}</td></tr></tbody>`;

  const tests = res.flatMap((r) => (r.detail?.tests || []).map((x) => ({ ...x, on: r.done_on, n: r.n })));
  $("pTests").innerHTML = tests.length ? tests.map((x) => `<div class="item">${x.passed ? "✓" : "✗"} ${esc(t("p.testRow", { w: x.week, ok: x.ok, total: x.total, pct: Math.round((x.ok / x.total) * 100) }))}${esc(t(x.passed ? "p.testOk" : "p.testRetry"))}<small>${esc(t("p.testWhen", { date: shortDate(x.on), n: x.n }))}</small></div>`).join("") : `<div class="item muted">${esc(t("p.noTests"))}</div>`;

  const acc = {};
  for (const r of res) for (const [id, g] of Object.entries(r.detail?.grammar || {})) { const a = (acc[id] ||= { ok: 0, total: 0 }); a.ok += g.ok; a.total += g.total; }
  const rows = Object.entries(acc).sort(([a], [b]) => a.localeCompare(b));
  $("pGrammar").innerHTML = rows.length ? rows.map(([id, a]) => { const pct = Math.round((a.ok / a.total) * 100); return `<div class="bar-row ${pct < 60 ? "low" : ""}"><span>${esc(grammarTitle(id))}</span><div class="bar-track"><i style="width:${pct}%"></i></div><b>${pct}%</b><small>${a.ok}/${a.total}</small></div>`; }).join("") : `<div class="muted">${esc(t("p.noGrammar"))}</div>`;

  const daily = await S.store.chatDaily(S.store.learnerId).catch(() => []);
  $("pLucia").innerHTML = daily.length ? daily.map((d) => {
    const errs = (d.errors || []).sort((a, b) => b.count - a.count).slice(0, 4);
    return `<div class="item"><b>${esc(shortDate(d.day))}</b> · ${esc(d.messages === 1 ? t("p.luciaMsg1") : t("p.luciaMsgs", { n: d.messages }))}${d.topics?.length ? `<small>${esc(t("p.luciaTopics", { list: d.topics.join(", ") }))}</small>` : ""}${errs.length ? `<small>${esc(t("p.luciaErrors", { list: errs.map((e) => `${e.tag} (${e.count})`).join(", ") }))}</small>` : ""}</div>`;
  }).join("") : `<div class="item muted">${esc(t("p.luciaNone"))}</div>`;

  $("pLog").innerHTML = p.sessions.length ? p.sessions.map((s) => `<div class="item">${esc(logLabel(s))}<small>${dateTime(s.ts)}${s.detail?.dur ? ` · ${Math.max(1, Math.round(s.detail.dur / 60))} min` : ""}</small></div>`).join("") : `<div class="item muted">${esc(t("p.noLog"))}</div>`;

  const weak = [], strong = [];
  for (const c of p.cards) { if (c.ko > 0 && c.box <= 1) weak.push(c.es); else if (c.box >= 3) strong.push(c.es); }
  $("pWeak").innerHTML = weak.length ? weak.map((x) => `<span class="chip weak">${esc(x)}</span>`).join("") : `<span class="chip">${esc(t("p.none"))}</span>`;
  $("pStrong").innerHTML = strong.length ? strong.map((x) => `<span class="chip strong">${esc(x)}</span>`).join("") : `<span class="chip">${esc(t("p.none"))}</span>`;
  $("pDialogs").innerHTML = p.dialogs.length ? p.dialogs.map((d) => `<details class="item"><summary>${esc(d.scenario)} · ${dateTime(d.ts)}${d.feedback ? ` · ${d.feedback.goal_met === true ? esc(t("p.goalOk")) : d.feedback.goal_met === false ? esc(t("p.goalNo")) : ""} · ${esc(d.feedback.score)}/5` : ""}</summary>${d.feedback?.goal ? `<p class="small muted">${esc(t("p.goal", { goal: d.feedback.goal }))}</p>` : ""}<div class="chat">${(d.turns || []).map((x) => `<div class="msg ${x.role === "user" ? "me" : "them"}">${esc(x.content)}</div>`).join("")}</div>${d.feedback?.errors?.length ? `<ul class="fixes">${d.feedback.errors.map((e) => `<li><s>${esc(e.said)}</s> → <b>${esc(e.better)}</b></li>`).join("")}</ul>` : ""}</details>`).join("") : `<div class="item muted">${esc(t("p.noDialogs"))}</div>`;
}

function logLabel(s) {
  const x = s.detail || {};
  if (s.kind === "session") return t("log.session", { n: x.n, title: x.title || "", quiz: x.quiz }) + (x.mission === true ? t("log.mission.ok") : x.mission === false ? t("log.mission.no") : "") + (x.tests || []).map((tt) => t("log.test", { w: tt.week, ok: tt.ok, total: tt.total })).join("") + t("log.xp", { xp: x.xp });
  if (s.kind === "review") return t("log.review", { score: x.score, xp: x.xp });
  if (s.kind === "extra") return t("log.extra", { score: x.score, xp: x.xp });
  if (s.kind === "lesson") return t("log.lesson", { title: x.title || "", score: x.score });
  if (s.kind === "dialog") return t("log.dialog", { scenario: x.scenario, score: x.score || t("log.noScore") });
  return t("log.phrase", { text: x.text || "" });
}
