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
   Analyse flash — pilote du formulaire libre-service
   Ne s'active que sur la page qui contient #flash-form.
   ============================================================ */
(function () {
  var form = document.getElementById('flash-form');
  if (!form) return;

  var champ    = document.getElementById('flash-site');
  var bouton   = document.getElementById('flash-go');
  var attente  = document.getElementById('flash-attente');
  var etape    = document.getElementById('flash-etape');
  var erreur   = document.getElementById('flash-erreur');
  var resultat = document.getElementById('flash-resultat');
  var encore   = document.getElementById('flash-encore');

  var ETAPES = [
    'Nous ouvrons votre page d’accueil…',
    'Nous lisons votre fichier robots.txt…',
    'Nous nous présentons comme le robot de ChatGPT…',
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
    var s = d.score_indicatif, g = d.gravite;
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

  function afficher(d) {
    var v = verdict(d);
    resultat.className = v.c;
    document.getElementById('flash-score').textContent = d.score_indicatif;
    var jauge = document.getElementById('flash-jauge');
    if (jauge) jauge.style.setProperty('--v', Math.max(0, Math.min(1, (+d.score_indicatif || 0) / 30)));
    document.getElementById('flash-titre').textContent = v.t;
    document.getElementById('flash-resume').textContent = v.r;
    document.getElementById('flash-domaine').textContent = d.domaine;
    document.getElementById('flash-poids').textContent =
      d.poids ? ('page d’accueil : ' + d.poids) : 'page non lue';

    var boite = document.getElementById('flash-defauts');
    boite.textContent = '';
    (d.defauts || []).forEach(function (df) {
      var el = document.createElement('div');
      el.className = 'flash-d g' + df.gravite;
      var h = document.createElement('h3');
      var e = document.createElement('span');
      e.className = 'etiq';
      e.textContent = df.gravite >= 3 ? 'Bloquant' : 'À corriger';
      h.appendChild(e);
      h.appendChild(document.createTextNode(df.titre));
      var p = document.createElement('p');
      p.textContent = df.texte;
      el.appendChild(h); el.appendChild(p);
      boite.appendChild(el);
    });

    var ok = d.controles_ok || [];
    var bloc = document.getElementById('flash-ok-bloc');
    var liste = document.getElementById('flash-ok-liste');
    liste.textContent = '';
    ok.forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; liste.appendChild(li);
    });
    document.getElementById('flash-ok-n').textContent = ok.length;
    var okL = document.getElementById('flash-ok-l');
    if (okL) okL.textContent = ok.length > 1 ? 'contrôles passés' : 'contrôle passé';
    bloc.hidden = ok.length === 0;

    // Reporte le contexte dans le formulaire de la seconde moitié, pour ne pas
    // redemander au visiteur ce qu'il vient de saisir.
    var champSite = document.getElementById('releve-site');
    var champScore = document.getElementById('releve-score');
    if (champSite) champSite.value = d.domaine || '';
    if (champScore) champScore.value = (d.score_indicatif != null ? d.score_indicatif : '') + '/30';

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

  /* --- Seconde moitié : le relevé IA, envoyé sans quitter la page --- */
  var releve  = document.getElementById('releve-form');
  var envoye  = document.getElementById('flash-envoye');
  var etape2  = document.getElementById('flash-et2');

  if (releve) releve.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var bouton = document.getElementById('releve-go');
    bouton.disabled = true;
    var avant = bouton.textContent;
    bouton.textContent = 'Envoi…';

    // Netlify Forms accepte une soumission encodée en formulaire sur la racine.
    var donnees = new URLSearchParams(new FormData(releve)).toString();
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: donnees
    })
      .then(function (r) {
        if (!r.ok) throw new Error('refus');
        releve.hidden = true;
        if (envoye) envoye.hidden = false;
        if (etape2) etape2.classList.add('is-on');
        if (envoye) envoye.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
      .catch(function () {
        bouton.disabled = false;
        bouton.textContent = avant;
        montrerErreur('L’envoi n’a pas abouti. Réessayez, ou écrivez-nous directement.');
      });
  });

  if (encore) encore.addEventListener('click', function () {
    resultat.hidden = true;
    erreur.hidden = true;
    if (releve) { releve.hidden = false; releve.reset(); }
    if (envoye) envoye.hidden = true;
    if (etape2) etape2.classList.remove('is-on');
    var bg = document.getElementById('releve-go');
    if (bg) { bg.disabled = false; bg.textContent = 'Recevoir le relevé'; }
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
