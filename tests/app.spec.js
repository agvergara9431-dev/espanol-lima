// End-to-end check in iPhone size, mock backend (localStorage), no cloud involved.
// Flow: home -> quitting mid-lesson warns -> full lesson -> task shows "Klaar" -> Augusto's panel sees it, also live.
import { test, expect } from "@playwright/test";

const shots = "test-results/screens/";

async function answerAll(page) {
  for (let i = 0; i < 12; i++) {
    const body = page.locator("#lbody");
    if (await body.locator(".opt").count()) await body.locator(".opt").first().click();
    else if (await body.locator(".bank .tok").count()) await body.locator(".bank .tok").first().click();
    else await body.locator("#ans").fill("hola");
    await page.locator("#checkBtn").click(); // Controleren
    await expect(page.locator("#verdict")).toBeVisible();
    await page.locator("#checkBtn").click(); // Verder / Afronden
  }
}

test("Claire does a lesson and Augusto sees it", async ({ browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use });
  await ctx.route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
  const errors = [];
  const watch = (p, who) => { p.on("pageerror", (e) => errors.push(who + ": " + e.message)); p.on("console", (m) => m.type() === "error" && errors.push(who + ": " + m.text())); };

  const claire = await ctx.newPage(); watch(claire, "claire");
  await claire.goto("/index.html?mock=learner");
  await claire.evaluate(() => localStorage.clear());
  await claire.reload();

  // Home
  await expect(claire.getByText("PASAPORTE · ESPAÑOL")).toBeVisible();
  await expect(claire.locator("#homeName")).toHaveText("Claire");
  await expect(claire.locator("#homeStats")).toHaveText("0 dagen op rij · 0 XP");
  await expect(claire.locator("#tasks .task")).toHaveCount(3);
  await expect(claire.locator("#stamps .stamp")).toHaveCount(7);
  await expect(claire.locator("#board")).toHaveText("INSTAPPEN");
  await expect(claire.locator("#ticketDay")).toHaveText("INSTAPKAART · DAG 1");
  await expect(claire.locator("#ticketGate")).toHaveText("GATE W1");
  await expect(claire.locator('[data-task="dialog"]')).toContainText("taxichauffeur");
  await claire.screenshot({ path: shots + "1-home.png", fullPage: true });

  // Week route
  await claire.locator('#stamps [data-week="1"]').click();
  await expect(claire.locator("#week .stop")).toHaveCount(7);
  await expect(claire.locator("#week .stop.next")).toHaveCount(1);
  await claire.screenshot({ path: shots + "2-week.png" });
  await claire.locator("#weekBack").click();

  // Quit halfway: must warn first, and must not count
  await claire.locator("#board").click();
  await expect(claire.locator("#lesson")).toBeVisible();
  const body = claire.locator("#lbody");
  if (await body.locator(".opt").count()) await body.locator(".opt").first().click();
  else if (await body.locator(".bank .tok").count()) await body.locator(".bank .tok").first().click();
  else await body.locator("#ans").fill("hola");
  await claire.locator("#checkBtn").click();
  await claire.locator("#checkBtn").click();
  await claire.locator("#quitBtn").click();
  await expect(claire.locator("#verdict")).toContainText("telt alleen als je hem afmaakt");
  await claire.screenshot({ path: shots + "3-quit-warning.png" });
  await claire.locator("#quitBtn").click();
  await expect(claire.locator("#lesson")).toBeHidden();
  await expect(claire.locator('[data-task="lesson"]')).not.toHaveClass(/done/);

  // Full lesson
  await claire.locator("#board").click();
  await answerAll(claire);
  await expect(claire.locator("#finish")).toBeVisible();
  await expect(claire.locator("#finish .big")).toContainText("XP");
  await expect(claire.locator("#finish .stars svg")).toHaveCount(3);
  await claire.screenshot({ path: shots + "4-result.png" });
  await claire.locator("#checkBtn").click();
  await expect(claire.locator("#lesson")).toBeHidden();

  // Marked as done
  const lessonTask = claire.locator('[data-task="lesson"]');
  await expect(lessonTask).toHaveClass(/done/);
  await expect(lessonTask.locator(".klaar")).toHaveText("Klaar");
  await expect(claire.locator("#homeStats")).toContainText("1 dag op rij");
  await claire.screenshot({ path: shots + "5-home-after.png", fullPage: true });

  // Augusto's panel sees it
  const aug = await ctx.newPage(); watch(aug, "augusto");
  await aug.goto("/index.html?mock=owner");
  await expect(aug.locator("#homeName")).toHaveText("Augusto");
  await aug.locator('#nav [data-tab="panel"]').click();
  await expect(aug.locator("#pSessions")).toContainText("Lección · Begroeten");
  await expect(aug.locator("#pToday .on")).toContainText("Lección");
  await expect(aug.locator("#pDays .day.on")).toHaveCount(1);

  // Live: Claire sends the WhatsApp phrase, panel updates without reload
  await claire.bringToFront();
  await claire.locator('[data-task="phrase"]').click();
  await expect(claire.locator('[data-task="phrase"]')).toHaveClass(/done/);
  await expect(aug.locator("#pSessions")).toContainText("Frase por WhatsApp", { timeout: 5000 });
  await aug.bringToFront();
  await aug.screenshot({ path: shots + "6-panel.png", fullPage: true });

  // Note from Augusto reaches Claire
  await aug.locator("#noteInput").fill("¡Muy bien, amor! Sigue así.");
  await aug.locator("#noteSave").click();
  await expect(aug.locator("#noteStatus")).toHaveText("Guardada.");
  await expect(claire.locator("#augNote")).toContainText("Sigue así", { timeout: 5000 });

  // Ver como Claire
  await aug.locator("#viewAs").click();
  await expect(aug.locator("#homeName")).toHaveText("Claire");
  await expect(aug.locator(".banner")).toContainText("solo lectura");
  await expect(aug.locator('[data-task="lesson"]')).toHaveClass(/done/);
  await expect(aug.locator('#nav [data-tab="panel"]')).toHaveCount(0);
  await aug.locator("#backToMe").click();
  await expect(aug.locator("#pStats")).toBeVisible();

  // Dark mode renders
  await claire.emulateMedia({ colorScheme: "dark" });
  await claire.reload();
  await expect(claire.locator("#homeName")).toBeVisible();
  const bg = await claire.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(20, 22, 29)");
  await claire.screenshot({ path: shots + "7-home-dark.png", fullPage: true });

  // Dialog with mock AI, then panel shows the full dialog with corrections
  await claire.locator('#nav [data-tab="chat"]').click();
  await claire.locator('[data-sc="taxi"]').click();
  await claire.locator("#chatInput").fill("Hola, me llamo Claire");
  await claire.locator("#sendBtn").click();
  await expect(claire.locator("#chat .msg.them")).toHaveCount(2);
  await claire.locator("#endBtn").click();
  await expect(claire.locator("#feedback")).toContainText("Goed gedaan");
  await claire.screenshot({ path: shots + "8-dialog.png", fullPage: true });
  await expect(aug.locator("#pDialogs")).toContainText("Taxi in Lima", { timeout: 5000 });

  expect(errors).toEqual([]);
  await ctx.close();
});

