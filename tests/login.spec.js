// Login with email + password. The Supabase token call is intercepted: no real password is ever used here.
// Checks normalization, the concrete error per Supabase error code, translation off, and the change-password form.
import { test, expect } from "@playwright/test";

const cases = [
  { status: 400, body: { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, text: "klopt niet", code: "invalid_credentials" },
  { status: 429, body: { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" }, text: "Te veel pogingen", code: "over_request_rate_limit" },
  { status: 422, body: { code: 422, error_code: "email_provider_disabled", msg: "Email logins are disabled" }, text: "Inloggen met e-mail staat uit", code: "email_provider_disabled" },
];

test("translation is disabled and there is no magic link anymore", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("html")).toHaveAttribute("translate", "no");
  await expect(page.locator('meta[name="google"]')).toHaveAttribute("content", "notranslate");
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("#paste")).toHaveCount(0);
  await expect(page.locator("#login")).not.toContainText("link");
});

for (const c of cases) {
  test(`shows the concrete reason for ${c.code}`, async ({ page }) => {
    await page.route("**/auth/v1/token**", (r) => r.fulfill({ status: c.status, contentType: "application/json", body: JSON.stringify(c.body) }));
    await page.goto("/index.html");
    await page.locator("#email").fill("someone@example.com");
    await page.locator("#password").fill("mango playa sol 27");
    await page.locator("#loginBtn").click();
    await expect(page.locator("#loginStatus")).toContainText(c.text);
    await expect(page.locator("#loginStatus .err-code")).toContainText(c.code);
    await expect(page.locator("#loginBtn")).toBeEnabled();
  });
}

test("normalizes the email and sends email + password to Supabase", async ({ page }) => {
  let sent = null, url = "";
  await page.route("**/auth/v1/token**", (r) => { url = r.request().url(); sent = JSON.parse(r.request().postData()); r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error_code: "invalid_credentials", msg: "x" }) }); });
  await page.goto("/index.html");
  await page.locator("#email").fill("  Agvergara9431@Gmail.COM ");
  await page.locator("#password").fill(" mango playa sol 27 ");
  await page.locator("#pwToggle").click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.locator("#loginBtn").click();
  await expect(page.locator("#loginStatus .err-code")).toBeVisible();
  expect(url).toContain("grant_type=password");
  expect(sent.email).toBe("agvergara9431@gmail.com");
  expect(sent.password).toBe("mango playa sol 27");
});

test("change password from Lucía's settings (Dutch) and from the panel (Spanish)", async ({ page, context }) => {
  await page.goto("/index.html?mock=learner");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#nav [data-tab="lucia"]').click();
  await page.locator("#luciaSettings").click();
  await page.locator("#pwNew").fill("kort");
  await page.locator("#pwRep").fill("kort");
  await page.locator("#pwSave").click();
  await expect(page.locator("#pwStatus")).toHaveText("Gebruik minstens 8 tekens.");
  await page.locator("#pwNew").fill("tulpen fiets regen 42");
  await page.locator("#pwRep").fill("tulpen fiets regen 24");
  await page.locator("#pwSave").click();
  await expect(page.locator("#pwStatus")).toHaveText("De twee wachtwoorden zijn niet hetzelfde.");
  await page.locator("#pwRep").fill("tulpen fiets regen 42");
  await page.locator("#pwSave").click();
  await expect(page.locator("#pwStatus")).toHaveText("Wachtwoord gewijzigd.");
  const aug = await context.newPage();
  await aug.goto("/index.html?mock=owner");
  await aug.locator('#nav [data-tab="panel"]').click();
  await expect(aug.locator("#pwForm")).toContainText("Cambiar mi contraseña");
});
