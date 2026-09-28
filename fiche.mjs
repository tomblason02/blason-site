// Fichier généré par build.py : tronc commun + fiche. Ne pas modifier ici.

// ============================================================
//  Blason — tronc commun des fonctions Netlify
//
//  build.py recopie ce fichier en tête de chaque fonction livrée
//  (scan, releve, ia, fiche) : chaque fichier reste autonome, sans
//  dépendance npm, et se dépose tel quel dans netlify/functions.
//
//  Les clés d'API ne sont lues que dans process.env, côté serveur.
//  Elles ne sont jamais renvoyées au navigateur ni écrites dans un log.
// ============================================================

import dns from 'node:dns/promises';
import net from 'node:net';
import crypto from 'node:crypto';

// ---------- constantes ----------

const UA_NAV = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
             + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; '
             + 'GPTBot/1.1; +https://openai.com/gptbot';

// Identifie la provenance dans les logs du site analysé. Courtoisie, pas obligation.
const ENTETE_SOURCE = { 'X-Blason-Scan': 'https://blason-ia.fr/analyse-flash' };

const POIDS_MAX = 5 * 1024 * 1024;   // on arrête de lire au-delà

const env = k => String(process.env[k] || '').trim();

// ---------- garde-fous ----------

// Compteur en mémoire, donc par instance de fonction : imparfait par nature.
// Suffit à arrêter le martelage évident. La vraie limite de dépense est
// posée chez les fournisseurs (crédits prépayés, quotas journaliers).
function cadenceur(fenetreMs, max) {
  const passages = new Map();
  return function depasse(cle) {
    const t = Date.now();
    const liste = (passages.get(cle) || []).filter(x => t - x < fenetreMs);
    if (liste.length >= max) { passages.set(cle, liste); return true; }
    liste.push(t);
    passages.set(cle, liste);
    if (passages.size > 5000) passages.clear();
    return false;
  };
}

function ipDe(req, context) {
  return context?.ip
      || req.headers.get('x-nf-client-connection-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || 'inconnue';
}

function estPrivee(adresse) {
  const v = net.isIP(adresse);
  if (v === 4) {
    const o = adresse.split('.').map(Number);
    if (o[0] === 10 || o[0] === 127 || o[0] === 0) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 169 && o[1] === 254) return true;               // link-local
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;  // CGNAT
    if (o[0] >= 224) return true;                                 // multicast et au-delà
    return false;
  }
  if (v === 6) {
    const a = adresse.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return true;
    if (a.startsWith('::ffff:')) return estPrivee(a.slice(7));
    return false;
  }
  return true;
}

// Normalise ce que tape le visiteur : « https://Exemple.FR/contact » -> « exemple.fr »
function normaliser(saisie) {
  if (!saisie) return null;
  let s = String(saisie).trim().replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  s = s.split('/')[0].split('?')[0].split('#')[0].split('@').pop();
  const port = s.includes(':') ? ':' + s.split(':')[1] : '';
  s = s.split(':')[0].toLowerCase();
  if (!s || s.length > 253) return null;
  if (env('BLASON_SCAN_LOCAL') === '1') return s + port;   // tests locaux
  if (net.isIP(s)) return null;                             // pas d'adresse IP en clair
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  const tld = s.split('.').pop();
  if (['local', 'localhost', 'internal', 'intranet', 'home', 'lan', 'test',
       'invalid', 'example'].includes(tld)) return null;
  return s;
}

// Vérifie qu'un nom de domaine ne pointe pas vers le réseau interne.
// BLASON_SCAN_LOCAL=1 lève le garde-fou : réservé aux tests contre un serveur
// de fixtures en local. Jamais défini en production.
async function domainePublic(domaine) {
  if (env('BLASON_SCAN_LOCAL') === '1') return { ok: true };
  let adresses;
  try {
    adresses = await dns.lookup(domaine, { all: true });
  } catch {
    return { ok: false, raison: 'dns' };
  }
  if (!adresses.length) return { ok: false, raison: 'dns' };
  if (adresses.some(a => estPrivee(a.address))) return { ok: false, raison: 'privee' };
  return { ok: true };
}

