// Login with email and password (the magic link did not work on iPhone: Gmail's link preview used it up).
// Also the shared "change password" form, used in Lucía's settings and in Augusto's panel.
import { $, esc, S } from "./core.js";
import { icon } from "./icons.js";

export function renderLogin(msg) {
  $("app").hidden = true; $("login").hidden = false;
  $("login").innerHTML = `<div class="login-card">
    <span class="mono">Español para Lima</span>
    <h1 class="display">Welkom terug</h1>
    <p>Log in met je e-mailadres en wachtwoord. Je blijft daarna ingelogd.</p>
    <form id="loginForm">
      <label for="email" class="mono">E-mail</label>
      <input id="email" type="email" required autocomplete="username" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false">
      <label for="password" class="mono">Wachtwoord</label>
      <div class="pw-row"><input id="password" type="password" required autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false"><button type="button" class="icon-btn" id="pwToggle" aria-label="Wachtwoord tonen">${icon("eye", 20)}</button></div>
      <button class="btn wide" id="loginBtn">Inloggen</button>
    </form>
    <p class="status" id="loginStatus">${esc(msg || "")}</p>
    <p class="small muted">Wachtwoord vergeten? Vraag Augusto om een nieuw.</p></div>`;
  $("pwToggle").onclick = () => { const p = $("password"); p.type = p.type === "password" ? "text" : "password"; $("pwToggle").setAttribute("aria-label", p.type === "password" ? "Wachtwoord tonen" : "Wachtwoord verbergen"); };
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = normEmail($("email").value);
    $("email").value = email;
    $("loginBtn").disabled = true; $("loginStatus").textContent = "Even geduld...";
    try { await S.store.signIn(email, $("password").value.trim()); location.reload(); }
    catch (err) { console.warn("signIn failed", err); showError("loginStatus", err); $("loginBtn").disabled = false; }
  };
}

// Change password: Dutch for Claire, Spanish for Augusto's panel.
export function passwordForm(lang = "nl") {
  const t = lang === "es"
    ? { title: "Cambiar mi contraseña", np: "Contraseña nueva", rep: "Repítela", btn: "Guardar contraseña", short: "Usa al menos 8 caracteres.", diff: "Las dos contraseñas no coinciden.", ok: "Contraseña cambiada.", fail: "No se pudo cambiar la contraseña." }
    : { title: "Wachtwoord wijzigen", np: "Nieuw wachtwoord", rep: "Herhaal het", btn: "Wachtwoord opslaan", short: "Gebruik minstens 8 tekens.", diff: "De twee wachtwoorden zijn niet hetzelfde.", ok: "Wachtwoord gewijzigd.", fail: "Wijzigen lukte niet." };
  const html = `<form class="set-row pw-form" id="pwForm" lang="${lang}"><b>${t.title}</b>
    <input id="pwNew" type="password" autocomplete="new-password" placeholder="${t.np}" autocapitalize="none" autocorrect="off" spellcheck="false">
    <input id="pwRep" type="password" autocomplete="new-password" placeholder="${t.rep}" autocapitalize="none" autocorrect="off" spellcheck="false">
    <button class="btn" id="pwSave">${t.btn}</button><p class="status" id="pwStatus"></p></form>`;
  const bind = () => {
    $("pwForm").onsubmit = async (e) => {
      e.preventDefault();
      const a = $("pwNew").value.trim(), b = $("pwRep").value.trim();
      if (a.length < 8) { $("pwStatus").textContent = t.short; return; }
      if (a !== b) { $("pwStatus").textContent = t.diff; return; }
      $("pwSave").disabled = true;
      try { await S.store.changePassword(a); $("pwStatus").textContent = t.ok; $("pwNew").value = $("pwRep").value = ""; }
      catch (err) { console.warn(err); $("pwStatus").textContent = t.fail + (err?.code ? ` (${err.code})` : ""); }
      $("pwSave").disabled = false;
    };
  };
  return { html, bind };
}

// Trim, drop invisible/inner spaces (iOS sometimes adds them) and lowercase.
const normEmail = (s) => String(s || "").normalize("NFKC").replace(/[\s​-‍﻿]/g, "").toLowerCase();
// Concrete reason from Supabase's error code, in Dutch, plus the code itself so Augusto can look it up.
function showError(id, err) {
  const code = err?.code || (err?.status === 429 ? "over_request_rate_limit" : err?.name === "AuthRetryableFetchError" || err?.status === 0 ? "network" : "unknown");
  const msg = {
    invalid_credentials: "E-mailadres of wachtwoord klopt niet. Let op hoofdletters en spaties.",
    email_address_invalid: "Dit is geen geldig e-mailadres. Controleer de spelling.",
    validation_failed: "Vul je e-mailadres en wachtwoord in.",
    user_banned: "Dit account is geblokkeerd. Vraag Augusto om hulp.",
    over_request_rate_limit: "Te veel pogingen achter elkaar. Wacht een paar minuten en probeer het opnieuw.",
    email_provider_disabled: "Inloggen met e-mail staat uit. Vraag Augusto om het aan te zetten.",
    network: "Geen verbinding met de server. Controleer je internet en probeer het opnieuw.",
  }[code] || "Inloggen lukte niet.";
  $(id).innerHTML = `${esc(msg)}<small class="err-code">Foutcode: ${esc(code)}${err?.message && code === "unknown" ? " · " + esc(err.message) : ""}</small>`;
}
