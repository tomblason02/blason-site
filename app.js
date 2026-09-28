/* Blason — script commun (menu, cookies, formulaires, espace client démo) */
(function () {
  "use strict";
  var SPA = !!document.getElementById("app"); // mode "une seule page" (prévisualisation)

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function store(key, val) {
    try {
      if (val === undefined) { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function go(page) {
    if (SPA) { location.hash = "#/" + page; } else { location.href = page + ".html"; }
  }
  function currentPage() {
    if (SPA) { var h = location.hash.replace(/^#\/?/, ""); return h.split("?")[0] || "accueil"; }
    var f = location.pathname.split("/").pop().replace(/\.html$/, "");
    return f === "" || f === "index" ? "accueil" : f;
  }

  /* ---------- Menu mobile ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".burger");
    if (b) { var nav = $(".nav"); nav.classList.toggle("open"); b.setAttribute("aria-expanded", nav.classList.contains("open")); }
    else if (e.target.closest(".nav a")) { var n = $(".nav"); if (n) n.classList.remove("open"); }
  });

  /* ---------- Bandeau cookies ---------- */
  function initCookies() {
    var c = $("#cookie"); if (!c) return;
    if (store("slc_cookies")) { c.hidden = true; return; }
    c.hidden = false;
    $$("[data-cookie]", c).forEach(function (btn) {
      btn.addEventListener("click", function () { store("slc_cookies", btn.getAttribute("data-cookie")); c.hidden = true; });
    });
  }

  /* ---------- Session (démo, côté navigateur uniquement) ---------- */
  function user() { return store("slc_session"); }
  function setNav() {
    var u = user();
    $$("[data-auth='in']").forEach(function (el) { el.hidden = !u; });
    $$("[data-auth='out']").forEach(function (el) { el.hidden = !!u; });
    var name = $("[data-user-name]"); if (name && u) name.textContent = u.prenom;
  }

  /* ---------- Formulaires ---------- */
  function showAlert(form, type, msg) {
    var box = $(".alert", form) || form.insertBefore(document.createElement("div"), form.firstChild);
    box.className = "alert alert-" + type; box.textContent = msg; box.hidden = false;
    box.scrollIntoView({ block: "nearest" });
  }
  function bindForms() {
    var inscription = $("#form-inscription");
    if (inscription) inscription.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = Object.fromEntries(new FormData(inscription).entries());
      if (d.password.length < 8) return showAlert(inscription, "err", "Le mot de passe doit contenir au moins 8 caractères.");
      if (d.password !== d.password2) return showAlert(inscription, "err", "Les deux mots de passe ne sont pas identiques.");
      if (!d.cgu) return showAlert(inscription, "err", "Vous devez accepter les CGU et la politique de confidentialité.");
      var users = store("slc_users") || {};
      if (users[d.email]) return showAlert(inscription, "err", "Un compte existe déjà avec cet e-mail. Connectez-vous.");
      users[d.email] = { prenom: d.prenom, nom: d.nom, etablissement: d.etablissement, ville: d.ville, email: d.email, password: d.password, created: new Date().toISOString() };
      store("slc_users", users);
      store("slc_session", { email: d.email, prenom: d.prenom, etablissement: d.etablissement, ville: d.ville });
      setNav(); go("espace-client");
    });

    var login = $("#form-connexion");
    if (login) login.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = Object.fromEntries(new FormData(login).entries());
      var users = store("slc_users") || {};
      var u = users[d.email];
      if (!u || u.password !== d.password) return showAlert(login, "err", "E-mail ou mot de passe incorrect.");
      store("slc_session", { email: u.email, prenom: u.prenom, etablissement: u.etablissement, ville: u.ville });
      setNav(); go("espace-client");
    });

    var forgot = $("#form-oubli");
    if (forgot) forgot.addEventListener("submit", function (e) {
      e.preventDefault();
      showAlert(forgot, "ok", "Si un compte existe avec cette adresse, un lien de réinitialisation vient d'être envoyé (démo : aucun e-mail réel n'est envoyé).");
    });

    $$("[data-demo-form]").forEach(function (f) {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var msg = f.getAttribute("data-demo-form") || "Merci, votre demande est bien enregistrée. Nous revenons vers vous sous 24 h ouvrées.";
        showAlert(f, "ok", msg);
        f.querySelector("button[type=submit]").disabled = true;
      });
    });

    $$("[data-logout]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); store("slc_session", null); setNav(); go("accueil"); });
    });
  }

  /* ---------- Espace client (protégé) ---------- */
  function initDashboard() {
    var dash = $("#dashboard"); if (!dash) return;
    var u = user();
    if (!u) { go("connexion"); return; }
    $$("[data-u]", dash).forEach(function (el) { el.textContent = u[el.getAttribute("data-u")] || "—"; });
  }

  /* ---------- Animations (apparition au défilement, compteurs, barres, chat) ---------- */
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function countUp(el) {
    var target = +el.getAttribute("data-count"), start = null, dur = 1100;
    if (reduced || !(target > 0)) { el.textContent = target; return; }
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function growBars(root) {
    $$("[data-w]", root).forEach(function (b, i) {
      b.style.setProperty("--w", b.getAttribute("data-w") + "%");
      if (reduced) { b.classList.add("go"); return; }
      setTimeout(function () { b.classList.add("go"); }, 120 + i * 90);
    });
    $$("[data-arc]", root).forEach(function (a) {
      var v = +a.getAttribute("data-arc"), len = 157;
      a.classList.add(v > 70 ? "ok" : v > 40 ? "mid" : "bad");
      setTimeout(function () { a.style.strokeDashoffset = len - len * v / 100; }, reduced ? 0 : 150);
    });
  }
  /* Onglets du rapport : défilement automatique, clic pour choisir */
  function initTabs(root) {
    var tabs = $$(".tab", root), panels = $$(".panel", root), bar = $(".tab-progress i", root), cur = 0, timer;
    if (!tabs.length || root._tabs) return; root._tabs = true;
    function show(i, auto) {
      cur = i;
      tabs.forEach(function (t, k) { t.classList.toggle("active", k === i); t.setAttribute("aria-selected", k === i); });
      panels.forEach(function (p, k) { p.classList.toggle("active", k === i); });
      growBars(panels[i]); $$("[data-count]", panels[i]).forEach(countUp);
      if (bar) { bar.classList.remove("run"); void bar.offsetWidth; if (auto && !reduced) bar.classList.add("run"); }
    }
    function next() { show((cur + 1) % tabs.length, true); }
    function start() { stop(); if (!reduced) timer = setInterval(next, 4200); }
    function stop() { clearInterval(timer); }
    tabs.forEach(function (t, i) { t.addEventListener("click", function () { show(i, false); stop(); }); });
    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", function () { if (!tabs.some(function (t) { return t === document.activeElement; })) start(); });
    show(0, true); start();
  }
  function playChat(chat) {
    var me = $(".msg.me span", chat), typing = $(".msg.typing", chat), ans = $(".msg.answer", chat), verdict = $(".msg.verdict", chat);
    if (reduced || chat.classList.contains("play")) return;
    chat.classList.add("play");
    var text = me.getAttribute("data-text"), i = 0;
    (function type() {
      me.textContent = text.slice(0, ++i);
      if (i < text.length) return setTimeout(type, 38);
      me.parentNode.classList.add("done");
      setTimeout(function () { typing.classList.add("show"); }, 350);
      setTimeout(function () { typing.classList.add("hide"); ans.classList.add("show"); }, 1900);
      setTimeout(function () { verdict.classList.add("show"); }, 2700);
    })();
  }
  function animateIn(el) {
    el.classList.add("in");
    $$("[data-count]", el).forEach(countUp);
    if (el.hasAttribute("data-count")) countUp(el);
    growBars(el);
    if (el.hasAttribute("data-tabs")) initTabs(el);
    $$("[data-tabs]", el).forEach(initTabs);
    $$("[data-chat]", el).forEach(playChat);
    if (el.hasAttribute("data-chat")) playChat(el);
  }
  window.blasonAnimer = animateIn;
  function initMotion() {
    $$(".stagger").forEach(function (g) { Array.prototype.forEach.call(g.children, function (c, i) { c.style.setProperty("--i", i); }); });
    // Les éléments visibles au chargement s'animent tout de suite ; les autres à l'arrivée dans l'écran
    var targets = $$("[data-reveal], .mock, #dashboard");
    var lazy = [];
    targets.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 || reduced) { animateIn(el); }
      else { el.classList.add("reveal"); lazy.push(el); }
    });
    if (lazy.length && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { animateIn(en.target); io.unobserve(en.target); } });
      }, { threshold: 0.18 });
      lazy.forEach(function (el) { io.observe(el); });
    } else { lazy.forEach(animateIn); }
  }

  /* ---------- Routage (mode une seule page) ---------- */
  function render() {
    var page = currentPage();
    if (SPA) {
      var tpl = document.getElementById("page-" + page) || document.getElementById("page-404");
      var app = document.getElementById("app");
      app.innerHTML = "";
      var node = tpl.content.cloneNode(true);
      var wrapper = document.createElement("div"); wrapper.className = "page"; wrapper.appendChild(node);
      app.appendChild(wrapper);
      window.scrollTo(0, 0);
      var t = tpl.getAttribute("data-title"); document.title = (t ? t + " — " : "") + "Blason";
    }
    $$(".nav a").forEach(function (a) {
      var target = a.getAttribute("href").replace(/^#\//, "").replace(/\.html$/, "");
      a.classList.toggle("active", target === page || (page === "accueil" && (target === "" || target === "index")));
    });
    setNav(); bindForms(); initDashboard(); initMotion();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var y = $("[data-year]"); if (y) y.textContent = new Date().getFullYear();
    initCookies(); render();
    if (SPA) window.addEventListener("hashchange", render);
  });
})();