// ---------- requête HTTP vers un site analysé, redirections revalidées ----------

async function demander(url, ua, delai) {
  let courante = url;
  for (let saut = 0; saut < 4; saut++) {
    let cible;
    try { cible = new URL(courante); } catch { return { ok: false, code: 0, corps: '' }; }
    if (cible.protocol !== 'https:' && cible.protocol !== 'http:') {
      return { ok: false, code: 0, corps: '' };
    }
    // Chaque saut est revalidé : une redirection vers 127.0.0.1 est refusée.
    const verdict = await domainePublic(cible.hostname);
    if (!verdict.ok) return { ok: false, code: 0, corps: '', bloquee: true };

    const stop = new AbortController();
    const minuteur = setTimeout(() => stop.abort(), delai);
    try {
      const r = await fetch(cible.href, {
        method: 'GET',
        redirect: 'manual',
        signal: stop.signal,
        headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*', ...ENTETE_SOURCE },
      });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const suivante = r.headers.get('location');
        if (!suivante) return { ok: false, code: r.status, corps: '', entetes: r.headers };
        courante = new URL(suivante, cible.href).href;
        continue;
      }
      const corps = await lirePlafonne(r);
      return { ok: r.ok, code: r.status, corps, entetes: r.headers, url: cible.href };
    } catch (e) {
      return { ok: false, code: 0, corps: '', expire: e.name === 'AbortError' };
    } finally {
      clearTimeout(minuteur);
    }
  }
  return { ok: false, code: 0, corps: '', boucle: true };
}

// Lit le corps en s'arrêtant au plafond : une page de 200 Mo ne doit pas
// faire tomber la fonction.
async function lirePlafonne(reponse) {
  if (!reponse.body) return '';
  const lecteur = reponse.body.getReader();
  const morceaux = [];
  let total = 0;
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    morceaux.push(value);
    if (total >= POIDS_MAX) { try { await lecteur.cancel(); } catch {} break; }
  }
  return Buffer.concat(morceaux).toString('utf8');
}

// ---------- texte ----------

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’',
                  lsquo: '‘', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', ecirc: 'ê',
                  agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î',
                  euml: 'ë', iuml: 'ï', ugrave: 'ù', hellip: '…', ndash: '–', mdash: '—',
                  Eacute: 'É', Agrave: 'À' };

function decoder(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ' '; } })
    .replace(/&([a-z]+);/gi, (m, n) => ENTITES[n] ?? m);
}

