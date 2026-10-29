// Login with email and password (the magic link did not work on iPhone: Gmail's link preview used it up).
// Also the shared "change password" form, used in Lucía's settings and in the panel.
import { $, esc, S } from "./core.js";
import { icon } from "./icons.js";
import { t } from "./i18n.js";

export function renderLogin(msg) {
  $("app").hidden = true; $("login").hidden = false;
  $("login").innerHTML = `<div class="login-card">
    <span class="mono">${esc(t("login.app"))}</span>
    <h1 class="display">${esc(t("login.title"))}</h1>
    <p>${esc(t("login.intro"))}</p>
    <form id="loginForm">
      <label for="email" class="mono">${esc(t("login.email"))}</label>
      <input id="email" type="email" required autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false">
      <label for="password" class="mono">${esc(t("login.password"))}</label>
      <div class="pw-row"><input id="password" type="password" required autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false"><button type="button" class="icon-btn" id="pwToggle" aria-label="${esc(t("login.show"))}">${icon("eye", 20)}</button></div>
      <button class="btn wide" id="loginBtn">${esc(t("login.btn"))}</button>
    </form>
    <p class="status" id="loginStatus">${esc(msg || "")}</p>
    <p class="small muted">${esc(t("login.forgot"))}</p></div>`;
  $("pwToggle").onclick = () => { const p = $("password"); p.type = p.type === "password" ? "text" : "password"; $("pwToggle").setAttribute("aria-label", t(p.type === "password" ? "login.show" : "login.hide")); };
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = normEmail($("email").value);
    $("email").value = email;
    $("loginBtn").disabled = true; $("loginStatus").textContent = t("login.wait");
    try { await S.store.signIn(email, $("password").value.trim()); location.reload(); }
    catch (err) { console.warn("signIn failed", err); showError("loginStatus", err); $("loginBtn").disabled = false; }
  };
}

// Change password, in the interface language.
export function passwordForm() {
  const html = `<form class="set-row pw-form" id="pwForm"><b>${esc(t("pw.title"))}</b>
    <input id="pwNew" type="password" autocomplete="new-password" placeholder="${esc(t("pw.new"))}" autocapitalize="none" autocorrect="off" spellcheck="false">
    <input id="pwRep" type="password" autocomplete="new-password" placeholder="${esc(t("pw.repeat"))}" autocapitalize="none" autocorrect="off" spellcheck="false">
    <button class="btn" id="pwSave">${esc(t("pw.save"))}</button><p class="status" id="pwStatus"></p></form>`;
  const bind = () => {
    $("pwForm").onsubmit = async (e) => {
      e.preventDefault();
      const a = $("pwNew").value.trim(), b = $("pwRep").value.trim();
      if (a.length < 8) { $("pwStatus").textContent = t("pw.short"); return; }
      if (a !== b) { $("pwStatus").textContent = t("pw.diff"); return; }
      $("pwSave").disabled = true;
      try { await S.store.changePassword(a); $("pwStatus").textContent = t("pw.ok"); $("pwNew").value = $("pwRep").value = ""; }
      catch (err) { console.warn(err); $("pwStatus").textContent = t("pw.fail") + (err?.code ? ` (${err.code})` : ""); }
      $("pwSave").disabled = false;
    };
  };
  return { html, bind };
}

// Trim, drop invisible/inner spaces (iOS sometimes adds them) and lowercase.
const normEmail = (s) => String(s || "").normalize("NFKC").replace(/[\s​-‍﻿]/g, "").toLowerCase();
// Concrete reason from Supabase's error code, plus the code itself so Augusto can look it up.
const KNOWN = ["invalid_credentials", "email_address_invalid", "validation_failed", "user_banned", "over_request_rate_limit", "email_provider_disabled", "network"];
function showError(id, err) {
  const code = err?.code || (err?.status === 429 ? "over_request_rate_limit" : err?.name === "AuthRetryableFetchError" || err?.status === 0 ? "network" : "unknown");
  const msg = t(KNOWN.includes(code) ? "err." + code : "err.unknown");
  $(id).innerHTML = `${esc(msg)}<small class="err-code">${esc(t("login.code"))}: ${esc(code)}${err?.message && code === "unknown" ? " · " + esc(err.message) : ""}</small>`;
}
