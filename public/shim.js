/* Fait le lien entre l'application et le serveur Vercel (même interface que claude.use("db")) */
(function () {
  var me = null, subs = {}, hs = {}, timer = null, pt = null;
  function api(p, o) {
    o = Object.assign({ credentials: "same-origin", headers: { "Content-Type": "application/json" } }, o || {});
    return fetch(p, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || "Erreur " + r.status);
        return j;
      });
    });
  }
  window.CCAPI = api;
  function snap(d) { return { docs: d.map(function (x) { return { id: x.id, data: function () { return x; } }; }) }; }
  function poll() {
    var cols = Object.keys(subs); if (!cols.length) return;
    var h = {}; cols.forEach(function (c) { h[c] = hs[c] || ""; });
    api("/api/db?op=sync", { method: "POST", body: JSON.stringify({ hs: h }) }).then(function (o) {
      Object.keys(o).forEach(function (c) { hs[c] = o[c].h; (subs[c] || []).forEach(function (cb) { cb(snap(o[c].docs)); }); });
    }).catch(function (e) {
      window.dispatchEvent(new CustomEvent("cc-cloud-error", { detail: e }));
    });
  }
  function soon() { clearTimeout(pt); pt = setTimeout(poll, 120); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) soon(); });
  function coll(n) {
    var q = {
      add: function (o) { return api("/api/db?col=" + n, { method: "POST", body: JSON.stringify(o) }).then(function (r) { soon(); return r; }); },
      orderBy: function () { return q; }, limit: function () { return q; },
      onSnapshot: function (cb) {
        subs[n] = (subs[n] || []).concat([cb]);
        if (!timer) timer = setInterval(function () { if (!document.hidden) poll(); }, 5000);
        soon(); return function () {};
      }
    };
    return q;
  }
  function doc(path) {
    var a = path.split("/"), u = "/api/db?col=" + a[0] + "&id=" + encodeURIComponent(a.slice(1).join("/"));
    function w(m, o) { return api(u, { method: m, body: o ? JSON.stringify(o) : undefined }).then(function (r) { soon(); return r; }); }
    return { set: function (o) { return w("PUT", o); }, update: function (o) { return w("PATCH", o); }, delete: function () { return w("DELETE"); } };
  }
  window.claude = {
    use: async function (n) {
      if (!me) me = await api("/api/session");
      if (n === "db") return { collection: coll, doc: doc };
      if (n === "user") {
        window.sa = !!me.sa;
        return {
          id: async function () { return me.uid; },
          canEdit: async function () { return me.role === "mod" || !!me.sa; },
          isOwner: async function () { return !!me.sa; }
        };
      }
    }
  };
})();
