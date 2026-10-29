// Structure check for every week file: catches content mistakes before they reach Claire.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const weeks = Array.from({ length: 7 }, (_, i) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../content/semana-${i + 1}.json`), "utf8")));
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:"']/g, "").trim();

test("24 sessions, numbered 1-24, in 7 weeks", () => {
  const ns = weeks.flatMap((w) => w.sessions.map((s) => s.n));
  expect(ns).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
});

test("item and grammar ids are unique across all weeks", () => {
  const items = weeks.flatMap((w) => w.sessions.flatMap((s) => (s.items || []).map((i) => i.id)));
  expect(new Set(items).size).toBe(items.length);
  const gs = weeks.flatMap((w) => w.sessions.filter((s) => s.grammar).map((s) => s.grammar.id));
  expect(new Set(gs).size).toBe(gs.length);
});

for (const w of weeks) {
  for (const s of w.sessions.filter((x) => x.items)) {
    test(`week ${w.week} session ${s.n} is complete and consistent`, () => {
      if (s.n !== 1) expect(s.items.length).toBeGreaterThanOrEqual(10);
      if (s.n !== 1) expect(s.items.length).toBeLessThanOrEqual(12);
      for (const it of s.items) {
        for (const k of ["id", "es", "nl", "en"]) expect(it[k], `${it.id} ${k}`).toBeTruthy();
        expect(it.ex?.es && it.ex?.nl, `${it.id} example`).toBeTruthy();
      }
      const g = s.grammar;
      expect(g.title && g.title_es && g.compare && g.explain.length && g.examples.length).toBeTruthy();
      expect(g.exercises.length).toBe(5);
      for (const ex of g.exercises) {
        expect(["mc", "fill", "type", "order"]).toContain(ex.type);
        if (ex.type === "mc" || ex.type === "fill") expect(ex.opts, `${g.id}: ${ex.prompt}`).toContain(ex.answer);
        if (ex.type === "fill") expect(ex.prompt).toContain("___");
        if (ex.opts) expect(new Set(ex.opts.map(norm)).size, `${g.id} duplicate options`).toBe(ex.opts.length);
      }
      expect(w.scenarios[s.mission.scenario], `mission scenario ${s.mission.scenario}`).toBeTruthy();
      expect(s.mission.goal && s.mission.check).toBeTruthy();
    });
  }
}
