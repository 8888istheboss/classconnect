/* Les identifiants sont vérifiés et les mots de passe hachés côté serveur. */
window.accountSubmit = async function () {
  var p = val("gp"), password = $("gpw") ? $("gpw").value : "";
  if (!p) { toast("Choisis un pseudo"); return; }
  if (!password) { toast("Entre ton mot de passe"); return; }
  if (authMode === "register" && password.length < 8) { toast("Le mot de passe doit contenir au moins 8 caractères"); return; }
  try {
    var action = authMode === "register" ? "register" : "login";
    var code = $("gpCode") ? $("gpCode").value.trim() : "";
    if (action === "register" && !code) { toast("Saisis le code d’invitation fourni par le professeur"); return; }
    var r = await CCAPI("/api/session", { method: "POST", body: JSON.stringify({ action: action, name: p, password: password, code: code }) });
    P.n = p;
    toast(r.st === "pend" ? "Connecté. Saisis un code d’invitation pour activer ton ancien compte." : r.st === "off" ? "Ce compte est désactivé." : "Compte actif. Bienvenue !");
    setTimeout(function () { location.reload(); }, 800);
  } catch (e) { toast(e.message); }
};
window.activateAccount = async function () {
  var code = $("gpCode") ? $("gpCode").value.trim() : "";
  if (!code) { toast("Saisis le code d’invitation fourni par le professeur"); return; }
  try {
    await CCAPI("/api/session", { method: "POST", body: JSON.stringify({ action: "activate", code: code }) });
    toast("Compte activé. Bienvenue !");
    setTimeout(function () { location.reload(); }, 500);
  } catch (e) { toast(e.message); }
};
window.saLogin = async function () {
  var n = val("gp");
  try {
    await CCAPI("/api/session", { method: "POST", body: JSON.stringify({ action: "login-sa", pass: val("gs") }) });
    if (n) P.n = n;
    location.reload();
  } catch (e) { toast(e.message); }
};
window.logout = async function () {
  try { await CCAPI("/api/session", { method: "POST", body: JSON.stringify({ action: "logout" }) }); } catch (e) {}
  location.reload();
};
