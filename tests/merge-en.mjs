// Merges the English layer (content/en/semana-N.en.json) into content/semana-N.json and checks it is complete:
// every session with content gets title_en, ex.en for every item, grammar.en with 5 exercises, and goal_en.
// Usage: node tests/merge-en.mjs 1 2 3
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve(import.meta.dirname, "../content");
for (const n of process.argv.slice(2)) {
  const file = `${dir}/semana-${n}.json`, layer = `${dir}/en/semana-${n}.en.json`;
  if (!existsSync(layer)) throw new Error("missing " + layer);
  const w = JSON.parse(readFileSync(file, "utf8")), en = JSON.parse(readFileSync(layer, "utf8"));
  w.title_en = en.title_en;
  for (const [k, sc] of Object.entries(w.scenarios || {})) { if (!en.scenarios?.[k]) throw new Error(`week ${n}: scenario ${k} has no English`); Object.assign(sc, en.scenarios[k]); }
  for (const s of w.sessions) {
    const e = en.sessions?.[s.n];
    if (!s.items) continue;
    if (!e) throw new Error(`week ${n}: session ${s.n} has no English`);
    s.title_en = e.title_en;
    for (const it of s.items) { if (!e.ex[it.id]) throw new Error(`session ${s.n}: no English example for ${it.id}`); it.ex.en = e.ex[it.id]; }
    if (e.grammar.exercises.length !== 5) throw new Error(`session ${s.n}: grammar.en needs 5 exercises`);
    for (const x of e.grammar.exercises) if ((x.type === "mc" || x.type === "fill") && !x.opts.includes(x.answer)) throw new Error(`session ${s.n}: answer not in options: ${x.prompt}`);
    s.grammar.en = e.grammar;
    s.mission.goal_en = e.goal_en;
  }
  writeFileSync(file, JSON.stringify(w, null, 2) + "\n", "utf8");
  console.log(`week ${n}: English merged`);
}