function texteVisible(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, html])[1];
  return decoder(body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Minuscules, sans accents ni ponctuation : pour comparer des noms.
function plat(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Clé de rapprochement d'un nom d'établissement : sans article ni forme juridique.
const MOTS_VIDES = new Set(['le', 'la', 'les', 'l', 'au', 'aux', 'du', 'de', 'des', 'd', 'et',
  'chez', 'sarl', 'sas', 'sasu', 'eurl', 'sa', 'ei', 'ets', 'etablissements', 'the']);
function cleNom(s) {
  return plat(s).split(' ').filter(m => m && !MOTS_VIDES.has(m)).join(' ');
}

// Deux noms désignent-ils le même établissement ? Égalité, ou inclusion
// d'une clé assez longue pour ne pas être un mot banal.
function memeNom(a, b) {
  const x = cleNom(a), y = cleNom(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const court = x.length < y.length ? x : y, long = court === x ? y : x;
  return court.length >= 8 && (' ' + long + ' ').includes(' ' + court + ' ');
}

function hoteDe(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function borner(s, n) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

function reponseJson(donnees, code = 200) {
  return new Response(JSON.stringify(donnees), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// ---------- accords du métier (« une bonne boulangerie ») ----------

const FEMININ = /(rie|ique|ette|ence|ance|euse|trice|ienne|ole|ade|ure|ise|té|tion|sion)$/;

function genreDe(metier) {
  const tete = plat(metier).split(' ')[0] || '';
  if (/^(salle|agence|boutique|onglerie|entreprise|chambre|auto|epicerie|cave|librairie|pharmacie|clinique|maison|ecole|brasserie|creperie|pizzeria)/.test(tete)) return true;
  if (/^(bar|cafe|hotel|garage|salon|restaurant|bouchon|institut|cabinet|atelier|spa|domaine|magasin|glacier|traiteur|caviste)/.test(tete)) return false;
  return FEMININ.test(tete);
}

function pluriel(metier) {
  const mots = String(metier).split(' ');
  const i = mots.findIndex(m => m.length > 2);
  if (i < 0) return metier;
  const m = mots[i];
  if (/[sxz]$/.test(m)) return metier;
  mots[i] = /eau$/.test(m) ? m + 'x' : /al$/.test(m) && m !== 'bal' ? m.slice(0, -2) + 'aux' : m + 's';
  // « bouchon lyonnais » -> « bouchons lyonnais » ; « salon de coiffure » -> « salons de coiffure »
  return mots.join(' ');
}

// ---------- moteurs disponibles ----------

function simulation() { return env('BLASON_IA_SIMULATION') === '1'; }

// Ce que le site peut proposer, selon les clés présentes dans Netlify.
// Sans aucune clé, la page reste en mode « relevé par e-mail », comme avant.
function moteursDispo() {
  if (simulation()) return { chatgpt: true, gemini: true, perplexity: true, fiche: true, simulation: true };
  return {
    chatgpt: !!env('OPENAI_API_KEY'),
    gemini: !!env('GEMINI_API_KEY'),
    perplexity: !!env('PERPLEXITY_API_KEY'),
    fiche: !!env('GOOGLE_PLACES_API_KEY'),
    simulation: false,
  };
}

// ---------- jeton signé ----------
// Le relevé est lancé par le navigateur, question par question. Le jeton
// porte les questions elles-mêmes, signées : personne ne peut se servir
// de nos clés pour poser autre chose que ces dix questions.

function secret() {
  const s = env('BLASON_SECRET');
  if (s) return s;
  // Secours : dérivé des clés, donc stable d'un déploiement à l'autre.
  return crypto.createHash('sha256')
    .update('blason|' + env('OPENAI_API_KEY') + env('GEMINI_API_KEY')
            + env('PERPLEXITY_API_KEY') + env('GOOGLE_PLACES_API_KEY'))
    .digest('hex');
}

function b64u(buf) { return Buffer.from(buf).toString('base64url'); }

function signer(objet) {
  const corps = b64u(JSON.stringify(objet));
  const sig = crypto.createHmac('sha256', secret()).update(corps).digest('base64url');
  return corps + '.' + sig;
}

function verifier(jeton) {
  if (typeof jeton !== 'string' || jeton.length > 8000 || !jeton.includes('.')) return null;
  const [corps, sig] = jeton.split('.');
  const attendu = crypto.createHmac('sha256', secret()).update(corps).digest('base64url');
  const a = Buffer.from(sig || ''), b = Buffer.from(attendu);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let objet;
  try { objet = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8')); } catch { return null; }
  if (!objet || typeof objet.exp !== 'number' || Date.now() > objet.exp) return null;
  return objet;
}

// ---------- appels d'API ----------

async function appel(url, { methode = 'POST', entetes = {}, corps, delai = 15000 } = {}) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), delai);
  const debut = Date.now();
  try {
    const r = await fetch(url, {
      method: methode,
      signal: stop.signal,
      headers: { ...(corps ? { 'Content-Type': 'application/json' } : {}), ...entetes },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const texte = await r.text();
    let json = null;
    try { json = JSON.parse(texte); } catch {}
    return { ok: r.ok, code: r.status, json, texte: texte.slice(0, 600), ms: Date.now() - debut };
  } catch (e) {
    return { ok: false, code: 0, json: null, texte: '', expire: e.name === 'AbortError', ms: Date.now() - debut };
  } finally {
    clearTimeout(minuteur);
  }
}

// Un modèle absent ou renommé : on passe au suivant de la liste.
function modeleInconnu(r) {
  if (r.ok || !r.code) return false;
  const t = (r.texte || '').toLowerCase();
  return r.code === 404 || (r.code === 400 && /model|not found|does not exist|unsupported|not supported/.test(t));
}

function listeModeles(varEnv, defauts) {
  return [...new Set([env(varEnv), ...defauts].filter(Boolean))];
}

const estRaisonnement = m => /^(gpt-5|gpt-6|o\d)/.test(m);

// Texte d'une réponse OpenAI (API Responses). output_text n'existe que dans
// les SDK : on reconstitue à partir de output[].
function sortieOpenAI(j) {
  let texte = '';
  const sources = [];
  for (const item of j?.output || []) {
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (c.type !== 'output_text') continue;
        texte += c.text || '';
        for (const a of c.annotations || []) {
          if (a.type === 'url_citation' && a.url) sources.push({ titre: a.title || '', url: a.url });
        }
      }
    } else if (item.type === 'web_search_call') {
      for (const s of item.action?.sources || []) {
        if (s.url) sources.push({ titre: s.title || '', url: s.url, consultee: true });
      }
    }
  }
  if (!texte && typeof j?.output_text === 'string') texte = j.output_text;
  return { texte, sources };
}

// Schéma JSON (format OpenAI strict) -> schéma de réponse Gemini.
function versGemini(s) {
  if (!s || typeof s !== 'object') return s;
  const o = { type: String(s.type || 'string').toUpperCase() };
  if (s.enum) o.enum = s.enum;
  if (s.description) o.description = s.description;
  if (s.properties) {
    o.properties = {};
    for (const [k, v] of Object.entries(s.properties)) o.properties[k] = versGemini(v);
    if (s.required) o.required = s.required;
  }
  if (s.items) o.items = versGemini(s.items);
  return o;
}

// Petite tâche de mise en forme (profil, extraction des noms) confiée au
// modèle le moins cher disponible. Renvoie un objet, ou null.
async function llmJson({ nom, instructions, entree, schema, delai = 8000 }) {
  if (env('OPENAI_API_KEY')) {
    for (const modele of listeModeles('OPENAI_MODELE_EXTRACTION', ['gpt-5-nano', 'gpt-4.1-mini'])) {
      const corps = {
        model: modele,
        store: false,
        input: [{ role: 'system', content: instructions }, { role: 'user', content: entree }],
        text: { format: { type: 'json_schema', name: nom, strict: true, schema } },
        max_output_tokens: 3000,
      };
      if (estRaisonnement(modele)) corps.reasoning = { effort: 'minimal' };
      let r = await appel('https://api.openai.com/v1/responses', {
        entetes: { Authorization: 'Bearer ' + env('OPENAI_API_KEY') }, corps, delai });
      if (!r.ok && r.code === 400 && corps.reasoning && /reasoning|effort/i.test(r.texte)) {
        corps.reasoning = { effort: 'low' };
        r = await appel('https://api.openai.com/v1/responses', {
          entetes: { Authorization: 'Bearer ' + env('OPENAI_API_KEY') }, corps, delai });
      }
      if (r.ok) {
        try { return JSON.parse(sortieOpenAI(r.json).texte); } catch { break; }
      }
      if (!modeleInconnu(r)) break;
    }
  }
  if (env('GEMINI_API_KEY')) {
    for (const modele of listeModeles('GEMINI_MODELE_EXTRACTION', ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'])) {
      const r = await appel(
        `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
          entetes: { 'x-goog-api-key': env('GEMINI_API_KEY') },
          corps: {
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: 'user', parts: [{ text: entree }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: versGemini(schema) },
          },
          delai,
        });
      if (r.ok) {
        const t = (r.json?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        try { return JSON.parse(t); } catch { return null; }
      }
      if (!modeleInconnu(r)) break;
    }
  }
  return null;
}

// Journal minimal : jamais d'e-mail, jamais de clé, jamais de contenu de réponse.
function journal(evenement, details = {}) {
  try { console.log(JSON.stringify({ blason: evenement, ...details })); } catch {}
}


// ============================================================
//  Blason — la fiche Google de l'établissement
//  POST /api/fiche  { jeton }
//
//  Retrouve la fiche Google (API Places « New ») à partir du lien Google
//  Maps fourni, ou à défaut du nom et du secteur. Renvoie ce que la fiche
//  affiche : catégorie, note, avis, horaires, téléphone, site.
//
//  Règles Google : les données s'affichent avec la mention « Données
//  Google Maps », les avis avec le nom de leur auteur, et rien n'est
//  conservé chez nous (seul l'identifiant de la fiche peut l'être).
// ============================================================

const depasse = cadenceur(10 * 60 * 1000, 8);
const T_PLACES = 9000;
const faites = new Map();   // une fiche par jeton, par instance

const CHAMPS = ['id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'internationalPhoneNumber',
  'websiteUri', 'googleMapsUri', 'rating', 'userRatingCount', 'regularOpeningHours', 'businessStatus',
  'primaryTypeDisplayName', 'editorialSummary', 'reviews', 'photos'];

const COURTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.page', 'share.google']);
const estGoogle = h => /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(h);

// Un lien Google Maps -> un identifiant de fiche, ou un nom et des coordonnées.
async function lireLien(lien) {
  let u;
  try { u = new URL(lien); } catch { return null; }
  for (let saut = 0; saut < 3 && COURTS.has(u.hostname); saut++) {
    const r = await appelBrut(u.href);
    if (!r) return null;
    try { u = new URL(r, u.href); } catch { return null; }
  }
  if (/^consent\.google\./.test(u.hostname) && u.searchParams.get('continue')) {
    try { u = new URL(u.searchParams.get('continue')); } catch { return null; }
  }
  if (!estGoogle(u.hostname) && !COURTS.has(u.hostname)) return null;

  const out = {};
  const pid = u.searchParams.get('query_place_id') || u.searchParams.get('place_id');
  if (pid && /^[A-Za-z0-9_-]{10,300}$/.test(pid)) out.placeId = pid;
  const q = u.searchParams.get('q') || u.searchParams.get('query') || '';
  if (/^place_id:[A-Za-z0-9_-]{10,300}$/.test(q)) out.placeId = q.slice(9);
  else if (q) out.nom = q;
  const place = u.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
  if (place) { try { out.nom = decodeURIComponent(place[1].replace(/\+/g, ' ')); } catch {} }
  const d = u.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (d) out.coords = { latitude: +d[1], longitude: +d[2] };
  return out.placeId || out.nom ? out : null;
}

// Suit un lien court sans le charger : on ne lit que l'en-tête Location.
async function appelBrut(url) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), 4000);
  try {
    const r = await fetch(url, { redirect: 'manual', signal: stop.signal, headers: { 'User-Agent': UA_NAV } });
    return r.headers.get('location');
  } catch { return null; } finally { clearTimeout(minuteur); }
}

async function places(chemin, corps, champs) {
  return appel('https://places.googleapis.com/v1/' + chemin, {
    methode: corps ? 'POST' : 'GET',
    entetes: { 'X-Goog-Api-Key': env('GOOGLE_PLACES_API_KEY'), 'X-Goog-FieldMask': champs.join(',') },
    corps,
    delai: T_PLACES,
  });
}

function mettreEnForme(p, confiance) {
  return {
    id: p.id || '',
    nom: borner(p.displayName?.text || '', 100),
    categorie: borner(p.primaryTypeDisplayName?.text || '', 60),
    adresse: borner(p.formattedAddress || '', 160),
    telephone: borner(p.nationalPhoneNumber || p.internationalPhoneNumber || '', 30),
    site: /^https?:\/\//.test(p.websiteUri || '') ? p.websiteUri.slice(0, 300) : '',
    maps_url: /^https:\/\//.test(p.googleMapsUri || '') ? p.googleMapsUri.slice(0, 300) : '',
    note: typeof p.rating === 'number' ? p.rating : null,
    nb_avis: typeof p.userRatingCount === 'number' ? p.userRatingCount : 0,
    horaires: (p.regularOpeningHours?.weekdayDescriptions || []).slice(0, 7).map(h => borner(h, 80)),
    statut: p.businessStatus || '',
    description: borner(p.editorialSummary?.text || '', 300),
    photos: Array.isArray(p.photos) ? p.photos.length : 0,
    avis: (p.reviews || []).slice(0, 5).map(a => ({
      auteur: borner(a.authorAttribution?.displayName || 'Utilisateur Google', 60),
      auteur_url: /^https:\/\//.test(a.authorAttribution?.uri || '') ? a.authorAttribution.uri.slice(0, 300) : '',
      note: typeof a.rating === 'number' ? a.rating : null,
      texte: borner(a.text?.text || a.originalText?.text || '', 320),
      quand: borner(a.relativePublishTimeDescription || '', 40),
    })),
    confiance,
  };
}

function simulee(charge) {
  return {
    trouvee: true, simulation: true,
    fiche: {
      id: 'simulation', nom: charge.n, categorie: 'Plombier', adresse: '12 Rue Neuve, 69004 Lyon, France',
      telephone: '04 78 00 00 01', site: 'https://' + charge.d + '/', maps_url: 'https://www.google.com/maps',
      note: 4.6, nb_avis: 37, horaires: ['lundi: 08:00 – 18:00', 'mardi: 08:00 – 18:00', 'mercredi: 08:00 – 18:00',
        'jeudi: 08:00 – 18:00', 'vendredi: 08:00 – 18:00', 'samedi: Fermé', 'dimanche: Fermé'],
      statut: 'OPERATIONAL', description: '', photos: 4,
      avis: [{ auteur: 'Client fictif', auteur_url: '', note: 5, texte: 'Avis de démonstration (mode simulation).', quand: 'il y a 2 mois' }],
      confiance: 'site',
    },
  };
}

export default async (req, context) => {
  if (req.method !== 'POST') return reponseJson({ erreur: 'methode' }, 405);
  if (depasse(ipDe(req, context))) return reponseJson({ erreur: 'cadence' }, 429);

  let d;
  try { d = await req.json(); } catch { return reponseJson({ erreur: 'requete' }, 400); }
  const charge = verifier(d?.jeton);
  if (!charge) return reponseJson({ erreur: 'jeton' }, 401);
  if ((faites.get(charge.id) || 0) >= 2) return reponseJson({ erreur: 'rejeu' }, 409);
  faites.set(charge.id, (faites.get(charge.id) || 0) + 1);
  if (faites.size > 5000) faites.clear();

  if (simulation()) return reponseJson(simulee(charge));
  if (!env('GOOGLE_PLACES_API_KEY')) return reponseJson({ trouvee: false, erreur: 'indisponible' });

  const lien = charge.mp ? await lireLien(charge.mp) : null;
  const domaine = charge.d.replace(/:\d+$/, '');
  let candidats = [];

  if (lien?.placeId) {
    const r = await places('places/' + encodeURIComponent(lien.placeId) + '?languageCode=fr&regionCode=FR', null, CHAMPS);
    if (r.ok && r.json?.id) candidats = [r.json];
  }
  if (!candidats.length) {
    const corps = {
      textQuery: lien?.nom || `${charge.n} ${charge.l}`,
      languageCode: 'fr', regionCode: 'FR', pageSize: 5,
    };
    if (lien?.coords) corps.locationBias = { circle: { center: lien.coords, radius: 800 } };
    const r = await places('places:searchText', corps, CHAMPS.map(c => 'places.' + c));
    if (!r.ok) {
      journal('fiche_erreur', { code: r.code });
      return reponseJson({ trouvee: false, erreur: r.expire ? 'delai' : 'api' });
    }
    candidats = r.json?.places || [];
  }

  // La bonne fiche : celle qui renvoie vers votre site, sinon celle qui porte
  // votre nom, sinon celle du lien fourni. Jamais « la première venue ».
  let choix = candidats.find(p => hoteDe(p.websiteUri || '') === domaine);
  let confiance = 'site';
  if (!choix) { choix = candidats.find(p => memeNom(p.displayName?.text || '', charge.n)); confiance = 'nom'; }
  if (!choix && lien) { choix = candidats[0]; confiance = 'lien'; }

  journal('fiche', { trouvee: !!choix, confiance: choix ? confiance : '', via_lien: !!lien });

  if (!choix) {
    return reponseJson({
      trouvee: false,
      recherche: borner(`${charge.n} ${charge.l}`, 120),
      proches: candidats.slice(0, 3).map(p => borner(p.displayName?.text || '', 80)).filter(Boolean),
    });
  }
  return reponseJson({ trouvee: true, fiche: mettreEnForme(choix, confiance) });
};

export const config = { path: '/api/fiche' };
