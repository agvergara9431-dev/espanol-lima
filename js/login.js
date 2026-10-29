// Login: magic link by email. On the installed iPhone app the link is pasted, because a tapped link opens Safari.
import { $, esc, S } from "./core.js";

export function renderLogin(msg) {
  $("app").hidden = true; $("login").hidden = false;
  $("login").innerHTML = `<div class="login-card">
    <span class="mono gold">PASAPORTE · ESPAÑOL</span>
    <h1 class="display">Español para Lima</h1>
    <p>Log in met je e-mailadres. Je krijgt een link in je mailbox.</p>
    <form id="loginForm"><label for="email" class="mono">E-MAIL</label><input id="email" type="email" required autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false"><button class="btn wide" id="loginBtn">Stuur me een inloglink</button></form>
    <form id="pasteForm" hidden>
      <p id="pasteHelp"></p>
      <label for="paste" class="mono">LINK UIT DE MAIL</label>
      <input id="paste" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://...">
      <button class="btn wide" id="pasteBtn">Inloggen</button>
    </form>
    <p class="status" id="loginStatus">${esc(msg || "")}</p></div>`;
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let email = "";
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    email = normEmail($("email").value);
    $("email").value = email;
    $("loginBtn").disabled = true; $("loginStatus").textContent = "Even geduld...";
    try {
      await S.store.signIn(email);
      $("loginStatus").textContent = "";
      $("pasteForm").hidden = false;
      $("pasteHelp").textContent = installed
        ? "Check je mail. Tik niet op de link, maar houd hem ingedrukt en kies 'Kopieer link'. Plak hem hieronder."
        : "Check je mail en tik op de link. Lukt dat niet? Kopieer de link en plak hem hieronder.";
    } catch (err) { console.warn("signIn failed", err); showLoginError(err, "send"); $("loginBtn").disabled = false; }
  };
  $("pasteForm").onsubmit = async (e) => {
    e.preventDefault();
    $("pasteBtn").disabled = true; $("loginStatus").textContent = "Even geduld...";
    try { await S.store.verify(email, $("paste").value); location.reload(); }
    catch (err) { console.warn("verify failed", err); showLoginError(err, "verify"); $("pasteBtn").disabled = false; }
  };
}
// Trim, drop invisible/inner spaces (iOS sometimes adds them) and lowercase.
const normEmail = (s) => String(s || "").normalize("NFKC").replace(/[\s​-‍﻿]/g, "").toLowerCase();
// Concrete reason from Supabase's error code, in Dutch, plus the code itself so Augusto can look it up.
function showLoginError(err, step) {
  const code = err?.code || (err?.status === 429 ? "over_request_rate_limit" : err?.name === "AuthRetryableFetchError" || err?.status === 0 ? "network" : "unknown");
  const wait = /after (\d+) seconds?/.exec(err?.message || "")?.[1];
  const noAccess = "Dit e-mailadres heeft geen toegang. Gebruik het adres dat Augusto heeft ingesteld.";
  const msg = {
    otp_disabled: noAccess, user_not_found: noAccess, signup_disabled: noAccess,
    email_address_invalid: "Dit is geen geldig e-mailadres. Controleer de spelling.",
    validation_failed: "Dit is geen geldig e-mailadres. Controleer de spelling.",
    over_email_send_rate_limit: wait ? `Je hebt net al een link gekregen. Probeer het over ${wait} seconden opnieuw.` : "Er zijn te veel mails verstuurd. Probeer het over een uur opnieuw, of gebruik de laatste link die je kreeg.",
    over_request_rate_limit: "Te veel pogingen achter elkaar. Wacht een paar minuten en probeer het opnieuw.",
    email_provider_disabled: "Inloggen met e-mail staat uit. Vraag Augusto om het aan te zetten.",
    otp_expired: "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan en plak de nieuwste link.",
    bad_link: "Dit lijkt geen link uit de mail. Kopieer de hele link en plak hem opnieuw.",
    network: "Geen verbinding met de server. Controleer je internet en probeer het opnieuw.",
  }[code] || (step === "verify" ? "Deze link werkt niet. Vraag een nieuwe aan en plak de nieuwste link." : "Dat lukte niet.");
  $("loginStatus").innerHTML = `${esc(msg)}<small class="err-code">Foutcode: ${esc(code)}${err?.message && code === "unknown" ? " · " + esc(err.message) : ""}</small>`;
}
