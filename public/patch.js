/* Connexion réelle : les vérifications se font sur le serveur */
window.joinCode = async function () {
  var p = val("gp"), cd = val("gc").toUpperCase();
  if (!p) { toast("Choisis un pseudo"); return; }
  try {
    var r = await CCAPI("/api/session", { method: "POST", body: JSON.stringify({ action: "join", name: p, code: cd }) });
    P.n = p;
    toast(r.st === "pend" ? "Demande envoyée à l’admin" : "Bienvenue !");
    setTimeout(function () { location.reload(); }, 800);
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