test("weeks follow completed days, not the calendar", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/index.html?mock=learner");
  // Seed: lessons done on 7 earlier days with gaps (calendar says nothing; progress says week 2).
  await page.evaluate(() => {
    const id = "00000000-0000-0000-0000-00000000000c", pad = (n) => String(n).padStart(2, "0");
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    const rows = [3, 5, 6, 9, 12, 13, 20].map((n) => ({ user_id: id, day: day(n), lessons: 1, dialog: false, phrase: false, minutes: 5, xp: 50 }));
    rows.push({ user_id: id, day: day(30), lessons: 0, dialog: false, phrase: true, minutes: 0, xp: 0 }); // not a completed day
    localStorage.setItem("mockdb-v1", JSON.stringify({ progress_days: rows }));
  });
  await page.reload();
  await expect(page.locator("#ticketGate")).toHaveText("GATE W2");
  await expect(page.locator("#ticketDay")).toHaveText("INSTAPKAART · DAG 1");
  await expect(page.locator("#waiting")).toContainText("Week 2 komt eraan");
  await expect(page.locator("#homeStats")).toContainText("350 XP");
  await expect(page.locator("#daysLeft")).toHaveText(String(Math.round((new Date(2026, 11, 15) - new Date(new Date().toDateString())) / 86400000)));
  expect(errors).toEqual([]);
});