/* ============================================================
   Mouvement calme : en-tête, parallaxe des jetons, mots qui s'allument.
   Rien ne bouge si l'utilisateur a demandé à réduire les animations.
   ============================================================ */
(function () {
  var doux = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* --- les mots de la déclaration s'allument au fil du défilement --- */
  function decouperMots(el) {
    if (el.getAttribute('data-mots-prets')) return;
    function traiter(noeud) {
      Array.prototype.slice.call(noeud.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (m) {
            if (!m) return;
            if (/^\s+$/.test(m)) { frag.appendChild(document.createTextNode(m)); return; }
            var sp = document.createElement('span'); sp.className = 'wd'; sp.textContent = m; frag.appendChild(sp);
          });
          noeud.replaceChild(frag, n);
        } else if (n.nodeType === 1) traiter(n);
      });
    }
    traiter(el);
    el.setAttribute('data-mots-prets', '1');
  }

  function init() {
    var entete = document.querySelector('.site-header');
    var panneaux = Array.prototype.slice.call(document.querySelectorAll('[data-h3], .page-head, .auth-scene'));
    var mots = Array.prototype.slice.call(document.querySelectorAll('[data-mots]'));
    mots.forEach(decouperMots);

    var enAttente = false;
    function cadre() {
      enAttente = false;
      var y = window.scrollY || 0, H = window.innerHeight;
      if (entete) entete.classList.toggle('is-stuck', y > 24);
      // filet de sécurité : un défilement rapide peut faire rater l'observateur ;
      // tout bloc déjà atteint est révélé, pour ne jamais laisser un contenu invisible
      var cachees = document.querySelectorAll('.reveal:not(.in)');
      for (var c = 0; c < cachees.length; c++) {
        if (cachees[c].getBoundingClientRect().top < H * 0.9 && window.blasonAnimer) window.blasonAnimer(cachees[c]);
      }
      if (!doux) panneaux.forEach(function (pn) {
        var r = pn.getBoundingClientRect();
        var p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height)));
        pn.style.setProperty('--p', p.toFixed(3));
      });
      mots.forEach(function (m) {
        var r = m.getBoundingClientRect();
        // 0 quand le bloc entre par le bas, 1 quand il atteint le tiers haut de l'écran
        var p = doux ? 1 : Math.max(0, Math.min(1, (H * 0.92 - r.top) / (H * 0.62)));
        var w = m.querySelectorAll('.wd'), n = Math.round(p * w.length);
        for (var k = 0; k < w.length; k++) w[k].classList.toggle('on', k < n);
      });
    }
    function demander() { if (!enAttente) { enAttente = true; requestAnimationFrame(cadre); } }
    window.addEventListener('scroll', demander, { passive: true });
    window.addEventListener('resize', demander);
    cadre();

    /* léger décalage des jetons selon la souris, sur grand écran seulement */
    if (!doux && window.matchMedia('(pointer: fine)').matches) panneaux.forEach(function (pn) {
      pn.addEventListener('pointermove', function (e) {
        var r = pn.getBoundingClientRect();
        pn.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 2 - 1).toFixed(3));
        pn.style.setProperty('--my', ((e.clientY - r.top) / r.height * 2 - 1).toFixed(3));
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  /* la prévisualisation mono-page rejoue le rendu : on relance après chaque navigation */
  window.addEventListener('hashchange', function () { setTimeout(init, 40); });
})();

/* ============================================================
   Analyse flash — pilote de la page libre-service
   Ne s'active que sur la page qui contient #flash-form.

   Deux modes, choisis selon ce que le serveur annonce (GET /api/scan) :
   - « email »  : aucune clé d'API configurée, le relevé IA part par e-mail
                  (fonctionnement d'origine, inchangé) ;
   - « direct » : les questions sont posées en direct aux moteurs, la grille
                  se remplit à l'écran, la fiche Google est lue.
   Tout texte venu du serveur ou d'une IA est inséré en textContent.
   ============================================================ */
