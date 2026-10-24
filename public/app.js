var $=function(i){return document.getElementById(i)};
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(m){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]})}
function val(i){var e=$(i);return e?e.value.trim():""}
function shuf(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function days(d){return Math.ceil((new Date(d+"T00:00:00")-new Date().setHours(0,0,0,0))/864e5)}
function dateValue(v){if(typeof v==="string"&&/^\d{10,13}$/.test(v)){var n=Number(v);return n<1e11?n*1000:n}return v}
function fmtDate(v,options){var d=new Date(dateValue(v));return Number.isNaN(d.getTime())?"Date inconnue":d.toLocaleString("fr-FR",options)}
var P={n:"",e:"🙂",c:"#3b5bdb"};
var UID="",DB=null,admin=false,sa=false,shared=false,booting=true,cloudError="";
window.addEventListener("cc-cloud-error",function(e){cloudError=e.detail&&e.detail.message||"Erreur de synchronisation avec le cloud.";R()});
var D={msgs:[],groups:[],gm:[],polls:[],votes:[],scores:[],ann:[],hw:[],sorties:[],rsvp:[],bans:[],members:[],codes:[],cfg:[],ideas:[],mkt:[],logs:[],cards:[],prefs:[]};
var SEEN={},DONE={},CARDS=[];
var tab="acc",room="gen",rp=null,ci=0,fl=false,Z=null,gameCurrent="",gameTimer=null,gameBusy=false;
var TABS=[["acc","🏠 Accueil"],["chat","💬 Chat"],["grp","👥 Groupes"],["game","🎮 Défis"],["plan","📅 Planning"],["rev","📚 Révisions"],["lg","🏆 League"],["pol","🗳️ Sondages"],["sor","🎯 Sorties"],["ide","💡 Idées"],["mkt","🔄 Échange"],["dir","📇 Annuaire"],["sa","👑 Super admin"],["set","⚙️ Réglages"]];
var BASE=[["gen","# Général"],["dev","# Devoirs"],["jeu","# Jeux"],["pro","# Projets"],["mat","Maths"],["fra","Français"],["his","Histoire"],["sci","Sciences"]];

/* Toutes les données persistantes sont stockées dans la base cloud. */
function err(e){toast("Erreur cloud : "+(e&&e.message||"réessaie plus tard."))}
function toast(t){var e=$("toast");e.textContent=t;e.style.display="block";clearTimeout(toast.t);toast.t=setTimeout(function(){e.style.display="none"},3500)}
function add(n,o){if(!DB){toast("Connexion cloud indisponible.");return}o.t=Date.now();o.u=UID;o.by=P.n||"Anonyme";return DB.collection(n).add(o).catch(err)}
function set(n,id,o){if(!DB){toast("Connexion cloud indisponible.");return}o.t=Date.now();o.u=UID;o.id=id;o.by=P.n||"Anonyme";return DB.doc(n+"/"+id).set(o).catch(err)}
function upd(n,id,o){if(!DB){toast("Connexion cloud indisponible.");return}return DB.doc(n+"/"+id).update(o).catch(err)}
function rm(n,id){if(!DB){toast("Connexion cloud indisponible.");return}return DB.doc(n+"/"+id).delete().catch(err)}
function savePrefs(){if(!UID)return;return set("prefs",UID+"_settings",{seen:SEEN,done:DONE})}
function sub(n){DB.collection(n).orderBy("t").limit(500).onSnapshot(function(s){D[n]=s.docs.map(function(d){var x=d.data();x.id=d.id;return x});if(n==="prefs"){var p=D.prefs.find(function(x){return x.id===UID+"_settings"});if(p){SEEN=p.seen||{};DONE=p.done||{}}}if(n==="cards")CARDS=D.cards.map(function(x){return{id:x.id,m:x.m,q:x.q,a:x.a}});L()},function(e){err(e)})}
function can(x){return admin||x.u===UID}
function name(){return P.n||"Anonyme"}

/* navigation */
var V={},F={};
function R(){if(booting||cloudError){$("bn").innerHTML="";$("tabs").innerHTML="";$("tabs").style.display="none";document.querySelector(".layout").style.gridTemplateColumns="1fr";$("role").textContent="CLOUD";$("v").innerHTML='<div class="card"><h2>'+(booting?"Connexion au cloud…":"Cloud indisponible")+'</h2><p class="mu">'+esc(cloudError||"Chargement des données sécurisées…")+'</p>'+(cloudError?'<button class="p" onclick="location.reload()">Réessayer</button>':"")+'</div>';$("st").textContent="Les données de la classe sont stockées sur le cloud.";return}admin=isAdm();if(tab==="sa"&&!sa)tab="acc";if(tab!=="acc"&&tab!=="set"&&!sa&&(cfg().off||[]).indexOf(tab)>=0)tab="acc";$("bn").innerHTML=cfg().bn?'<div class="card" style="border-top-color:var(--ko)">📢 '+esc(cfg().bn)+'</div>':"";if(gated()){gateView();return}document.querySelector(".layout").style.gridTemplateColumns="";$("tabs").style.display="";$("role").textContent=sa?"👑 SUPER ADMIN":admin?"MODÉRATEUR":"MEMBRE";$("tabs").innerHTML=TABS.filter(function(t){return t[0]==="sa"?sa:(sa||(cfg().off||[]).indexOf(t[0])<0)}).map(function(t){return'<button class="'+(t[0]===tab?"on":"")+'" onclick="go(\''+t[0]+'\')">'+t[1]+'</button>'}).join("");$("v").innerHTML=V[tab]();if(F[tab])F[tab]();$("st").textContent="Mode cloud : les données sont enregistrées sur le serveur et partagées avec la classe."}
function go(t){tab=t;if(t!=="game"&&gameTimer){clearInterval(gameTimer);gameTimer=null}R()}
function L(){admin=isAdm();var g=gated(),k=JSON.stringify(cfg().off||[])+(cfg().bn||"")+(mine()?mine().role:"");if(g!==L.g||k!==L.k){L.g=g;L.k=k;R();return}if(!g&&F[tab])F[tab]()}
function rooms(){var r=BASE.slice();D.groups.forEach(function(g){if(D.gm.some(function(m){return m.g===g.id&&m.u===UID}))r.push(["g:"+g.id,"👥 "+g.nm])});return r}

/* ACCUEIL */
V.acc=function(){return'<div class="card"><div class="mu">ESPACE DE CLASSE</div><h2 style="font-size:1.45rem;margin-top:5px">Bienvenue, '+esc(P.n||"dans ta classe")+' 👋</h2><p class="mu">Retrouve tes activités, échange avec la classe et lance un défi quand tu veux.</p><div class="game-stats"><div class="game-stat"><span class="mu">Membres actifs</span><br><b>'+D.members.filter(function(m){return m.st==="on"}).length+'</b></div><div class="game-stat"><span class="mu">Messages</span><br><b>'+D.msgs.length+'</b></div><div class="game-stat"><span class="mu">Défis</span><br><button class="x" onclick="go(\'game\')">Jouer maintenant →</button></div></div></div><div class="card"><h2>🔔 Nouveautés</h2><div id="nv"></div></div><div class="card"><h2>📢 Annonces</h2>'+(admin?'<div class="row"><input id="an" placeholder="Nouvelle annonce" maxlength="200"><button class="p" onclick="addAnn()">Publier</button></div>':'')+'<div id="al"></div></div>'};
F.acc=function(){
  var un=D.msgs.filter(function(m){return m.u!==UID&&m.t>(SEEN[m.room]||0)}).length;
  var np=D.polls.filter(function(p){return !D.votes.some(function(v){return v.p===p.id&&v.u===UID})}).length;
  var hw=D.hw.filter(function(h){var n=days(h.d);return n>=0&&n<=3&&!DONE[h.id]}).sort(function(a,b){return a.d<b.d?-1:1});
  $("nv").innerHTML='<div class="it"><span>💬 Nouveaux messages</span><b>'+un+'</b></div><div class="it"><span>🗳️ Sondages sans ton vote</span><b>'+np+'</b></div><div class="it"><span>📅 Échéances (3 jours)</span><b>'+hw.length+'</b></div>'+hw.map(function(h){return'<div class="mu">• '+esc(h.k)+' '+esc(h.m)+' : J-'+days(h.d)+'</div>'}).join("");
  $("al").innerHTML=D.ann.length?D.ann.slice().reverse().map(function(a){return'<div class="it"><span>'+esc(a.tx)+'<br><span class="mu">'+esc(a.by)+' · '+fmtDate(a.t,{year:"numeric",month:"2-digit",day:"2-digit"})+'</span></span>'+(can(a)?'<button class="x" onclick="rm(\'ann\',\''+a.id+'\')">✕</button>':'')+'</div>'}).join(""):'<p class="mu">Aucune annonce.</p>'
};
function addAnn(){var t=val("an");if(t){add("ann",{tx:t});$("an").value=""}}

/* CHAT */
V.chat=function(){return'<div class="card"><div class="bar" id="rb"></div><div class="row"><input id="sq" placeholder="🔍 Rechercher dans ce salon" oninput="L()"></div><div id="pins"></div><div id="ml"></div><div id="rpl" class="mu"></div><div class="row" style="margin:8px 0 0"><input id="mi" placeholder="Écrire un message… (@pseudo pour mentionner)" maxlength="300" onkeydown="if(event.key===\'Enter\')send()"><button class="p" onclick="send()">Envoyer</button></div></div>'};
function mh(m){
  var mine=m.u===UID;
  if(m.rep&&!can(m))return'<div class="mu">🚩 Message signalé, en attente de modération.</div>';
  var tx=esc(m.tx).replace(/@([\w\-]+)/g,function(a,b){return'<b class="'+(b.toLowerCase()===(P.n||"").toLowerCase()?"me":"")+'">@'+b+'</b>'});
  var rc=["👍","❤️","😂","🔥"].map(function(e,k){return'<button onclick="react(\''+m.id+'\','+k+')">'+e+(m["r"+k]?" "+m["r"+k]:"")+'</button>'}).join("");
  return'<div class="msg"><div class="av" style="background:'+esc(m.c||"#888")+'33">'+esc(m.e||"🙂")+'</div><div class="bub'+(mine?" mine":"")+'"><b>'+esc(m.by)+'</b> <span class="mu">'+fmtDate(m.t,{hour:"2-digit",minute:"2-digit"})+(m.pin?" 📌":"")+'</span>'+(m.re?'<div class="mu">↩ '+esc(m.re.n)+' : '+esc(m.re.x)+'</div>':'')+'<div>'+tx+'</div><div class="acts">'+rc+'<button onclick="reply(\''+m.id+'\')">↩</button><button onclick="upd(\'msgs\',\''+m.id+'\',{rep:true});toast(\'Message signalé\')">🚩</button>'+(admin?'<button onclick="upd(\'msgs\',\''+m.id+'\',{pin:'+(!m.pin)+'})">📌</button>':'')+(can(m)?'<button onclick="rm(\'msgs\',\''+m.id+'\')">🗑</button>':'')+(sa&&m.u!==UID?'<button onclick="ban(\''+m.id+'\')">⛔</button>':'')+'</div></div></div>'
}
F.chat=function(){
  $("rb").innerHTML=rooms().map(function(r){return'<button class="'+(r[0]===room?"on":"")+'" onclick="room=\''+r[0]+'\';R()">'+esc(r[1])+'</button>'}).join("");
  var q=val("sq").toLowerCase();
  var ms=D.msgs.filter(function(m){return m.room===room&&(sa||!bn(m.u))&&(!q||String(m.tx).toLowerCase().indexOf(q)>=0)}).sort(function(a,b){return a.t-b.t});
  $("pins").innerHTML=ms.filter(function(m){return m.pin}).map(function(m){return'<div class="pin">📌 <b>'+esc(m.by)+'</b> : '+esc(m.tx)+'</div>'}).join("");
  var el=$("ml"),near=el.scrollHeight-el.scrollTop-el.clientHeight<80;
  el.innerHTML=ms.length?ms.map(mh).join(""):'<p class="mu">Aucun message. Lance la discussion !</p>';
  if(near)el.scrollTop=el.scrollHeight;
  if(Date.now()-(SEEN[room]||0)>30000){SEEN[room]=Date.now();savePrefs()}
  $("rpl").innerHTML=rp?'↩ Réponse à '+esc(rp.by)+' <button class="x" onclick="rp=null;L()">✕</button>':""
};
function send(){var t=val("mi");if(!t)return;if(cfg().lock&&!admin){toast("Chat verrouillé par l’administration.");return}if(bn(UID)){toast("Tu ne peux plus écrire dans le chat.");return}if(!P.n){toast("Choisis d’abord un pseudo en haut.");return}var o={room:room,tx:t.slice(0,300),e:P.e,c:P.c};if(rp)o.re={n:rp.by,x:String(rp.tx).slice(0,40)};add("msgs",o);$("mi").value="";rp=null;var e=$("ml");if(e)setTimeout(function(){e.scrollTop=e.scrollHeight},50)}
function react(id,k){var m=D.msgs.find(function(x){return x.id===id});if(!m)return;var o={};o["r"+k]=(m["r"+k]||0)+1;upd("msgs",id,o)}
function reply(id){rp=D.msgs.find(function(x){return x.id===id});L();$("mi").focus()}

/* GROUPES */
V.grp=function(){return'<div class="card"><h2>➕ Créer un groupe</h2><div class="row"><input id="gn" placeholder="Nom (ex. : Exposé d’histoire)" maxlength="40"><input id="gd" placeholder="Description" maxlength="80"><button class="p" onclick="addGrp()">Créer</button></div></div><div class="card"><h2>👥 Groupes</h2><div id="gl"></div></div>'};
F.grp=function(){
  $("gl").innerHTML=D.groups.length?D.groups.map(function(g){
    var ms=D.gm.filter(function(m){return m.g===g.id}),me=ms.some(function(m){return m.u===UID});
    return'<div class="it"><span><b>'+esc(g.nm)+'</b><br><span class="mu">'+esc(g.ds)+' · '+ms.length+' membre'+(ms.length>1?"s":"")+'</span></span><span>'+(me?'<button class="x p" onclick="room=\'g:'+g.id+'\';go(\'chat\')">Ouvrir le chat</button> <button class="x" onclick="rm(\'gm\',\''+g.id+'_'+UID+'\')">Quitter</button>':'<button class="x p" onclick="set(\'gm\',\''+g.id+'_'+UID+'\',{g:\''+g.id+'\'})">Rejoindre</button>')+(can(g)?' <button class="x" onclick="rm(\'groups\',\''+g.id+'\')">🗑</button>':'')+'</span></div>'}).join(""):'<p class="mu">Aucun groupe pour l’instant.</p>'
};
function addGrp(){var n=val("gn");if(n){add("groups",{nm:n,ds:val("gd")});$("gn").value="";$("gd").value=""}}

/* PLANNING */
V.plan=function(){return'<div class="card"><h2>➕ Ajouter</h2><div class="row"><select id="pk"><option>Devoir</option><option>Contrôle</option><option>Événement</option></select><input id="pm" placeholder="Matière / titre"><input id="pd" type="date"><button class="p" onclick="addHw()">Ajouter</button></div></div><div class="card"><h2>📅 À venir</h2><div id="hl"></div></div>'};
F.plan=function(){
  $("hl").innerHTML=D.hw.length?D.hw.slice().sort(function(a,b){return a.d<b.d?-1:1}).map(function(h){var n=days(h.d);return'<div class="it"><span class="'+(DONE[h.id]?"done":"")+'"><input type="checkbox" '+(DONE[h.id]?"checked":"")+' onchange="DONE[\''+h.id+'\']=this.checked;savePrefs();L()"> '+(h.k==="Contrôle"?"📝":h.k==="Événement"?"🎉":"✏️")+' '+esc(h.m)+' <span class="mu">· '+esc(h.d)+' · '+(n>=0?"J-"+n:"passé")+'</span></span>'+(can(h)?'<button class="x" onclick="rm(\'hw\',\''+h.id+'\')">✕</button>':'')+'</div>'}).join(""):'<p class="mu">Rien de prévu.</p>'
};
function addHw(){var m=val("pm"),d=val("pd");if(m&&d)add("hw",{k:val("pk"),m:m,d:d})}

/* RÉVISIONS (fiches perso) */
V.rev=function(){var c=CARDS[ci];return'<div class="card"><h2>🃏 Flashcards</h2>'+(c?'<div class="mu">'+esc(c.m)+' · '+(ci+1)+' / '+CARDS.length+'</div><div class="fc" onclick="fl=!fl;R()">'+esc(fl?c.a:c.q)+'</div><div class="row"><button onclick="cn(-1)">◀</button><button class="p" onclick="fl=!fl;R()">Retourner</button><button onclick="cn(1)">▶</button><button onclick="CARDS=shuf(CARDS);ci=0;fl=false;R()">Mélanger</button><button class="x" onclick="rm(\'cards\',\''+c.id+'\');ci=0;fl=false">Supprimer</button></div>':'<p class="mu">Aucune fiche.</p>')+'</div><div class="card"><h2>➕ Nouvelle fiche</h2><div class="row"><input id="cm" placeholder="Matière"><input id="cq" placeholder="Question"><input id="ca" placeholder="Réponse"><button class="p" onclick="ac()">Ajouter</button></div><p class="mu">Tes fiches sont privées et enregistrées dans le cloud.</p></div>'};
function cn(d){ci=(ci+d+CARDS.length)%CARDS.length;fl=false;R()}
function ac(){var q=val("cq"),a=val("ca");if(q&&a){add("cards",{m:val("cm")||"Général",q:q,a:a});$("cm").value="";$("cq").value="";$("ca").value=""}}

/* CLASS LEAGUE */
var QP=[["Quelle est la capitale de l’Italie ?","Rome","Milan","Naples","Venise"],["Quel est le plus grand océan ?","Pacifique","Atlantique","Indien","Arctique"],["Quelle planète est la plus proche du Soleil ?","Mercure","Vénus","Mars","Terre"],["Qui a peint la Joconde ?","Léonard de Vinci","Michel-Ange","Picasso","Van Gogh"],["Combien font 7 × 8 ?","56","54","48","63"],["Quelle est la racine carrée de 81 ?","9","8","7","10"],["En quelle année a commencé la Première Guerre mondiale ?","1914","1918","1939","1905"],["Quel gaz les plantes absorbent-elles ?","Dioxyde de carbone","Oxygène","Azote","Hélium"],["Quel est l’animal terrestre le plus rapide ?","Le guépard","Le lion","Le cheval","L’autruche"],["Quel organe pompe le sang ?","Le cœur","Le foie","Les poumons","Le cerveau"]];
var WK=["Poser une question utile dans le salon Devoirs","Expliquer une notion à un camarade","Créer une fiche de révision","Faire 2 quiz cette semaine","Proposer une idée de sortie dans un sondage"];
var BG=[[30,"🥉 Débutant"],[100,"🥈 Challenger"],[250,"🥇 Champion"],[500,"👑 Légende"]];
function tot(){var t={};D.scores.forEach(function(s){t[s.u]=t[s.u]||{n:s.by,p:0};t[s.u].p+=s.pts;t[s.u].n=s.by});return t}
function badges(p){return BG.filter(function(b){return p>=b[0]}).map(function(b){return b[1]}).join(" · ")||"Pas encore de badge"}
V.lg=function(){return'<div class="card"><h2>🎯 Défi de la semaine</h2><div>'+WK[Math.floor(Date.now()/6048e5)%WK.length]+'</div></div><div class="card"><h2>🧠 Quiz (10 points par bonne réponse)</h2><div id="qz"></div></div><div class="card"><h2>🏆 Classement</h2><div id="lb"></div></div>'};
F.lg=function(){
  if(!$("qz").innerHTML)Qz();
  var t=tot(),r=Object.keys(t).sort(function(a,b){return t[b].p-t[a].p}).slice(0,10);
  $("lb").innerHTML=(t[UID]?'<p class="mu">Tes badges : '+badges(t[UID].p)+'</p>':'')+(r.length?r.map(function(u,i){return'<div class="it"><span>'+(i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1+".")+' '+esc(t[u].n)+(u===UID?" (toi)":"")+'</span><b>'+t[u].p+' pts</b></div>'}).join(""):'<p class="mu">Joue un quiz pour apparaître ici.</p>')
};
function Qz(){
  var e=$("qz");if(!e)return;
  if(!Z){e.innerHTML='<button class="p" onclick="qs()">Commencer</button>';return}
  if(Z.end){e.innerHTML='<div class="big">Score : '+Z.s+' / '+Z.q.length+'</div><div class="row" style="margin-top:8px"><button class="p" onclick="qs()">Rejouer</button></div>';return}
  var q=Z.q[Z.i];
  e.innerHTML='<div class="mu">Question '+(Z.i+1)+' / '+Z.q.length+'</div><div class="big">'+esc(q[0])+'</div><div class="opts">'+shuf(q.slice(1)).map(function(o){return'<button data-v="'+esc(o)+'" onclick="qa(this)">'+esc(o)+'</button>'}).join("")+'</div><div class="row" style="margin-top:8px"><button id="nx" class="p" style="display:none" onclick="qn()">Suivant</button></div>'
}
function qs(){Z={q:shuf(QP).slice(0,6),i:0,s:0,a:false};Qz()}
function qa(b){if(Z.a)return;Z.a=true;var q=Z.q[Z.i];document.querySelectorAll("#qz .opts button").forEach(function(x){if(x.dataset.v===q[1])x.classList.add("good")});if(b.dataset.v===q[1])Z.s++;else b.classList.add("bad");$("nx").style.display="inline-block"}
function qn(){Z.i++;Z.a=false;if(Z.i>=Z.q.length){Z.end=true;if(Z.s>0)add("scores",{pts:Z.s*10})}Qz()}

/* DÉFIS MULTIJOUEURS */
V.game=function(){
  return'<div class="card"><h2>🎮 Défis de la classe</h2><p class="mu">Affronte un membre en duel ou lance un défi quotidien. Les réponses et les scores sont vérifiés par le serveur.</p><div class="row"><button class="p" onclick="createGame(\'duel\')">⚡ Créer un duel</button><select id="gameDays"><option value="1">1 jour</option><option value="3">3 jours</option><option value="5">5 jours</option><option value="7">7 jours</option></select><button onclick="createGame(\'daily\')">📅 Défi quotidien</button></div></div><div id="gameDetail"></div><div class="card"><h2>Défis disponibles et mes parties</h2><div id="gameList"><span class="mu">Chargement…</span></div></div>'
};
async function loadGameList(){
  if(tab!=="game"||gameBusy)return;
  gameBusy=true;
  try{
    var result=await CCAPI("/api/game?op=list"),e=$("gameList");
    if(!e)return;
    if(!result.games.length)e.innerHTML='<p class="mu">Aucun défi pour le moment. Crée le premier !</p>';
    else e.innerHTML=result.games.map(function(g){
      var names=g.players.map(function(p){return esc(p.name)+" · "+p.score+" pts"}).join(" / ");
      var label=g.type==="duel"?"Duel":"Défi · "+g.days+" jour"+(g.days>1?"s":"");
      var status=g.status==="waiting"?"En attente d’un adversaire":g.status==="complete"?"Terminé"+(g.winnerName?" · gagnant : "+esc(g.winnerName):""):"En cours";
      return'<div class="it"><span><b>'+label+'</b><br><span class="mu">'+status+' · '+names+'</span></span><span>'+(g.canJoin?'<button class="p x" onclick="joinGame(\''+g.id+'\')">Rejoindre</button>':'<button class="x" onclick="openGame(\''+g.id+'\')">'+(g.status==="complete"?"Résultat":"Ouvrir")+'</button>')+'</span></div>'
    }).join("");
  }catch(e){var el=$("gameList");if(el)el.innerHTML='<p class="mu">Impossible de charger les défis : '+esc(e.message)+'</p>'}
  finally{gameBusy=false}
}
async function refreshGame(){
  if(!gameCurrent||tab!=="game")return;
  try{var r=await CCAPI("/api/game?id="+encodeURIComponent(gameCurrent));drawGame(r.state)}
  catch(e){var el=$("gameDetail");if(el)el.innerHTML='<div class="card mu">'+esc(e.message)+'</div>'}
}
function drawGame(s){
  var e=$("gameDetail");if(!e)return;
  var me=s.players[s.myIndex],opp=s.players[1-s.myIndex],isDaily=s.type==="daily";
  var winner=s.status==="complete"?(s.winner==="draw"?"Match nul":s.winner===UID?"🎉 Tu as gagné !":s.winnerName?"Victoire de "+esc(s.winnerName):"Défi terminé"):"";
  var question=s.question?'<div class="card"><div class="mu">Question '+(s.questionIndex+1)+(isDaily?" · jour "+(s.questionIndex+1):" / 6")+'</div><h2 style="margin-top:8px">'+esc(s.question.prompt)+'</h2><div class="opts">'+s.question.options.map(function(o,i){return'<button class="game-option" onclick="answerGame('+i+')">'+esc(o)+'</button>'}).join("")+'</div></div>':"";
  var progress=s.status==="waiting"?"En attente d’un autre membre…":s.status==="complete"?'<div class="big">'+winner+'</div>':s.myProgress>=(isDaily?s.days:6)?"Tu as terminé ! En attente de ton adversaire.":s.answered?(isDaily?"Réponse du jour enregistrée. Reviens demain !":"Réponse enregistrée. En attente de la prochaine question."):"";
  e.innerHTML='<div class="card"><div class="row" style="justify-content:space-between"><div><h2>'+(isDaily?"📅 Défi quotidien":"⚡ Duel quiz")+'</h2><span class="mu">'+(s.status==="waiting"?"À rejoindre":s.status==="complete"?"Terminé":"En cours")+(isDaily&&s.endsAt?" · se termine le "+fmtDate(s.endsAt,{dateStyle:"short"}):"")+'</span></div><button class="x" onclick="closeGame()">Fermer</button></div><div class="game-stats"><div class="game-stat"><span class="mu">Toi</span><br><b>'+esc(me.name)+'</b><br>'+me.score+' pts · '+s.myProgress+' réponse'+(s.myProgress>1?"s":"")+'</div><div class="game-stat"><span class="mu">Adversaire</span><br><b>'+esc(opp?opp.name:"À venir")+'</b><br>'+(opp?opp.score+" pts · "+opp.progress+" réponse"+(opp.progress>1?"s":""):"En attente")+'</div><div class="game-stat"><span class="mu">Format</span><br><b>'+(isDaily?s.days+" jour"+(s.days>1?"s":""):"6 questions")+'</b><br>10 points par bonne réponse</div></div><p class="mu">'+progress+'</p></div>'+question;
}
async function createGame(type){
  try{var r=await CCAPI("/api/game",{method:"POST",body:JSON.stringify({action:"create",type:type,days:+$("gameDays").value})});gameCurrent=r.game.id;await loadGameList();await refreshGame();toast("Défi créé !")}
  catch(e){toast(e.message)}
}
async function joinGame(id){
  try{await CCAPI("/api/game",{method:"POST",body:JSON.stringify({action:"join",id:id})});gameCurrent=id;await loadGameList();await refreshGame();toast("Tu as rejoint le défi !")}
  catch(e){toast(e.message)}
}
function openGame(id){gameCurrent=id;refreshGame()}
function closeGame(){gameCurrent="";var e=$("gameDetail");if(e)e.innerHTML=""}
async function answerGame(choice){
  if(!gameCurrent)return;
  document.querySelectorAll("#gameDetail .game-option").forEach(function(b){b.disabled=true});
  try{var r=await CCAPI("/api/game",{method:"POST",body:JSON.stringify({action:"answer",id:gameCurrent,choice:choice})});toast(r.correct?"Bonne réponse · +10 points":"Réponse enregistrée");await refreshGame();await loadGameList()}
  catch(e){toast(e.message);await refreshGame()}
}
F.game=function(){
  loadGameList();refreshGame();
  if(!gameTimer)gameTimer=setInterval(function(){if(tab!=="game"){clearInterval(gameTimer);gameTimer=null;return}if(!document.hidden){loadGameList();refreshGame()}},2000)
};

/* SONDAGES */
V.pol=function(){return'<div class="card"><h2>➕ Nouveau sondage</h2><div class="row"><input id="pq" placeholder="Question (ex. : Où va-t-on en sortie ?)" maxlength="100"><input id="po" placeholder="Options séparées par des virgules"><button class="p" onclick="addPol()">Créer</button></div></div><div id="pl"></div>'};
F.pol=function(){
  $("pl").innerHTML=D.polls.length?D.polls.slice().reverse().map(function(p){
    var vs=D.votes.filter(function(v){return v.p===p.id}),my=vs.find(function(v){return v.u===UID});
    return'<div class="card"><b>'+esc(p.q)+'</b> <span class="mu">par '+esc(p.by)+' · '+vs.length+' vote'+(vs.length>1?"s":"")+'</span>'+(can(p)?' <button class="x" onclick="rm(\'polls\',\''+p.id+'\')">🗑</button>':'')+p.o.map(function(o,i){var n=vs.filter(function(v){return v.o===i}).length;return'<div style="margin-top:8px"><button class="'+(my&&my.o===i?"on":"")+'" onclick="set(\'votes\',\''+p.id+'_'+UID+'\',{p:\''+p.id+'\',o:'+i+'})">'+esc(o)+'</button> <span class="mu">'+n+'</span><div class="pb" style="width:'+(vs.length?Math.round(n/vs.length*100):0)+'%"></div></div>'}).join("")+'</div>'}).join(""):'<p class="mu">Aucun sondage.</p>'
};
function addPol(){var q=val("pq"),o=val("po").split(",").map(function(x){return x.trim()}).filter(Boolean).slice(0,6);if(q&&o.length>=2)add("polls",{q:q,o:o})}

/* RÉGLAGES */
/* SORTIES LASER GAME */
var TN=["Rouge","Bleue","Verte","Jaune"],TC=["#ff4d6d","#4cc9f0","#2cff9a","#ffd166"];
var MS=["⚔️ Équipe contre équipe : la base adverse doit tomber en premier.","🚩 Capture de base : protège la tienne, prends celle des autres.","👑 Le VIP : une personne par équipe est protégée, elle vaut double.","🤫 Mission furtive : on joue sans parler, uniquement par signes.","🎯 Chacun pour soi : le meilleur score individuel gagne.","🛡️ Survivant : le dernier de l’équipe encore actif rapporte un bonus."];
function bn(u){return D.bans.some(function(b){return b.id===u})}
function arm(k,f){if(arm.k===k){arm.k=null;f()}else{arm.k=k;toast("Clique encore pour confirmer")}}
V.sor=function(){return(sa?'<div class="card"><h2>Planifier une sortie laser game</h2><div class="row"><input id="sl1" placeholder="Lieu (ex. : Laser Arena)" maxlength="50"><input id="sl2" type="date"><input id="sl3" type="time"></div><div class="row"><input id="sl4" placeholder="Infos : rendez-vous, prix, consignes" maxlength="120"><button class="p" onclick="addSor()">Planifier</button></div></div>':'')+'<div id="sl"></div><div class="card"><h2>🎲 Mission laser game</h2><div id="ms" class="big">Prêt pour la mission ?</div><div class="row" style="margin-top:8px"><button class="p" onclick="mission()">Tirer une mission</button></div></div><div class="card"><h2>🛡️ Règles et sécurité</h2><div class="mu">• Écoute le briefing de l’animateur.<br>• On marche, on ne court pas, aucun contact physique.<br>• Respecte les zones interdites et les autres joueurs.<br>• Vérifie l’autorisation de l’établissement et des parents avant de partir.</div></div>'};
F.sor=function(){
  var e=$("sl");if(!e)return;
  e.innerHTML=D.sorties.length?D.sorties.slice().sort(function(a,b){return a.d<b.d?-1:1}).map(function(s){
    var rs=D.rsvp.filter(function(r){return r.s===s.id}),me=rs.some(function(r){return r.u===UID}),n=days(s.d),tm=s.tm||[],mn=s.mn||[];
    var pts=tm.map(function(t,i){return mn.filter(function(x){return x.t===i}).reduce(function(a,x){return a+x.p},0)}),best=pts.length?Math.max.apply(null,pts):0;
    var tms=tm.length?'<div class="tms">'+tm.map(function(t,i){return'<div class="tm" style="border-color:'+TC[i]+'"><b style="color:'+TC[i]+'">'+TN[i]+' · '+pts[i]+' pts'+(pts[i]===best&&best>0?' 🏅':'')+'</b><div class="mu">'+esc(t.m.join(", "))+'</div></div>'}).join("")+'</div>':'';
    var ctl=sa?'<div class="row"><select id="nt'+s.id+'"><option>2</option><option>3</option><option>4</option></select><button onclick="mkT(\''+s.id+'\')">Former les équipes</button><button class="x" onclick="rm(\'sorties\',\''+s.id+'\')">Supprimer</button></div>'+(tm.length?'<div class="row"><select id="mt'+s.id+'">'+tm.map(function(t,i){return'<option value="'+i+'">'+TN[i]+'</option>'}).join("")+'</select><input id="mp'+s.id+'" type="number" placeholder="Points de la manche"><button class="p" onclick="addM(\''+s.id+'\')">Ajouter la manche</button></div>':''):'';
    return'<div class="card"><h2>🎯 Laser game · '+esc(s.lieu)+'</h2><div class="mu">'+esc(s.d)+(s.h?' à '+esc(s.h):'')+' · '+(n>=0?'J-'+n:'terminée')+'</div>'+(s.note?'<div>'+esc(s.note)+'</div>':'')+'<div class="row" style="margin-top:8px"><button class="'+(me?'on':'')+'" onclick="rsv(\''+s.id+'\')">'+(me?'✓ Inscrit(e)':'Je participe')+'</button><span class="mu" style="align-self:center">'+rs.length+' inscrit'+(rs.length>1?'s':'')+' : '+esc(rs.map(function(r){return r.by}).join(", "))+'</span></div>'+tms+ctl+'</div>'}).join(""):'<div class="card mu">Aucune sortie prévue pour l’instant.</div>'
};
function addSor(){var l=val("sl1"),d=val("sl2");if(!l||!d){toast("Lieu et date obligatoires");return}add("sorties",{lieu:l,d:d,h:val("sl3"),note:val("sl4")})}
function rsv(sid){if(!P.n){toast("Choisis d’abord un pseudo en haut.");return}var id=sid+"_"+UID;if(D.rsvp.some(function(r){return r.id===id}))rm("rsvp",id);else set("rsvp",id,{s:sid})}
function mkT(sid){var n=+$("nt"+sid).value,nm=shuf(D.rsvp.filter(function(r){return r.s===sid}).map(function(r){return r.by}));if(nm.length<n){toast("Pas assez d’inscrits pour "+n+" équipes");return}var t=[];for(var i=0;i<n;i++)t.push({m:[]});nm.forEach(function(x,i){t[i%n].m.push(x)});upd("sorties",sid,{tm:t,mn:[]})}
function addM(sid){var t=+$("mt"+sid).value,p=parseInt($("mp"+sid).value,10);if(isNaN(p))return;var s=D.sorties.find(function(x){return x.id===sid});upd("sorties",sid,{mn:(s.mn||[]).concat([{t:t,p:p}])})}
function mission(){$("ms").textContent=MS[Math.floor(Math.random()*MS.length)]}

/* SUPER ADMIN */
V.sa0=function(){return'<div class="card"><h2>👑 Centre de contrôle</h2><div id="sst"></div></div><div class="card"><h2>🚩 Signalements</h2><div id="srp"></div></div><div class="card"><h2>⛔ Utilisateurs bannis</h2><div id="sbn"></div></div><div class="card"><h2>🧹 Outils</h2><div class="row"><select id="spr">'+rooms().map(function(r){return'<option value="'+esc(r[0])+'">'+esc(r[1])+'</option>'}).join("")+'</select><button onclick="arm(\'pg\',purge)">Vider ce salon</button></div><div class="row"><button onclick="arm(\'rs\',resetLg)">Remettre le classement à zéro</button></div></div>'};
F.sa0=function(){
  var rp=D.msgs.filter(function(m){return m.rep}),us={};D.msgs.concat(D.scores,D.rsvp).forEach(function(x){us[x.u]=1});
  $("sst").innerHTML=[["Membres actifs",Object.keys(us).length],["Messages",D.msgs.length],["Groupes",D.groups.length],["Sondages",D.polls.length],["Sorties",D.sorties.length],["Signalements",rp.length]].map(function(x){return'<div class="it"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>'}).join("");
  $("srp").innerHTML=rp.length?rp.map(function(m,i){return'<div class="it"><span><b>'+esc(m.by)+'</b> : '+esc(m.tx)+'</span><span><button class="x" onclick="upd(\'msgs\',\''+m.id+'\',{rep:false})">Valider</button> <button class="x" onclick="rm(\'msgs\',\''+m.id+'\')">Supprimer</button> <button class="x" onclick="ban(\''+m.id+'\')">Bannir</button></span></div>'}).join(""):'<p class="mu">Aucun signalement.</p>';
  $("sbn").innerHTML=D.bans.length?D.bans.map(function(b,i){return'<div class="it"><span>'+esc(b.nm)+'</span><button class="x" onclick="unban('+i+')">Débannir</button></div>'}).join(""):'<p class="mu">Personne n’est banni.</p>'
};
function ban(id){var m=D.msgs.find(function(x){return x.id===id});if(m&&m.u!==UID){set("bans",m.u,{nm:m.by});toast("Utilisateur banni")}}
function unban(i){if(D.bans[i])rm("bans",D.bans[i].id)}
function purge(){var r=$("spr").value;D.msgs.filter(function(m){return m.room===r}).forEach(function(m){rm("msgs",m.id)})}
function resetLg(){D.scores.slice().forEach(function(s){rm("scores",s.id)})}

/* ACCÈS, CODES ET CONTRÔLE TOTAL */
function cfg(){return D.cfg.find(function(c){return c.id==="main"})||{}}
function saveCfg(o){set("cfg","main",Object.assign({},cfg(),o))}
function isAdm(){if(sa)return true;var m=mine();return !!m&&m.role==="mod"}
V.sa=function(){return'<div class="card"><h2>⚡ Contrôle global</h2><div id="sg"></div></div><div class="card"><h2>🔑 Accès par code d’invitation</h2><p class="mu">Un élève crée son compte avec un code actif : son accès est ouvert immédiatement, sans validation manuelle.</p><div class="row"><select id="cr"><option value="member">Membre</option><option value="mod">Modérateur</option></select><input id="cx" type="number" min="0" placeholder="Utilisations max (0 = illimité)"><button class="p" onclick="genCode()">Générer un code</button></div><div id="scd"></div></div><div class="card"><h2>👥 Membres</h2><div id="smb"></div></div>'+V.sa0()};
F.sa=function(){F.sa0();fillSa2()};
function fillSa2(){
  var c=cfg(),off=c.off||[],tg=TABS.filter(function(t){return["acc","set","sa"].indexOf(t[0])<0});
  $("sg").innerHTML='<div class="row"><button class="'+(c.lock?"on":"")+'" onclick="saveCfg({lock:'+(!c.lock)+'})">'+(c.lock?"🔒 Chat verrouillé":"🔓 Chat ouvert")+'</button></div><div class="row"><input id="bnt" placeholder="Bannière d’alerte pour tous" maxlength="140" value="'+esc(c.bn||"")+'"><button class="p" onclick="saveCfg({bn:val(\'bnt\')})">Publier</button></div><div class="mu">Sections visibles pour les membres :</div><div class="row">'+tg.map(function(t){return'<button class="'+(off.indexOf(t[0])>=0?"":"on")+'" onclick="tgTab(\''+t[0]+'\')">'+t[1]+'</button>'}).join("")+'</div>';
  $("scd").innerHTML=D.codes.length?D.codes.map(function(x,i){return'<div class="it"><span><b style="font-family:monospace;letter-spacing:.08em">'+esc(x.cd)+'</b> <span class="mu">· '+(x.role==="mod"?"modérateur":"membre")+' · '+(x.n||0)+'/'+(x.mx||"∞")+(x.on?"":" · révoqué")+'</span></span><span><button class="x" onclick="cdT('+i+')">'+(x.on?"Révoquer":"Réactiver")+'</button> <button class="x" onclick="cdD('+i+')">✕</button></span></div>'}).join(""):'<p class="mu">Aucun code.</p>';
  $("smb").innerHTML=D.members.length?D.members.map(function(m,i){return'<div class="it"><span>'+esc(m.nm)+' <span class="mu">· '+(m.role==="mod"?"modérateur":"membre")+(m.st==="off"?" · suspendu":"")+'</span></span><span><button class="x" onclick="mbR('+i+')">'+(m.role==="mod"?"Rétrograder":"Promouvoir")+'</button> <button class="x" onclick="mbS('+i+')">'+(m.st==="off"?"Réactiver":"Suspendre")+'</button> <button class="x" onclick="mbD('+i+')">✕</button></span></div>'}).join(""):'<p class="mu">Aucun membre pour l’instant. Génère un code et donne-le à ta classe.</p>'
}
function genCode(){var ch="ABCDEFGHJKMNPQRSTUVWXYZ23456789",s="";for(var i=0;i<6;i++)s+=ch[Math.floor(Math.random()*ch.length)];add("codes",{cd:"CC-"+s,role:val("cr"),mx:parseInt(val("cx"),10)||0,on:true,n:0})}
function tgTab(k){var o=(cfg().off||[]).slice(),i=o.indexOf(k);if(i>=0)o.splice(i,1);else o.push(k);saveCfg({off:o})}
function cdT(i){var x=D.codes[i];if(x)upd("codes",x.id,{on:!x.on})}
function cdD(i){var x=D.codes[i];if(x)rm("codes",x.id)}
function mbR(i){var m=D.members[i];if(m)upd("members",m.id,{role:m.role==="mod"?"member":"mod"})}
function mbS(i){var m=D.members[i];if(m)upd("members",m.id,{st:m.st==="off"?"on":"off"})}
function mbD(i){var m=D.members[i];if(m)rm("members",m.id)}

/* CONNEXION, SÉCURITÉ ET NOUVELLES FONCTIONS */
var gateTab="el",authMode="login";
function gated(){return !DB||(!sa&&!mine())}
function mine(){return D.members.find(function(m){return m.id===UID&&m.st!=="off"&&m.st!=="pend"})}
function logA(t){if(DB||sa)add("logs",{tx:t})}
function gateView(){
  var m=D.members.find(function(x){return x.id===UID}),isSA=gateTab==="sa",b;
  $("tabs").innerHTML="";$("tabs").style.display="none";document.querySelector(".layout").style.gridTemplateColumns="1fr";$("role").textContent="CONNEXION";
  var ps='<label class="field-label" for="gp">Pseudo</label><input id="gp" placeholder="Ton pseudo" maxlength="20" value="'+esc(P.n)+'" autocomplete="username" style="width:100%;margin-bottom:12px">';
  if(isSA)b=ps+'<input id="gs" type="password" placeholder="Code super admin" style="width:100%;margin-bottom:8px" onkeydown="if(event.key===\'Enter\')saLogin()"><button class="p" onclick="saLogin()" style="width:100%">Accéder au centre de contrôle</button>';
  else if(m&&m.st==="off")b='<p>⛔ Ton accès a été suspendu par le super admin.</p>';
  else if(m&&m.st==="pend")b='<div class="notice"><b>Ton compte attend un code d’invitation</b><p class="mu">Demande un code actif au professeur et saisis-le ci-dessous pour débloquer ton accès.</p></div><label class="field-label" for="gpCode">Code d’invitation</label><input id="gpCode" placeholder="Ex. CC-ABC234" autocomplete="one-time-code" style="width:100%;margin-bottom:12px" onkeydown="if(event.key===\'Enter\')activateAccount()"><button class="p" onclick="activateAccount()" style="width:100%">Activer mon compte</button>';
  else b=ps+(authMode==="register"?'<label class="field-label" for="gpCode">Code d’invitation</label><input id="gpCode" placeholder="Code fourni par le professeur" autocomplete="one-time-code" style="width:100%;margin-bottom:12px">':'')+'<label class="field-label" for="gpw">Mot de passe</label><input id="gpw" type="password" placeholder="8 caractères minimum" minlength="8" maxlength="128" autocomplete="'+(authMode==="register"?"new-password":"current-password")+'" style="width:100%;margin-bottom:14px" onkeydown="if(event.key===\'Enter\')accountSubmit()"><button class="p" onclick="accountSubmit()" style="width:100%">'+(authMode==="register"?"Créer mon compte":"Se connecter")+'</button><p class="mu">'+(authMode==="register"?'Le code valide ton compte immédiatement.':'')+'</p><button class="x" onclick="authMode=\''+(authMode==="register"?"login":"register")+'\';R()">'+(authMode==="register"?"J’ai déjà un compte":"Créer un compte")+'</button>';
  $("v").innerHTML='<div class="card auth-card"><div class="eyebrow">ESPACE DE CLASSE</div><div class="big auth-logo">ClassConnect</div><p class="mu">Connecte-toi ou crée ton compte élève</p><div class="row auth-switch"><button class="'+(isSA?"":"on")+'" onclick="gateTab=\'el\';R()">Élève</button><button class="'+(isSA?"on":"")+'" onclick="gateTab=\'sa\';R()">Professeur</button></div>'+b+'</div>'
}

/* IDEES (boîte anonyme) */
V.ide=function(){return'<div class="card"><h2>💡 Boîte à idées</h2><div class="row"><input id="it" placeholder="Ton idée (sortie, jeu, amélioration…)" maxlength="160"></div><div class="row"><label class="mu"><input id="ia" type="checkbox" checked style="width:auto"> Anonyme pour les élèves</label><button class="p" onclick="addIde()">Proposer</button></div></div><div id="il"></div>'};
F.ide=function(){
  var a=D.ideas.slice().sort(function(x,y){return(y.v||[]).length-(x.v||[]).length});
  $("il").innerHTML=a.length?a.map(function(i){var n=(i.v||[]).length,me=(i.v||[]).indexOf(UID)>=0;return'<div class="card"><div>'+esc(i.tx)+(i.st==="ok"?' <b style="color:var(--ok)">✓ Retenue</b>':'')+'</div><div class="mu">'+(i.an?(sa?"Anonyme ("+esc(i.by)+")":"Anonyme"):esc(i.by))+'</div><div class="row" style="margin:8px 0 0"><button class="'+(me?"on":"")+'" onclick="voteIde(\''+i.id+'\')">👍 '+n+'</button>'+(sa?'<button class="x" onclick="upd(\'ideas\',\''+i.id+'\',{st:\''+(i.st==="ok"?"":"ok")+'\'})">Retenir</button>':'')+(can(i)?'<button class="x" onclick="rm(\'ideas\',\''+i.id+'\')">✕</button>':'')+'</div></div>'}).join(""):'<div class="card mu">Aucune idée pour l’instant.</div>'
};
function addIde(){var t=val("it");if(t){add("ideas",{tx:t,an:$("ia").checked,v:[]});$("it").value=""}}
function voteIde(id){var i=D.ideas.find(function(x){return x.id===id}),v=(i&&i.v||[]).slice(),k=v.indexOf(UID);if(!i)return;if(k>=0)v.splice(k,1);else v.push(UID);upd("ideas",id,{v:v})}

/* ECHANGE SCOLAIRE */
V.mkt=function(){return'<div class="card"><h2>🔄 Échange scolaire</h2><div class="row"><select id="mk"><option>Je donne</option><option>Je prête</option><option>Je cherche</option></select><input id="mx" placeholder="Ex. : manuel de maths 4e, calculatrice…" maxlength="120"><button class="p" onclick="addMkt()">Publier</button></div><p class="mu">Rencontrez-vous toujours à l’école, jamais en privé.</p></div><div id="ml2"></div>'};
F.mkt=function(){
  $("ml2").innerHTML=D.mkt.length?D.mkt.slice().reverse().map(function(m){return'<div class="card"><div class="'+(m.st==="done"?"done":"")+'"><b>'+esc(m.k)+'</b> · '+esc(m.tx)+'</div><div class="mu">'+esc(m.by)+'</div>'+(can(m)?'<div class="row" style="margin:8px 0 0"><button class="x" onclick="upd(\'mkt\',\''+m.id+'\',{st:\''+(m.st==="done"?"":"done")+'\'})">'+(m.st==="done"?"Rouvrir":"✓ Réglé")+'</button><button class="x" onclick="rm(\'mkt\',\''+m.id+'\')">✕</button></div>':'')+'</div>'}).join(""):'<div class="card mu">Aucune annonce.</div>'
};
function addMkt(){var t=val("mx");if(t){add("mkt",{k:val("mk"),tx:t});$("mx").value=""}}

/* ANNUAIRE */
V.dir=function(){return'<div class="card"><h2>📇 Annuaire de la classe</h2><div id="dl"></div></div>'};
F.dir=function(){
  var t=tot(),m=D.members.filter(function(x){return x.st!=="off"&&x.st!=="pend"});
  $("dl").innerHTML=m.length?m.map(function(x){var p=t[x.id]?t[x.id].p:0;return'<div class="it"><span><b>'+esc(x.nm)+'</b> <span class="mu">'+(x.role==="mod"?"· modérateur":"")+'</span><br><span class="mu">'+badges(p)+'</span></span><b>'+p+' pts</b></div>'}).join(""):'<p class="mu">'+(DB?"Aucun membre pour l’instant.":"L’annuaire est disponible en mode partagé.")+'</p>'
};

/* SUPER ADMIN : validation, journal */
var vsa=V.sa,fsa=F.sa;
V.sa=function(){return vsa()+'<div class="card"><h2>📜 Journal d’activité</h2><div id="slg"></div></div>'};
F.sa=function(){
  fsa();
  var pd=D.members.map(function(m,i){return[m,i]}).filter(function(x){return x[0].st==="pend"});
  if(pd.length)$("smb").insertAdjacentHTML("afterbegin",'<div class="notice"><b>'+pd.length+' ancien'+(pd.length>1?'s':'')+' compte'+(pd.length>1?'s':'')+' en attente</b><p class="mu">Ces comptes peuvent être activés avec un code d’invitation. Génère un code ci-dessus et transmets-leur.</p></div>'+pd.map(function(x){return'<div class="it"><span>'+esc(x[0].nm)+' <span class="mu">· en attente d’un code</span></span><button class="x" onclick="mbD('+x[1]+')">Supprimer</button></div>'}).join(""));
  var lg=D.logs.slice().sort(function(a,b){return b.t-a.t}).slice(0,30);
  $("slg").innerHTML=lg.length?lg.map(function(l){return'<div class="it"><span>'+esc(l.tx)+'<br><span class="mu">'+esc(l.by)+' · '+fmtDate(l.t)+'</span></span></div>'}).join(""):'<p class="mu">Aucune activité enregistrée.</p>'
};
var LBL={genCode:"Code généré",ban:"Utilisateur banni",purge:"Salon vidé",resetLg:"Classement remis à zéro",mbS:"Accès membre modifié",mbD:"Membre retiré",mbR:"Rôle modifié",cdT:"Code révoqué ou réactivé",cdD:"Code supprimé",tgTab:"Section affichée ou masquée"};
Object.keys(LBL).forEach(function(n){var f=window[n];window[n]=function(){var r=f.apply(null,arguments);logA(LBL[n]);return r}});

V.set=function(){
  var em=["🙂","😎","🤓","🦊","🐼","🚀","⚽","🎨","🎵","🌟"];
  return'<div class="card"><h2>👤 Mon profil</h2><div class="row"><input id="sp" value="'+esc(P.n)+'" placeholder="Pseudo" maxlength="20"><select id="se">'+em.map(function(e){return'<option'+(e===P.e?" selected":"")+'>'+e+'</option>'}).join("")+'</select><input id="sc" type="color" value="'+esc(P.c)+'" style="flex:none;width:56px;padding:2px"><button class="p" onclick="saveP()">Enregistrer</button></div><p class="mu">Utilise un pseudo, pas ton vrai nom. '+(admin?'Tu as les droits d’administration (modérer, épingler, supprimer).':'')+'</p></div><div class="card"><h2>🔒 Règles de la classe</h2><p class="mu">Reste respectueux, ne partage aucune info privée (adresse, téléphone, photos de camarades sans accord) et signale 🚩 tout message gênant.</p></div>'
};
function saveP(){P.n=val("sp");P.e=$("se").value;P.c=$("sc").value;CCAPI("/api/session",{method:"POST",body:JSON.stringify({action:"profile",name:P.n,emoji:P.e,color:P.c})}).then(function(){ $("me").value=P.n;toast("Profil enregistré")}).catch(err)}
$("me").value=P.n;
$("me").onchange=function(){P.n=this.value.trim()};

/* démarrage */
(async function(){
  try{
    var me=await CCAPI("/api/session");
    DB=await claude.use("db");
    var u=await claude.use("user");
    UID=await u.id();sa=!!me.sa;admin=await u.canEdit();P.n=me.name||"";P.e=me.emoji||"🙂";P.c=me.color||"#3b5bdb";$("me").value=P.n;
    shared=true;booting=false;Object.keys(D).forEach(sub);R()
  }catch(e){DB=null;booting=false;cloudError=e&&e.message||"Impossible de joindre la base cloud.";R()}
})();
R();
