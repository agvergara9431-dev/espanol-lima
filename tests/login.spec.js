// Login screen with the real Supabase client, but the /otp call is intercepted: no mail is ever sent.
// Checks email normalization, the concrete error per Supabase error code, and that translation is off.
import { test, expect } from "@playwright/test";

const cases = [
  { status: 422, body: { code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" }, text: "geen toegang", code: "otp_disabled" },
  { status: 429, body: { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 37 seconds." }, text: "over 37 seconden", code: "over_email_send_rate_limit" },
  { status: 422, body: { code: 422, error_code: "email_provider_disabled", msg: "Email logins are disabled" }, text: "Inloggen met e-mail staat uit", code: "email_provider_disabled" },
];

test("translation is disabled", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("html")).toHaveAttribute("translate", "no");
  await expect(page.locator('meta[name="google"]')).toHaveAttribute("content", "notranslate");
});

for (const c of cases) {
  test(`shows the concrete reason for ${c.code}`, async ({ page }) => {
    await page.route("**/auth/v1/otp**", (r) => r.fulfill({ status: c.status, contentType: "application/json", body: JSON.stringify(c.body) }));
    await page.goto("/index.html");
    await page.locator("#email").fill("someone@example.com");
    await page.locator("#loginBtn").click();
    await expect(page.locator("#loginStatus")).toContainText(c.text);
    await expect(page.locator("#loginStatus .err-code")).toContainText(c.code);
    await expect(page.locator("#loginBtn")).toBeEnabled();
  });
}

test("normalizes the email before sending and then asks for the link", async ({ page }) => {
  let sent = null;
  await page.route("**/auth/v1/otp**", (r) => { sent = JSON.parse(r.request().postData()); r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
  await page.goto("/index.html");
  await page.locator("#email").fill("  Agvergara9431@Gmail.COM ");
  await page.locator("#loginBtn").click();
  await expect(page.locator("#pasteForm")).toBeVisible();
  expect(sent.email).toBe("agvergara9431@gmail.com");
  expect(sent.create_user).toBe(false);
  await expect(page.locator("#email")).toHaveValue("agvergara9431@gmail.com");

  // A pasted text that is not a mail link gives a concrete reason too.
  await page.locator("#paste").fill("hallo");
  await page.locator("#pasteBtn").click();
  await expect(page.locator("#loginStatus .err-code")).toBeVisible();
});
