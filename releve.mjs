// Fichier généré par build.py : tronc commun + releve. Ne pas modifier ici.

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
//  Blason — ouverture d'un relevé IA en direct
//  POST /api/releve  { domaine, email, metier, metier_pluriel, feminin,
//                      lieu, ville, nom, maps, concurrents }
//
//  Vérifie la demande, fabrique les dix questions (gabarits fixes, jamais
//  rédigées par une IA) et renvoie un jeton signé qui les contient.
//  Le navigateur pose ensuite chaque question via /api/ia avec ce jeton.
// ============================================================

const depasse = cadenceur(60 * 60 * 1000, 4);        // 4 relevés par heure et par adresse IP
const DUREE_JETON = 30 * 60 * 1000;

const RE_EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const HOTES_MAPS = /^(maps\.app\.goo\.gl|goo\.gl|g\.page|share\.google|maps\.google\.[a-z.]{2,6}|(www\.)?google\.[a-z.]{2,6})$/i;

// Ces textes finissent dans une question posée aux IA : on ne garde que
// lettres, chiffres et ponctuation ordinaire, et on borne la longueur.
function propre(v, max) {
  const s = String(v ?? '').replace(/[^\p{L}\p{N} '’\-&.,()/+°]/gu, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? '' : s;
}

// Les métiers qu'on appelle en urgence : la neuvième question change de tournure.
const URGENCE = /plomb|electric|électric|serrur|chauffag|couvr|vitri|depann|dépann|garag|dentist|veterin|vétérin|medecin|médecin|pharmac|ramon|climatis|debouch|débouch/i;

function majuscule(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Les dix questions. Des phrases de client, pas des mots-clés.
// Accords : « un bon plombier » / « une bonne boulangerie ».
function questions({ metier, metier_pluriel, feminin, lieu, ville }) {
  const f = !!feminin;
  const M = metier, P = metier_pluriel || metier + 's';
  const un = f ? 'une' : 'un', bon = f ? 'bonne' : 'bon', quel = f ? 'Quelle' : 'Quel';
  const quels = f ? 'Quelles' : 'Quels', notes = f ? 'notées' : 'notés';
  const meilleur = f ? 'La meilleure' : 'Le meilleur', serieux = f ? 'sérieuse' : 'sérieux', cher = f ? 'chère' : 'cher';
  const ouvert = f ? 'ouverte' : 'ouvert', lesquels = f ? 'lesquelles' : 'lesquels';
  const dUn = f ? "d'une" : "d'un";
  return [
    `${quel} ${M} me conseilles-tu à ${lieu} ?`,
    `Je cherche ${un} ${bon} ${M} à ${lieu}. Tu as des noms ?`,
    `${quels} sont les ${P} les mieux ${notes} à ${lieu} ?`,
    `${meilleur} ${M} de ${ville || lieu}, selon toi ?`,
    `${majuscule(un)} ${M} ${serieux} et pas trop ${cher} à ${lieu} ?`,
    `Recommande-moi ${un} ${M} de confiance près de ${lieu}.`,
    `${majuscule(P)} à ${lieu} avec de bons avis : ${lesquels} choisir ?`,
    `${quel} ${M} ${ouvert} le samedi à ${lieu} ?`,
    URGENCE.test(M)
      ? `J'ai besoin ${dUn} ${M} à ${lieu} rapidement, qui contacter ?`
      : `Où trouver ${un} ${bon} ${M} à ${lieu} ? Donne-moi des adresses.`,
    `Donne-moi trois ${P} à ${lieu} que tu recommandes.`,
  ];
}

export default async (req, context) => {
  if (req.method !== 'POST') return reponseJson({ erreur: 'methode', message: 'Méthode non autorisée.' }, 405);

  const moteurs = moteursDispo();
  const liste = ['chatgpt', 'gemini', 'perplexity'].filter(m => moteurs[m]);
  if (!liste.length) {
    return reponseJson({ erreur: 'indisponible', message: 'Le relevé en direct n\'est pas disponible pour le moment.' }, 503);
  }

  if (depasse(ipDe(req, context))) {
    return reponseJson({
      erreur: 'cadence',
      message: 'Vous avez déjà lancé plusieurs relevés dans l\'heure. Réessayez un peu plus tard, ou écrivez-nous.',
    }, 429);
  }

  let d;
  try { d = await req.json(); } catch { return reponseJson({ erreur: 'requete', message: 'Requête illisible.' }, 400); }

  const domaine = normaliser(d?.domaine);
  const email = String(d?.email || '').trim();
  const metier = propre(d?.metier, 60).toLowerCase();
  const metier_pluriel = propre(d?.metier_pluriel, 70).toLowerCase() || (metier ? pluriel(metier) : '');
  const feminin = typeof d?.feminin === 'boolean' ? d.feminin : genreDe(metier);
  const lieu = propre(d?.lieu, 60);
  const ville = propre(d?.ville, 60) || lieu.replace(/\s+\d{1,2}(er|e|ème)$/i, '');
  const nom = propre(d?.nom, 80);

  const manque = [];
  if (!domaine) manque.push('l\'adresse du site');
  if (!RE_EMAIL.test(email)) manque.push('un e-mail valide');
  if (!metier) manque.push('votre métier');
  if (!lieu) manque.push('votre secteur');
  if (!nom) manque.push('le nom de votre établissement');
  if (manque.length) {
    return reponseJson({ erreur: 'champs', message: 'Il manque ' + manque.join(', ') + '.' }, 400);
  }

  // Lien Google Maps facultatif : seulement s'il pointe bien chez Google.
  let maps = '';
  if (d?.maps) {
    try {
      const u = new URL(String(d.maps).trim());
      if (u.protocol === 'https:' && HOTES_MAPS.test(u.hostname) && u.href.length <= 600) maps = u.href;
    } catch {}
    if (!maps) {
      return reponseJson({ erreur: 'maps', message: 'Le lien Google Maps ne semble pas valide. Laissez le champ vide si vous ne l\'avez pas.' }, 400);
    }
  }

  const q = questions({ metier, metier_pluriel, feminin, lieu, ville });
  const charge = {
    v: 1,
    id: crypto.randomBytes(9).toString('base64url'),
    d: domaine, n: nom, m: metier, l: lieu, vi: ville, mp: maps,
    q, mo: liste, exp: Date.now() + DUREE_JETON,
  };

  journal('releve', { domaine, moteurs: liste.length, maps: !!maps });

  return reponseJson({
    jeton: signer(charge),
    questions: q,
    moteurs: liste,
    fiche: !!moteurs.fiche,
    simulation: !!moteurs.simulation,
  });
};

export const config = { path: '/api/releve' };