(function () {
  var form = document.getElementById('flash-form');
  if (!form) return;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte != null) e.textContent = texte;
    return e;
  }

  var champ    = $('flash-site');
  var bouton   = $('flash-go');
  var attente  = $('flash-attente');
  var etape    = $('flash-etape');
  var erreur   = $('flash-erreur');
  var resultat = $('flash-resultat');
  var encore   = $('flash-encore');

  var etat = { scan: null, direct: false, gen: 0, releve: null };

  /* --- mode email / direct --- */
  function aMoteur(m) { return !!(m && (m.chatgpt || m.gemini || m.perplexity)); }
  function mode(direct) {
    etat.direct = !!direct;
    document.documentElement.setAttribute('data-releve', direct ? 'direct' : 'email');
    var nom = $('releve-nom');
    if (nom) nom.required = !!direct;
  }
  mode(false);
  try {
    fetch('/api/scan', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.moteurs) mode(aMoteur(j.moteurs)); })
      .catch(function () {});
  } catch (e) {}

  /* --- première moitié : l'analyse du site --- */
  var ETAPES = [
    'Nous ouvrons votre page d’accueil…',
    'Nous lisons votre fichier robots.txt…',
    'Nous nous présentons comme le robot de ChatGPT…',
    'Nous lisons vos pages contact et services…',
    'Nous cherchons vos informations dans le texte lisible…',
    'Nous mettons en forme le résultat…'
  ];
  var minuteur = null;

  function defiler() {
    var i = 0;
    etape.textContent = ETAPES[0];
    minuteur = setInterval(function () {
      i = Math.min(i + 1, ETAPES.length - 1);
      etape.textContent = ETAPES[i];
    }, 1400);
  }

  function montrerErreur(msg) {
    erreur.textContent = msg;
    erreur.hidden = false;
  }

  function verdict(d) {
    var g = d.gravite;
    if (d.statut === 'injoignable')
      return { c: 'f-mauvais', t: 'Nous n’avons pas pu ouvrir votre site',
               r: 'Tant que le site ne répond pas, aucun moteur ne peut le lire. C’est le seul point à régler avant tous les autres.' };
    if (g >= 3)
      return { c: 'f-mauvais', t: 'Les IA ne lisent pas correctement votre site',
               r: 'Au moins un blocage empêche les robots des moteurs de réponse d’accéder à vos informations. Ce sont des corrections techniques, pas des travaux de fond.' };
    if (g === 2)
      return { c: 'f-moyen', t: 'Votre site est lisible, mais il en dit peu',
               r: 'Rien ne bloque l’accès. Ce qui manque, ce sont les éléments qui permettent à une machine de comprendre qui vous êtes et ce que vous faites.' };
    return { c: 'f-bon', t: 'Rien à signaler côté technique',
             r: 'Les sept contrôles passent. Ce qui ne veut pas dire que vous êtes cité — voyez juste en dessous pourquoi.' };
  }

  /* Surligne des mots dans un texte, sans jamais passer par innerHTML. */
  function surligner(cible, texte, termes) {
    cible.textContent = '';
    termes = (termes || []).filter(function (t) { return t && t.length >= 3; });
    if (!termes.length) { cible.textContent = texte; return; }
    var echappe = termes.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    // On surligne le mot entier (« Bouchon », pas « Bouch »).
    var re = new RegExp('(?:' + echappe.join('|') + ')[A-Za-zÀ-ÖØ-öø-ÿ]*', 'gi');
    var dernier = 0, m;
    while ((m = re.exec(texte)) !== null) {
      if (m.index > dernier) cible.appendChild(document.createTextNode(texte.slice(dernier, m.index)));
      cible.appendChild(el('mark', null, m[0]));
      dernier = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    if (dernier < texte.length) cible.appendChild(document.createTextNode(texte.slice(dernier)));
  }

  function racines(expr) {
    return String(expr || '').split(/[\s'’-]+/).filter(function (m) { return m.length >= 4; })
      .map(function (m) { return m.slice(0, Math.max(5, m.length - 3)); });
  }

  function afficherLecture(d) {
    var L = d.lecture, bloc = $('flash-lecture');
    if (!bloc) return;
    if (!L) { bloc.hidden = true; return; }
    $('fl-url').textContent = (d.url || d.domaine || '').replace(/^https?:\/\//, '');
    var t = $('fl-titre');
    t.textContent = L.titre || 'Pas de titre';
    t.classList.toggle('vide', !L.titre);
    var ds = $('fl-desc');
    ds.textContent = L.description || 'Pas de description : le moteur choisit lui-même un bout de texte.';
    ds.classList.toggle('vide', !L.description);
    var p = d.profil || {};
    surligner($('fl-debut'), L.debut || 'Aucun texte lisible.', racines(p.metier).concat(racines(p.ville)));

    var ul = $('fl-constats');
    ul.textContent = '';
    (L.constats || []).forEach(function (c) {
      ul.appendChild(el('li', c.ok ? 'ok' : 'ko', c.texte));
    });
    var pg = $('fl-pages');
    pg.textContent = (L.pages || []).map(function (x) {
      return x.nom + ' (' + x.mots + ' mot' + (x.mots > 1 ? 's' : '') + ')';
    }).join(' · ');
    bloc.hidden = false;
  }

  // Préremplit le formulaire du relevé avec ce que l'analyse a déduit.
  function preremplir(d) {
    var p = d.profil || {};
    var champs = { 'releve-metier': p.metier, 'releve-lieu': p.lieu, 'releve-nom': p.nom };
    Object.keys(champs).forEach(function (id) {
      var c = $(id);
      if (!c) return;
      if (!c.value || c.getAttribute('data-auto') === '1') {
        c.value = champs[id] || '';
        c.setAttribute('data-auto', '1');
      }
    });
  }
  ['releve-metier', 'releve-lieu', 'releve-nom'].forEach(function (id) {
    var c = $(id);
    if (c) c.addEventListener('input', function () { c.setAttribute('data-auto', '0'); });
  });

  function afficher(d) {
    etat.scan = d;
    if (d.moteurs) mode(aMoteur(d.moteurs));
    var v = verdict(d);
    resultat.className = v.c;
    $('flash-score').textContent = d.score_indicatif;
    var jauge = $('flash-jauge');
    if (jauge) jauge.style.setProperty('--v', Math.max(0, Math.min(1, (+d.score_indicatif || 0) / 30)));
    $('flash-titre').textContent = v.t;
    $('flash-resume').textContent = v.r;
    $('flash-domaine').textContent = d.domaine;
    $('flash-poids').textContent = d.poids ? ('page d’accueil : ' + d.poids) : 'page non lue';

    var boite = $('flash-defauts');
    boite.textContent = '';
    (d.defauts || []).forEach(function (df) {
      var bloc = el('div', 'flash-d g' + df.gravite);
      var h = el('h3');
      h.appendChild(el('span', 'etiq', df.gravite >= 3 ? 'Bloquant' : 'À corriger'));
      h.appendChild(document.createTextNode(df.titre));
      bloc.appendChild(h);
      bloc.appendChild(el('p', null, df.texte));
      boite.appendChild(bloc);
    });

    var ok = d.controles_ok || [];
    var liste = $('flash-ok-liste');
    liste.textContent = '';
    ok.forEach(function (t) { liste.appendChild(el('li', null, t)); });
    $('flash-ok-n').textContent = ok.length;
    var okL = $('flash-ok-l');
    if (okL) okL.textContent = ok.length > 1 ? 'contrôles passés' : 'contrôle passé';
    $('flash-ok-bloc').hidden = ok.length === 0;

    afficherLecture(d);

    // Reporte le contexte dans le formulaire de la seconde moitié, pour ne pas
    // redemander au visiteur ce qu'il vient de saisir.
    if ($('releve-site')) $('releve-site').value = d.domaine || '';
    if ($('releve-score')) $('releve-score').value = (d.score_indicatif != null ? d.score_indicatif : '') + '/30';
    preremplir(d);

    resultat.hidden = false;
    resultat.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var site = (champ.value || '').trim();
    if (!site) { champ.focus(); return; }

    erreur.hidden = true;
    resultat.hidden = true;
    attente.hidden = false;
    bouton.disabled = true;
    defiler();

    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: site })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { montrerErreur(res.j.message || 'L’analyse n’a pas abouti.'); return; }
        reinitialiserReleve();
        afficher(res.j);
      })
      .catch(function () {
        montrerErreur('L’analyse n’a pas abouti. Réessayez dans un instant.');
      })
      .finally(function () {
        clearInterval(minuteur);
        attente.hidden = true;
        bouton.disabled = false;
      });
  });

  /* ============================================================
     Seconde moitié : le relevé IA
     ============================================================ */
  var releve  = $('releve-form');
  var envoye  = $('flash-envoye');
  var etape2  = $('flash-et2');
  var erreurR = $('releve-erreur');

  function erreurReleve(msg) {
    if (!erreurR) { montrerErreur(msg); return; }
    erreurR.textContent = msg;
    erreurR.hidden = !msg;
  }

  function envoyerFormulaire() {
    return fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(releve)).toString()
    }).then(function (r) { if (!r.ok) throw new Error('refus'); });
  }

  // Mode e-mail (et mode de secours) : le formulaire part tel quel.
  function envoyerParEmail(valeurMode) {
    var b = $('releve-go');
    b.disabled = true;
    if ($('releve-mode')) $('releve-mode').value = valeurMode || 'email';
    envoyerFormulaire()
      .then(function () {
        releve.hidden = true;
        if (envoye) envoye.hidden = false;
        if (etape2) etape2.classList.add('is-on');
        if (envoye) envoye.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(function () {
        b.disabled = false;
        erreurReleve('L’envoi n’a pas abouti. Réessayez, ou écrivez-nous directement.');
      });
  }

  if (releve) releve.addEventListener('submit', function (ev) {
    ev.preventDefault();
    erreurReleve('');
    if (etat.direct && etat.scan) lancerDirect();
    else envoyerParEmail('email');
  });

  /* --- relevé en direct --- */
  var NOMS_MOTEURS = { chatgpt: 'ChatGPT', gemini: 'Gemini', perplexity: 'Perplexity' };
  var CONCURRENCE = 6;

  function plat(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  var VIDES = { le: 1, la: 1, les: 1, l: 1, au: 1, aux: 1, du: 1, de: 1, des: 1, d: 1, et: 1, chez: 1,
                sarl: 1, sas: 1, sasu: 1, eurl: 1, sa: 1, ei: 1, the: 1 };
  function cleNom(s) { return plat(s).split(' ').filter(function (m) { return m && !VIDES[m]; }).join(' '); }
  function memeNom(a, b) {
    var x = cleNom(a), y = cleNom(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var court = x.length < y.length ? x : y, long = court === x ? y : x;
    return court.length >= 8 && (' ' + long + ' ').indexOf(' ' + court + ' ') >= 0;
  }
  function hote(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  }
  function lienSur(url) { return /^https?:\/\//i.test(url || '') ? url : ''; }
  function rang(n) { return n === 1 ? '1re' : n + 'e'; }

  function reinitialiserReleve() {
    etat.gen++;
    etat.releve = null;
    var rd = $('rd');
    if (rd) rd.hidden = true;
    ['rd-grille', 'rd-detail', 'rd-moteurs', 'rd-noms', 'rd-sources', 'rd-fiche', 'rd-detail-score'].forEach(function (id) {
      if ($(id)) $(id).textContent = '';
    });
    ['rd-detail', 'rd-fin', 'rd-fiche', 'rd-methode'].forEach(function (id) { if ($(id)) $(id).hidden = true; });
    if (releve) releve.hidden = false;
    if (envoye) envoye.hidden = true;
    if (etape2) etape2.classList.remove('is-on');
    var b = $('releve-go');
    if (b) b.disabled = false;
    erreurReleve('');
  }

  function lancerDirect() {
    var s = etat.scan, p = s.profil || {};
    var metier = ($('releve-metier').value || '').trim();
    var lieu = ($('releve-lieu').value || '').trim();
    var memeMetier = plat(metier) === plat(p.metier);
    var corps = {
      domaine: s.domaine,
      email: ($('releve-email').value || '').trim(),
      metier: metier,
      lieu: lieu,
      ville: plat(lieu) === plat(p.lieu) ? p.ville : '',
      nom: ($('releve-nom').value || '').trim(),
      maps: ($('releve-maps').value || '').trim(),
      concurrents: ($('releve-concurrents').value || '').trim()
    };
    if (memeMetier && p.metier_pluriel) { corps.metier_pluriel = p.metier_pluriel; corps.feminin = !!p.feminin; }

    var b = $('releve-go');
    b.disabled = true;
    var gen = etat.gen;

    fetch('/api/releve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    })
      .then(function (r) { return r.json().then(function (j) { return { code: r.status, j: j }; }); })
      .then(function (res) {
        if (gen !== etat.gen) return;
        if (res.code === 503) { mode(false); envoyerParEmail('secours'); return; }
        if (res.code !== 200) { b.disabled = false; erreurReleve(res.j.message || 'Le relevé n’a pas pu démarrer.'); return; }
        demarrer(res.j, corps);
      })
      .catch(function () {
        if (gen !== etat.gen) return;
        b.disabled = false;
        erreurReleve('Le relevé n’a pas pu démarrer. Réessayez dans un instant.');
      });
  }

  function demarrer(ouverture, corps) {
    var R = etat.releve = {
      gen: etat.gen,
      jeton: ouverture.jeton,
      questions: ouverture.questions,
      moteurs: ouverture.moteurs,
      corps: corps,
      res: {},
      fait: 0,
      total: ouverture.questions.length * ouverture.moteurs.length,
      fiche: null,
      ficheAttendue: !!ouverture.fiche,
      fini: false,
      envoye: false
    };
    ouverture.moteurs.forEach(function (m) { R.res[m] = []; });

    if ($('releve-mode')) $('releve-mode').value = 'direct';
    releve.hidden = true;
    if (etape2) etape2.classList.add('is-on');
    var rd = $('rd');
    rd.hidden = false;
    rd.classList.toggle('simulation', !!ouverture.simulation);
    $('rd-titre').textContent = 'Nous posons vos ' + ouverture.questions.length + ' questions…';
    $('rd-sous').textContent = ouverture.moteurs.map(function (m) { return NOMS_MOTEURS[m]; }).join(', ')
      + (ouverture.simulation ? ' · MODE SIMULATION : réponses fictives' : ' · recherche web activée, depuis la France');
    $('rd-total').textContent = R.total;
    $('rd-fait').textContent = '0';
    $('rd-barre').style.width = '0%';
    construireGrille(R);
    rd.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (R.ficheAttendue) chargerFiche(R);

    var taches = [];
    R.questions.forEach(function (q, i) { R.moteurs.forEach(function (m) { taches.push({ m: m, i: i }); }); });
    var suivant = 0, actifs = 0;
    function pomper() {
      while (actifs < CONCURRENCE && suivant < taches.length) {
        (function (t) {
          actifs++;
          poser(R, t, 0).catch(function () {}).then(function () {
            actifs--;
            if (R.gen !== etat.gen) return;
            R.fait++;
            $('rd-fait').textContent = R.fait;
            $('rd-barre').style.width = Math.round(100 * R.fait / R.total) + '%';
            if (R.fait === R.total) terminer(R);
            else pomper();
          });
        })(taches[suivant++]);
      }
    }
    pomper();
  }

  function construireGrille(R) {
    var g = $('rd-grille');
    g.textContent = '';
    g.style.setProperty('--n', R.moteurs.length);
    var tete = el('div', 'rd-ligne rd-entete');
    tete.setAttribute('role', 'row');
    tete.appendChild(el('span', 'rd-q', 'Question posée'));
    R.moteurs.forEach(function (m) { tete.appendChild(el('span', 'rd-m', NOMS_MOTEURS[m])); });
    g.appendChild(tete);
    R.questions.forEach(function (q, i) {
      var ligne = el('div', 'rd-ligne');
      ligne.setAttribute('role', 'row');
      var cq = el('span', 'rd-q');
      cq.appendChild(el('i', null, String(i + 1)));
      cq.appendChild(document.createTextNode(q));
      ligne.appendChild(cq);
      R.moteurs.forEach(function (m) {
        var c = el('button', 'rd-c att');
        c.type = 'button';
        c.disabled = true;
        c.id = 'rd-c-' + m + '-' + i;
        c.setAttribute('data-m', NOMS_MOTEURS[m]);
        c.appendChild(el('span', 'rd-c-t', 'En attente'));
        c.addEventListener('click', function () { montrerReponse(R, m, i); });
        ligne.appendChild(c);
      });
      g.appendChild(ligne);
    });
  }

  function poser(R, t, essai) {
    var c = $('rd-c-' + t.m + '-' + t.i);
    if (c) { c.className = 'rd-c cours'; c.firstChild.textContent = 'En cours'; }
    var debut = Date.now();
    var stop = window.AbortController ? new AbortController() : null;
    var delai = setTimeout(function () { if (stop) stop.abort(); }, 60000);
    return fetch('/api/ia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: R.jeton, moteur: t.m, i: t.i }),
      signal: stop ? stop.signal : undefined
    })
      .then(function (r) {
        if (r.status >= 500 && essai === 0 && Date.now() - debut < 8000) throw new Error('reessayer');
        return r.json().catch(function () { return { ok: false, erreur: 'http' }; });
      })
      .catch(function (e) {
        if (essai === 0 && e && e.message === 'reessayer') return poser(R, t, 1).then(function () { return null; });
        return { ok: false, erreur: 'reseau' };
      })
      .then(function (j) {
        clearTimeout(delai);
        if (j === null || R.gen !== etat.gen) return;   // déjà traité par le second essai
        R.res[t.m][t.i] = j;
        peindre(c, j);
      });
  }

  function peindre(c, j) {
    if (!c) return;
    var t = c.firstChild;
    if (!j || !j.ok) {
      c.className = 'rd-c err';
      t.textContent = 'Sans réponse';
      c.disabled = true;
      return;
    }
    c.disabled = false;
    if (j.vous && j.vous.cite) {
      c.className = 'rd-c oui';
      t.textContent = j.vous.rang ? 'Cité · ' + rang(j.vous.rang) : 'Cité';
    } else {
      c.className = 'rd-c non';
      t.textContent = 'Absent';
      if (j.noms && j.noms.length) t.appendChild(el('small', null, ' · ' + j.noms.length + ' autre' + (j.noms.length > 1 ? 's' : '')));
    }
  }

  /* Réponse d'une IA, mise en forme sans HTML : paragraphes, listes, gras. */
  function rendreTexte(cible, texte, termes) {
    cible.textContent = '';
    var propre = String(texte || '')
      .replace(/\[(\d+)\]/g, '')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
      .replace(/\(\s*\[?[a-z0-9.-]+\.[a-z]{2,}\]?\s*\)/gi, '')
      .replace(/^#{1,6}\s*/gm, '');
    propre.split(/\n{2,}/).forEach(function (bloc) {
      var lignes = bloc.split('\n').filter(function (l) { return l.trim(); });
      if (!lignes.length) return;
      var enListe = lignes.every(function (l) { return /^\s*([-*•]|\d+[.)])\s+/.test(l); });
      var conteneur = enListe ? el('ul') : el('p');
      lignes.forEach(function (l, k) {
        var cible2 = enListe ? el('li') : conteneur;
        var ligne = enListe ? l.replace(/^\s*([-*•]|\d+[.)])\s+/, '') : l;
        if (!enListe && k > 0) cible2.appendChild(el('br'));
        ligne.split(/(\*\*[^*]+\*\*)/).forEach(function (morceau) {
          if (!morceau) return;
          var gras = /^\*\*[^*]+\*\*$/.test(morceau);
          var span = el(gras ? 'strong' : 'span');
          surligner(span, gras ? morceau.slice(2, -2) : morceau.replace(/\*\*/g, ''), termes);
          cible2.appendChild(span);
        });
        if (enListe) conteneur.appendChild(cible2);
      });
      cible.appendChild(conteneur);
    });
  }

  function montrerReponse(R, m, i) {
    var j = R.res[m][i];
    var d = $('rd-detail');
    if (!j || !j.ok) return;
    d.textContent = '';
    var tete = el('div', 'rd-d-tete');
    tete.appendChild(el('b', null, NOMS_MOTEURS[m]));
    tete.appendChild(el('span', 'muted', 'Question ' + (i + 1) + ' sur ' + R.questions.length));
    var fermer = el('button', 'rd-d-fermer', '×');
    fermer.type = 'button';
    fermer.setAttribute('aria-label', 'Fermer la réponse');
    fermer.addEventListener('click', function () { d.hidden = true; });
    tete.appendChild(fermer);
    d.appendChild(tete);
    d.appendChild(el('p', 'rd-d-q', R.questions[i]));

    var noms = j.noms || [];
    var nomVous = R.corps.nom;
    if (noms.length || (j.vous && j.vous.cite)) {
      var ol = el('ol', 'ia-noms rd-d-noms');
      noms.forEach(function (n) {
        var li = el('li', memeNom(n, nomVous) ? 'est-vous' : '');
        li.appendChild(el('b', null, n));
        li.appendChild(el('span', null, memeNom(n, nomVous) ? 'c’est vous' : 'cité'));
        ol.appendChild(li);
      });
      if (j.vous && j.vous.cite && !j.vous.rang) {
        var li2 = el('li', 'est-vous');
        li2.appendChild(el('b', null, nomVous));
        li2.appendChild(el('span', null, 'mentionné dans le texte'));
        ol.appendChild(li2);
      }
      d.appendChild(ol);
    } else {
      d.appendChild(el('p', 'rd-d-vide', 'Aucun établissement précis n’est cité dans cette réponse.'));
    }
    if (j.vous && !j.vous.cite && j.vous.source) {
      d.appendChild(el('p', 'rd-d-note', 'Votre site fait partie des sources consultées, mais votre nom n’apparaît pas dans la réponse.'));
    }

    var texte = el('div', 'rd-d-texte');
    rendreTexte(texte, j.texte, [nomVous, String(nomVous || '').replace(/^(le|la|les|l['’]|au|aux|chez)\s*/i, '')]);
    d.appendChild(texte);

    if (j.sources && j.sources.length) {
      var det = el('details', 'rd-d-sources');
      det.appendChild(el('summary', null, j.sources.length + ' source' + (j.sources.length > 1 ? 's' : '')));
      var ul = el('ul');
      j.sources.forEach(function (s) {
        var li = el('li');
        var u = lienSur(s.url);
        var a = el(u ? 'a' : 'span', null, s.titre || hote(s.url) || s.url);
        if (u) { a.href = u; a.target = '_blank'; a.rel = 'noopener nofollow ugc'; }
        li.appendChild(a);
        ul.appendChild(li);
      });
      det.appendChild(ul);
      d.appendChild(det);
    }
    d.appendChild(el('p', 'rd-d-meta', (j.modele || '') + ' · ' + Math.round((j.ms || 0) / 1000) + ' s'
      + (j.simulation ? ' · simulation' : '')));
    d.hidden = false;
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* --- synthèse --- */
  function domaineSource(s) {
    var t = (s.titre || '').trim().toLowerCase();
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t)) return t.replace(/^www\./, '');
    return hote(s.url);
  }

  function synthese(R) {
    var nomVous = R.corps.nom, domaine = etat.scan.domaine;
    var parMoteur = {}, conc = [], sources = {}, nOk = 0, pts = 0, vousN = 0, erreurs = 0;
    R.moteurs.forEach(function (m) {
      var pm = parMoteur[m] = { ok: 0, cite: 0, meilleur: null, noms: {} };
      R.res[m].forEach(function (j) {
        if (!j || !j.ok) { erreurs++; return; }
        nOk++; pm.ok++;
        if (j.vous && j.vous.cite) {
          vousN++; pm.cite++;
          pts += j.vous.rang ? (j.vous.rang <= 3 ? 1 : 0.5) : 0.75;
          if (j.vous.rang && (!pm.meilleur || j.vous.rang < pm.meilleur)) pm.meilleur = j.vous.rang;
        }
        var vus = {};
        (j.noms || []).forEach(function (n, k) {
          if (memeNom(n, nomVous)) return;
          var c = null;
          for (var x = 0; x < conc.length; x++) if (memeNom(conc[x].nom, n)) { c = conc[x]; break; }
          if (!c) { c = { nom: n, total: 0, par: {}, meilleur: 99 }; conc.push(c); }
          if (vus[c.nom]) return;
          vus[c.nom] = 1;
          c.total++;
          c.par[m] = (c.par[m] || 0) + 1;
          c.meilleur = Math.min(c.meilleur, k + 1);
          pm.noms[c.nom] = (pm.noms[c.nom] || 0) + 1;
        });
        var vusS = {};
        (j.sources || []).forEach(function (s) {
          var dm = domaineSource(s);
          if (!dm || vusS[dm]) return;
          vusS[dm] = 1;
          sources[dm] = (sources[dm] || 0) + 1;
        });
      });
    });
    conc.sort(function (a, b) { return b.total - a.total || a.meilleur - b.meilleur; });
    var leader = conc.length ? conc[0].total : 0;
    var sc = {
      citations: nOk ? Math.round(50 * pts / nOk) : 0,
      lisibilite: Math.max(0, Math.min(30, +etat.scan.score_indicatif || 0)),
      concurrents: leader === 0 ? (vousN > 0 ? 20 : 0) : Math.round(20 * Math.min(1, vousN / leader))
    };
    sc.total = sc.citations + sc.lisibilite + sc.concurrents;
    var srcs = Object.keys(sources).map(function (k) { return { d: k, n: sources[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
    return { parMoteur: parMoteur, conc: conc, sources: srcs, nOk: nOk, vousN: vousN, erreurs: erreurs,
             score: sc, domaine: domaine };
  }

  function terminer(R) {
    if (R.fini) return;
    R.fini = true;
    var S = R.synthese = synthese(R);
    $('rd-titre').textContent = 'Relevé terminé';
    $('rd-sous').textContent = S.nOk + ' réponses obtenues sur ' + R.total
      + (S.erreurs ? ' · ' + S.erreurs + ' sans réponse (délai dépassé ou moteur indisponible)' : '');

    // Trop de cases vides : on ne tire pas de conclusion, on passe au relevé par e-mail.
    if (S.nOk < R.total / 2) {
      erreurReleve('');
      $('rd-sous').textContent = 'Les moteurs n’ont donné que ' + S.nOk + ' réponses sur ' + R.total
        + '. Nous refaisons le relevé nous-mêmes et vous l’envoyons par e-mail sous 3 jours ouvrés.';
      envoyerResultat(R, 'secours');
      $('rd-methode').hidden = false;
      return;
    }

    var sc = S.score;
    var fin = $('rd-fin');
    var classe = S.vousN === 0 ? 'f-mauvais' : (S.vousN / S.nOk < 0.34 ? 'f-moyen' : 'f-bon');
    $('rd-verdict').className = 'flash-verdict rd-verdict ' + classe;
    $('rd-score').textContent = sc.total;
    $('rd-jauge').style.setProperty('--v', 0);
    setTimeout(function () { $('rd-jauge').style.setProperty('--v', sc.total / 100); }, 60);

    var top = S.conc.slice(0, 3).map(function (c) { return c.nom; });
    var t, r;
    if (S.vousN === 0) {
      t = 'Aucune IA ne vous cite';
      r = 'Sur ' + S.nOk + ' réponses, votre nom n’apparaît jamais.'
        + (top.length ? ' À votre place : ' + top.join(', ') + '.' : '');
    } else if (S.vousN / S.nOk < 0.34) {
      t = 'Vous êtes cité, mais rarement';
      r = 'Votre nom apparaît dans ' + S.vousN + ' réponse' + (S.vousN > 1 ? 's' : '') + ' sur ' + S.nOk + '.'
        + (top.length ? ' Les plus cités : ' + top.join(', ') + '.' : '');
    } else {
      t = 'Les IA vous citent déjà';
      r = 'Votre nom apparaît dans ' + S.vousN + ' réponses sur ' + S.nOk + '. L’enjeu : tenir cette place, et la prendre là où vous manquez.';
    }
    $('rd-verdict-t').textContent = t;
    $('rd-verdict-r').textContent = r;
    var ds = $('rd-detail-score');
    ds.textContent = '';
    [['Citations', sc.citations, 50], ['Lisibilité du site', sc.lisibilite, 30], ['Face aux concurrents', sc.concurrents, 20]]
      .forEach(function (x) {
        var li = el('li');
        li.appendChild(el('span', null, x[0]));
        li.appendChild(el('b', null, x[1] + ' / ' + x[2]));
        ds.appendChild(li);
      });

    // Une carte par moteur
    var cm = $('rd-moteurs');
    cm.textContent = '';
    R.moteurs.forEach(function (m) {
      var pm = S.parMoteur[m];
      var carte = el('div', 'rd-moteur' + (pm.cite ? ' cite' : ''));
      carte.appendChild(el('div', 'rd-moteur-n', NOMS_MOTEURS[m]));
      carte.appendChild(el('div', 'rd-moteur-v', pm.cite + ' / ' + pm.ok));
      carte.appendChild(el('div', 'rd-moteur-l', pm.cite
        ? 'réponses vous citent' + (pm.meilleur ? ' · meilleure place : ' + rang(pm.meilleur) : '')
        : 'réponses vous citent · jamais cité'));
      var noms = Object.keys(pm.noms).sort(function (a, b) { return pm.noms[b] - pm.noms[a]; }).slice(0, 3);
      if (noms.length) {
        var p = el('p', 'rd-moteur-top');
        p.appendChild(el('span', null, 'Cite surtout : '));
        p.appendChild(document.createTextNode(noms.join(', ')));
        carte.appendChild(p);
      }
      cm.appendChild(carte);
    });

    // Qui est cité à votre place
    var ol = $('rd-noms');
    ol.textContent = '';
    var leurs = (R.corps.concurrents || '').split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 3);
    var max = Math.max(1, S.conc.length ? S.conc[0].total : 1, S.vousN);
    var lignes = S.conc.slice(0, 6).map(function (c) { return { nom: c.nom, n: c.total, par: c.par }; });
    var parVous = {};
    R.moteurs.forEach(function (m) { parVous[m] = S.parMoteur[m].cite; });
    var vousLigne = { nom: R.corps.nom, n: S.vousN, par: parVous, vous: true };
    var pos = 0;
    while (pos < lignes.length && lignes[pos].n > S.vousN) pos++;
    lignes.splice(S.vousN ? pos : lignes.length, 0, vousLigne);
    lignes.forEach(function (l) {
      var li = el('li', l.vous ? 'est-vous' : '');
      var tete = el('div', 'rd-nom-l');
      tete.appendChild(el('b', null, l.vous ? l.nom + ' (vous)' : l.nom));
      if (!l.vous && leurs.some(function (x) { return memeNom(x, l.nom); })) tete.appendChild(el('em', 'rd-tag', 'votre concurrent'));
      tete.appendChild(el('span', 'rd-nom-n', l.n + ' réponse' + (l.n > 1 ? 's' : '')));
      li.appendChild(tete);
      var barre = el('div', 'rd-nom-barre');
      var rempli = el('span');
      rempli.style.width = Math.round(100 * l.n / max) + '%';
      barre.appendChild(rempli);
      li.appendChild(barre);
      li.appendChild(el('div', 'rd-nom-par', R.moteurs.map(function (m) {
        return NOMS_MOTEURS[m] + ' ' + (l.par[m] || 0);
      }).join(' · ')));
      ol.appendChild(li);
    });
    leurs.forEach(function (x) {
      if (S.conc.some(function (c) { return memeNom(c.nom, x); })) return;
      var li = el('li', 'absent');
      var tete = el('div', 'rd-nom-l');
      tete.appendChild(el('b', null, x));
      tete.appendChild(el('em', 'rd-tag', 'votre concurrent'));
      tete.appendChild(el('span', 'rd-nom-n', 'jamais cité'));
      li.appendChild(tete);
      ol.appendChild(li);
    });

    // Sources
    var us = $('rd-sources');
    us.textContent = '';
    var hoteVous = String(S.domaine || '').replace(/:\d+$/, '');
    S.sources.slice(0, 10).forEach(function (s) {
      var li = el('li', s.d === hoteVous ? 'est-vous' : '');
      li.appendChild(el('b', null, s.d === hoteVous ? s.d + ' (vous)' : s.d));
      li.appendChild(el('span', null, String(s.n)));
      us.appendChild(li);
    });
    if (!S.sources.length) us.appendChild(el('li', 'vide', 'Les moteurs n’ont pas indiqué leurs sources.'));

    fin.hidden = false;
    $('rd-methode').hidden = false;
    fin.scrollIntoView({ behavior: 'smooth', block: 'start' });
    envoyerResultat(R, 'direct');
  }

  /* --- fiche Google --- */
  function chiffres(t) {
    var d = String(t || '').replace(/\D/g, '');
    if (d.indexOf('33') === 0) d = '0' + d.slice(2).replace(/^0/, '');
    return d;
  }

  function coherence(f) {
    var s = etat.scan, id = s.identite || {}, out = [];
    var dom = String(s.domaine || '').replace(/:\d+$/, '');
    if (!f.site) out.push({ ok: false, t: 'La fiche n’indique aucun site web : les moteurs ne relient pas la fiche à votre site.' });
    else if (hote(f.site) === dom) out.push({ ok: true, t: 'La fiche renvoie bien vers votre site.' });
    else out.push({ ok: false, t: 'La fiche renvoie vers un autre site (' + hote(f.site) + ').' });

    var tf = chiffres(f.telephone), ts = id.telephones_bruts || [];
    if (!tf) out.push({ ok: false, t: 'Aucun téléphone sur la fiche.' });
    else if (!ts.length) out.push({ ok: null, t: 'Téléphone sur la fiche, mais aucun sur le site : impossible de vérifier qu’ils concordent.' });
    else if (ts.indexOf(tf) >= 0) out.push({ ok: true, t: 'Même téléphone sur la fiche et sur le site.' });
    else out.push({ ok: false, t: 'Téléphone différent : ' + f.telephone + ' sur la fiche, ' + (id.telephones || [])[0] + ' sur le site.' });

    var cpf = (String(f.adresse || '').match(/\b\d{5}\b/) || [''])[0], cps = id.codes_postaux || [];
    if (cpf && cps.length) {
      out.push(cps.indexOf(cpf) >= 0
        ? { ok: true, t: 'Même code postal sur la fiche et sur le site.' }
        : { ok: false, t: 'Adresse différente : ' + cpf + ' sur la fiche, ' + cps[0] + ' sur le site.' });
    } else if (cpf) out.push({ ok: null, t: 'Le site n’affiche pas d’adresse complète : impossible de vérifier qu’elle concorde.' });

    out.push((f.horaires || []).length >= 7
      ? { ok: true, t: 'Horaires renseignés pour toute la semaine.' }
      : { ok: false, t: 'Horaires absents ou incomplets sur la fiche.' });
    if (f.statut === 'CLOSED_TEMPORARILY') out.push({ ok: false, t: 'La fiche indique « fermé temporairement ».' });
    if (f.statut === 'CLOSED_PERMANENTLY') out.push({ ok: false, t: 'La fiche indique « fermé définitivement ».' });
    if (f.nb_avis < 20) out.push({ ok: false, t: 'Peu d’avis (' + f.nb_avis + ') : c’est l’un des signaux que les moteurs regardent pour choisir.' });
    else out.push({ ok: true, t: f.nb_avis + ' avis.' });
    if (f.photos < 3) out.push({ ok: false, t: f.photos ? 'Seulement ' + f.photos + ' photo' + (f.photos > 1 ? 's' : '') + ' sur la fiche.' : 'Aucune photo sur la fiche.' });
    if (f.confiance === 'lien') out.push({ ok: null, t: 'Fiche retrouvée par votre lien ; elle ne porte pas exactement votre nom et ne renvoie pas vers votre site.' });
    return out;
  }

  function etoiles(n) {
    var r = Math.round(n || 0);
    return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
  }

  function chargerFiche(R) {
    var bloc = $('rd-fiche');
    bloc.textContent = '';
    bloc.appendChild(el('h4', null, 'Votre fiche Google'));
    bloc.appendChild(el('p', 'muted', 'Recherche de votre fiche…'));
    bloc.hidden = false;
    fetch('/api/fiche', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: R.jeton })
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return { trouvee: false, erreur: 'reseau' }; })
      .then(function (j) {
        if (R.gen !== etat.gen) return;
        R.fiche = j;
        afficherFiche(R, j);
        if (R.envoye === 'attente') envoyerResultat(R, R.modeFinal);
      });
  }

  function afficherFiche(R, j) {
    var bloc = $('rd-fiche');
    bloc.textContent = '';
    bloc.appendChild(el('h4', null, 'Votre fiche Google'));
    if (!j || !j.trouvee) {
      var p = el('p', 'rf-absente');
      if (j && (j.erreur === 'api' || j.erreur === 'delai' || j.erreur === 'reseau' || j.erreur === 'indisponible')) {
        p.textContent = 'La fiche n’a pas pu être lue cette fois-ci. Nous la vérifierons à la main.';
      } else {
        p.textContent = 'Nous n’avons pas trouvé de fiche Google à ce nom à ' + (R.corps.lieu || 'votre adresse')
          + '. Près de la moitié des citations d’entreprises locales viennent de la fiche Google : si elle n’existe pas, c’est la première chose à créer. Si elle existe, collez son lien dans le formulaire et relancez.';
      }
      bloc.appendChild(p);
      R.ficheResume = 'fiche non trouvée' + (j && j.erreur ? ' (' + j.erreur + ')' : '');
      return;
    }
    var f = j.fiche;
    var grille = el('div', 'rf-grille');
    var carte = el('div', 'rf-carte');
    carte.appendChild(el('div', 'rf-nom', f.nom));
    if (f.categorie) carte.appendChild(el('div', 'rf-cat', f.categorie));
    if (f.note != null) {
      var n = el('div', 'rf-note');
      n.appendChild(el('span', 'rf-etoiles', etoiles(f.note)));
      n.appendChild(document.createTextNode(' ' + String(f.note).replace('.', ',') + ' · ' + f.nb_avis + ' avis'));
      carte.appendChild(n);
    }
    var infos = el('ul', 'rf-infos');
    if (f.adresse) infos.appendChild(el('li', null, f.adresse));
    if (f.telephone) infos.appendChild(el('li', null, f.telephone));
    if (f.site) infos.appendChild(el('li', null, hote(f.site)));
    carte.appendChild(infos);
    if ((f.horaires || []).length) {
      var det = el('details', 'rf-horaires');
      det.appendChild(el('summary', null, 'Horaires'));
      var uh = el('ul');
      f.horaires.forEach(function (h) { uh.appendChild(el('li', null, h)); });
      det.appendChild(uh);
      carte.appendChild(det);
    }
    grille.appendChild(carte);

    var constats = coherence(f);
    var uc = el('ul', 'fl-constats rf-constats');
    constats.forEach(function (c) { uc.appendChild(el('li', c.ok === true ? 'ok' : (c.ok === false ? 'ko' : 'neutre'), c.t)); });
    grille.appendChild(uc);
    bloc.appendChild(grille);

    if ((f.avis || []).length) {
      var av = el('div', 'rf-avis');
      av.appendChild(el('h5', null, 'Les avis que Google met en avant'));
      f.avis.forEach(function (a) {
        var bl = el('blockquote', 'rf-un-avis');
        var tete = el('div', 'rf-avis-tete');
        var u = lienSur(a.auteur_url);
        var auteur = el(u ? 'a' : 'b', null, a.auteur);
        if (u) { auteur.href = u; auteur.target = '_blank'; auteur.rel = 'noopener nofollow ugc'; }
        tete.appendChild(auteur);
        if (a.note != null) tete.appendChild(el('span', 'rf-etoiles', etoiles(a.note)));
        if (a.quand) tete.appendChild(el('span', 'muted', a.quand));
        bl.appendChild(tete);
        if (a.texte) bl.appendChild(el('p', null, a.texte));
        av.appendChild(bl);
      });
      bloc.appendChild(av);
    }
    var attrib = el('p', 'rf-attrib');
    attrib.appendChild(document.createTextNode('Données Google Maps'));
    var um = lienSur(f.maps_url);
    if (um) {
      attrib.appendChild(document.createTextNode(' · '));
      var a2 = el('a', null, 'Voir la fiche sur Google Maps');
      a2.href = um; a2.target = '_blank'; a2.rel = 'noopener';
      attrib.appendChild(a2);
    }
    if (j.simulation) attrib.appendChild(document.createTextNode(' · simulation'));
    bloc.appendChild(attrib);

    // Pour le formulaire : l'identifiant de la fiche et nos constats, pas les données Google.
    R.ficheResume = 'place_id ' + f.id + ' · ' + constats.map(function (c) {
      return (c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : '· ') + c.t;
    }).join(' | ');
  }

  /* --- copie du relevé vers le formulaire Netlify (notification à Blason) --- */
  function resume(R) {
    var S = R.synthese || synthese(R);
    var l = [];
    l.push('Score ' + S.score.total + '/100 (citations ' + S.score.citations + '/50, lisibilité '
      + S.score.lisibilite + '/30, concurrents ' + S.score.concurrents + '/20)');
    l.push(R.moteurs.map(function (m) {
      var pm = S.parMoteur[m];
      return NOMS_MOTEURS[m] + ' ' + pm.cite + '/' + pm.ok;
    }).join(' · ') + (S.erreurs ? ' · ' + S.erreurs + ' sans réponse' : ''));
    l.push('Cités : ' + S.conc.slice(0, 6).map(function (c) { return c.nom + ' (' + c.total + ')'; }).join(', '));
    l.push('Sources : ' + S.sources.slice(0, 6).map(function (s) { return s.d + ' (' + s.n + ')'; }).join(', '));
    l.push('Questions sur : « ' + R.corps.metier + ' » à « ' + R.corps.lieu + ' », nom « ' + R.corps.nom + ' »');
    return l.join('\n').slice(0, 1800);
  }

  function envoyerResultat(R, valeurMode) {
    if (R.envoye === true) return;
    R.modeFinal = valeurMode;
    // On attend la fiche quelques secondes au plus, pour l'inclure.
    if (R.ficheAttendue && !R.fiche && R.envoye !== 'attente') {
      R.envoye = 'attente';
      setTimeout(function () { if (R.envoye === 'attente') envoyerResultat(R, valeurMode); }, 12000);
      return;
    }
    R.envoye = true;
    remplirCaches(R, valeurMode);
    envoyerFormulaire().catch(function () { R.envoye = false; });
  }

  function remplirCaches(R, valeurMode) {
    if ($('releve-mode')) $('releve-mode').value = valeurMode;
    if ($('releve-resultat')) $('releve-resultat').value = resume(R);
    if ($('releve-fiche')) $('releve-fiche').value = (R.ficheResume || (R.ficheAttendue ? 'fiche en attente' : 'fiche non demandée')).slice(0, 1500);
  }

  // Le visiteur ferme la page avant la fin : on garde au moins son e-mail et le partiel.
  window.addEventListener('pagehide', function () {
    var R = etat.releve;
    if (!R || R.envoye === true || !navigator.sendBeacon) return;
    try {
      remplirCaches(R, R.fini ? (R.modeFinal || 'direct') : 'partiel');
      var corps = new URLSearchParams(new FormData(releve)).toString();
      if (navigator.sendBeacon('/', new Blob([corps], { type: 'application/x-www-form-urlencoded' }))) R.envoye = true;
    } catch (e) {}
  });

  var imprimer = $('rd-imprimer');
  if (imprimer) imprimer.addEventListener('click', function () { window.print(); });

  /* --- recommencer --- */
  if (encore) encore.addEventListener('click', function () {
    reinitialiserReleve();
    resultat.hidden = true;
    erreur.hidden = true;
    if (releve) releve.reset();
    ['releve-metier', 'releve-lieu', 'releve-nom'].forEach(function (id) { if ($(id)) $(id).setAttribute('data-auto', '1'); });
    etat.scan = null;
    champ.value = '';
    champ.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* --- Arrivée depuis l'accueil (?site=…) : l'analyse part tout de suite --- */
  var demande = '';
  try { demande = (new URLSearchParams(location.search).get('site') || '').trim().slice(0, 200); } catch (e) {}
  if (demande) {
    champ.value = demande;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    setTimeout(function () {
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }, 120);
  }
})();
