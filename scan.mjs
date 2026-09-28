// ============================================================
//  Blason — analyse flash en libre-service
//  Fonction Netlify (format 2.0) : POST /api/scan  { site: "exemple.fr" }
//
//  Portage de diagnostic.mjs (noeud Code n8n) vers le web public.
//  Differences avec la version n8n, toutes deliberees :
//    - fetch standard au lieu de ctx.helpers.httpRequest
//    - budget de temps serre (Netlify coupe a 10 s)
//    - garde-fous : adresses privees refusees, redirections revalidees,
//      corps de page plafonne, cadence limitee par IP
//    - en-tete d'identification, pour qu'un hebergeur qui lit ses logs
//      sache d'ou vient la requete
// ============================================================

import dns from 'node:dns/promises';
import net from 'node:net';

// ---------- constantes partagees avec le scanner n8n ----------

const UA_NAV = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
             + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; '
             + 'GPTBot/1.1; +https://openai.com/gptbot';

// Identifie la provenance dans les logs du site analyse. Courtoisie, pas obligation.
const ENTETE_SOURCE = { 'X-Blason-Scan': 'https://blason-ia.fr/analyse-flash' };

const ROBOTS_IA = ['gptbot', 'oai-searchbot', 'chatgpt-user', 'claudebot', 'claude-web',
                   'anthropic-ai', 'perplexitybot', 'perplexity-user', 'google-extended',
                   'applebot-extended', 'bytespider', 'ccbot', 'amazonbot', 'meta-externalagent'];

const NOMS_ROBOTS = {
  'gptbot': 'GPTBot (ChatGPT)', 'oai-searchbot': 'OAI-SearchBot (ChatGPT)',
  'chatgpt-user': 'ChatGPT-User (lecture directe)', 'claudebot': 'ClaudeBot',
  'claude-web': 'Claude-Web', 'anthropic-ai': 'anthropic-ai',
  'perplexitybot': 'PerplexityBot', 'perplexity-user': 'Perplexity-User',
  'google-extended': 'Google-Extended', 'applebot-extended': 'Applebot-Extended',
  'bytespider': 'Bytespider', 'ccbot': 'CCBot', 'amazonbot': 'Amazonbot',
  'meta-externalagent': 'Meta-ExternalAgent',
};

const MOTS_CLES = ['horaire', 'adresse', 'téléphone', 'telephone', 'devis', 'tarif',
                   'urgence', 'dépannage', 'depannage', 'intervention'];

// Budget de temps. Netlify coupe la fonction a 10 s sur l'offre gratuite :
// une page (5 s) puis robots.txt et le test GPTBot en parallele (4 s) = 9 s au pire.
const T_PAGE = 5000;
const T_SECONDAIRE = 4000;
const POIDS_MAX = 5 * 1024 * 1024;   // on arrete de lire au-dela
const SEUIL_LOURD = 4 * 1024 * 1024; // seuil au-dela duquel ChatGPT abandonne

// ---------- garde-fous ----------

// En memoire, donc par instance de fonction : imparfait par nature.
// Suffit a arreter le martelage evident ; ce n'est pas une protection forte.
const cadence = new Map();
const FENETRE = 10 * 60 * 1000;
const MAX_PAR_IP = 6;

function cadenceDepassee(ip) {
  const maintenant = Date.now();
  const passages = (cadence.get(ip) || []).filter(t => maintenant - t < FENETRE);
  if (passages.length >= MAX_PAR_IP) { cadence.set(ip, passages); return true; }
  passages.push(maintenant);
  cadence.set(ip, passages);
  if (cadence.size > 5000) cadence.clear();   // garde-fou memoire
  return false;
}

function estPrivee(adresse) {
  const v = net.isIP(adresse);
  if (v === 4) {
    const o = adresse.split('.').map(Number);
    if (o[0] === 10 || o[0] === 127 || o[0] === 0) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 169 && o[1] === 254) return true;   // link-local
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;  // CGNAT
    if (o[0] >= 224) return true;                    // multicast et au-dela
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
  if (process.env.BLASON_SCAN_LOCAL === '1') return s + port;   // tests locaux
  if (net.isIP(s)) return null;                       // pas d'adresse IP en clair
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  const tld = s.split('.').pop();
  if (['local', 'localhost', 'internal', 'intranet', 'home', 'lan', 'test',
       'invalid', 'example'].includes(tld)) return null;
  return s;
}

// Verifie qu'un nom de domaine ne pointe pas vers le reseau interne.
// BLASON_SCAN_LOCAL=1 leve le garde-fou : reserve aux tests contre un serveur
// de fixtures en local. Jamais defini en production.
async function domainePublic(domaine) {
  if (process.env.BLASON_SCAN_LOCAL === '1') return { ok: true };
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

// ---------- requete HTTP, redirections revalidees une par une ----------

async function demander(url, ua, delai) {
  let courante = url;
  for (let saut = 0; saut < 4; saut++) {
    let cible;
    try { cible = new URL(courante); } catch { return { ok: false, code: 0, corps: '' }; }
    if (cible.protocol !== 'https:' && cible.protocol !== 'http:') {
      return { ok: false, code: 0, corps: '' };
    }
    // Chaque saut est revalide : une redirection vers 127.0.0.1 est refusee.
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

// Lit le corps en s'arretant au plafond : une page de 200 Mo ne doit pas
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

// ---------- analyse du HTML (identique au scanner n8n) ----------

function texteVisible(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, html])[1];
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scripts(html) {
  const out = [];
  const re = /<script[\s\S]*?<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out.join(' ').toLowerCase();
}

function robotsInterdits(txt) {
  if (!txt) return [];
  const bloques = new Set();
  let courants = [];
  let groupeOuvert = false;
  for (const brute of txt.split(/\r?\n/)) {
    const ligne = brute.split('#')[0].trim();
    if (!ligne) { groupeOuvert = false; continue; }
    const sep = ligne.indexOf(':');
    if (sep === -1) continue;
    const champ = ligne.slice(0, sep).trim().toLowerCase();
    const valeur = ligne.slice(sep + 1).trim();
    if (champ === 'user-agent') {
      if (!groupeOuvert) courants = [];
      courants.push(valeur.toLowerCase());
      groupeOuvert = true;
    } else if (champ === 'disallow') {
      groupeOuvert = false;
      if (valeur === '/') {
        for (const ua of courants) {
          if (ua === '*') for (const r of ROBOTS_IA) bloques.add(r);
          else if (ROBOTS_IA.includes(ua)) bloques.add(ua);
        }
      }
    } else {
      groupeOuvert = false;
    }
  }
  return [...bloques];
}

function typesJsonLd(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const types = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const d = JSON.parse(m[1].trim());
      for (const o of (Array.isArray(d) ? d : [d])) {
        if (o && o['@type']) types.push(String(o['@type']));
        if (o && Array.isArray(o['@graph'])) {
          for (const g of o['@graph']) if (g && g['@type']) types.push(String(g['@type']));
        }
      }
    } catch { /* JSON-LD casse = absent, c'est le bon traitement */ }
  }
  return [...new Set(types)];
}

// ---------- libelles affiches au visiteur ----------
// Un constat, une consequence. Jamais un verdict que la mesure ne porte pas.

const LIBELLES = {
  injoignable: d => ({
    titre: 'Le site n\'a pas répondu',
    texte: `Nous n'avons pas réussi à ouvrir ${d.domaine}. Si c'est temporaire, tant mieux — `
         + `mais pour ChatGPT ou Google AI, un site qui ne répond pas n'existe pas.`,
  }),
  http_seul: () => ({
    titre: 'Site accessible en HTTP seulement',
    texte: 'Pas de cadenas : les navigateurs affichent « site non sécurisé » à vos visiteurs, '
         + 'et les moteurs de réponse IA écartent généralement ces sites de leurs sources.',
  }),
  robots_txt: d => ({
    titre: 'Votre fichier robots.txt bloque des robots d\'IA',
    texte: `Il interdit l'accès à ${d.detail}. Quand quelqu'un demande à ces moteurs un `
         + `professionnel près de chez lui, votre site n'a pas le droit d'être lu. `
         + `C'est une ligne de texte à changer.`,
  }),
  blocage_reseau: d => ({
    titre: 'Votre hébergeur bloque le robot de ChatGPT',
    texte: `En nous présentant comme GPTBot, votre serveur a répondu une erreur ${d.detail}. `
         + `Le blocage ne vient pas de vous mais de votre hébergement ou de votre pare-feu, `
         + `et il ne se voit nulle part.`,
  }),
  js_seulement: d => ({
    titre: 'Vos informations sont enfermées dans le JavaScript',
    texte: `Nous n'avons trouvé ${d.detail} que dans le code des scripts, pas dans le texte `
         + `de la page. Un visiteur les voit ; les robots des IA, qui n'exécutent pas le `
         + `JavaScript, lisent une page presque vide.`,
  }),
  page_lourde: d => ({
    titre: 'Page d\'accueil trop lourde',
    texte: `Elle pèse ${d.detail}. Au-delà de 4 Mo, ChatGPT abandonne la lecture. `
         + `Le site est en ligne, mais illisible pour lui.`,
  }),
  pas_de_schema: () => ({
    titre: 'Aucune donnée structurée',
    texte: 'Le balisage schema.org est le format standard qui dit à une machine votre métier, '
         + 'votre adresse et vos horaires sans qu\'elle ait à deviner. Sans lui, elle devine.',
  }),
  titre_vide: d => ({
    titre: 'Le titre de la page ne dit pas ce que vous faites',
    texte: `Votre titre est « ${d.detail} ». Dans la grande majorité des réponses, c'est la `
         + `première chose — souvent la seule — que ChatGPT lit d'un site.`,
  }),
};

// Une page de 400 octets ne doit pas s'afficher « 0 Ko ».
function formaterPoids(octets) {
  if (octets >= 1048576) return (octets / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  if (octets >= 1024) return Math.round(octets / 1024) + ' Ko';
  return octets + ' octets';
}

function reponseJson(donnees, code = 200) {
  return new Response(JSON.stringify(donnees), {
    status: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ---------- point d'entree ----------

export default async (req, context) => {
  if (req.method !== 'POST') {
    return reponseJson({ erreur: 'methode', message: 'Méthode non autorisée.' }, 405);
  }

  const ip = context?.ip
          || req.headers.get('x-nf-client-connection-ip')
          || req.headers.get('x-forwarded-for')?.split(',')[0].trim()
          || 'inconnue';

  if (cadenceDepassee(ip)) {
    return reponseJson({
      erreur: 'cadence',
      message: 'Vous avez lancé plusieurs analyses coup sur coup. Réessayez dans quelques minutes.',
    }, 429);
  }

  let saisie = '';
  try {
    const corps = await req.json();
    saisie = corps?.site || '';
  } catch {
    return reponseJson({ erreur: 'requete', message: 'Requête illisible.' }, 400);
  }

  const domaine = normaliser(saisie);
  if (!domaine) {
    return reponseJson({
      erreur: 'domaine',
      message: 'Cette adresse ne ressemble pas à un site web. Exemple : plomberie-martin.fr',
    }, 400);
  }

  const verdict = await domainePublic(domaine);
  if (!verdict.ok) {
    return reponseJson({
      erreur: verdict.raison,
      message: verdict.raison === 'dns'
        ? `Le nom de domaine ${domaine} n'existe pas, ou son DNS ne répond pas.`
        : 'Cette adresse pointe vers un réseau privé. L\'analyse ne porte que sur des sites publics.',
    }, 400);
  }

  const defauts = [];
  let protocole = 'https';

  // 1 · joignabilite et HTTPS
  let page = await demander(`https://${domaine}/`, UA_NAV, T_PAGE);
  if (!page.ok && page.code === 0) {
    const secours = await demander(`http://${domaine}/`, UA_NAV, T_PAGE);
    if (secours.ok) {
      protocole = 'http';
      page = secours;
      defauts.push({ code: 'http_seul', gravite: 3, detail: '' });
    } else {
      return reponseJson({
        domaine, statut: 'injoignable', gravite: 3, score_indicatif: 0,
        defauts: [{ code: 'injoignable', gravite: 3, ...LIBELLES.injoignable({ domaine }) }],
        controles_ok: [],
        scanne_le: new Date().toISOString(),
      });
    }
  }

  const base = `${protocole}://${domaine}`;
  const html = page.corps || '';
  const poids = Buffer.byteLength(html, 'utf8');

  // 2 et 3 · robots.txt et test GPTBot, en parallele pour tenir le budget de temps
  const [rob, gpt] = await Promise.all([
    demander(`${base}/robots.txt`, UA_NAV, T_SECONDAIRE),
    demander(`${base}/`, UA_GPT, T_SECONDAIRE),
  ]);

  const controles_ok = [];
  if (protocole === 'https') controles_ok.push('Votre site est servi en HTTPS (cadenas)');

  if (rob.ok && rob.code === 200) {
    const bloques = robotsInterdits(rob.corps);
    if (bloques.length) {
      const jolis = bloques.slice(0, 4).map(b => NOMS_ROBOTS[b] || b);
      defauts.push({ code: 'robots_txt', gravite: 3, detail: jolis.join(', ') });
    } else {
      controles_ok.push('Votre robots.txt n\'interdit aucun robot d\'IA');
    }
  }

  if ([401, 403, 405, 406, 429].includes(gpt.code)) {
    defauts.push({ code: 'blocage_reseau', gravite: 3, detail: String(gpt.code) });
  } else if (gpt.ok) {
    controles_ok.push('Votre hébergeur laisse passer le robot de ChatGPT');
  }

  // 4 · contenu injecte par JavaScript
  const visible = texteVisible(html).toLowerCase();
  const dansScripts = scripts(html);
  const cachesJs = MOTS_CLES.filter(m => !visible.includes(m) && dansScripts.includes(m));
  if (cachesJs.length >= 2) {
    defauts.push({ code: 'js_seulement', gravite: 3, detail: cachesJs.slice(0, 3).join(', ') });
  } else {
    controles_ok.push('Vos informations sont lisibles sans JavaScript');
  }

  // 5 · poids
  if (poids > SEUIL_LOURD) {
    defauts.push({ code: 'page_lourde', gravite: 2,
      detail: (poids / 1048576).toFixed(1).replace('.', ',') + ' Mo' });
  } else {
    controles_ok.push(`Page d'accueil de ${formaterPoids(poids)}, sous le seuil de 4 Mo`);
  }

  // 6 · donnees structurees
  const types = typesJsonLd(html);
  if (!types.length) defauts.push({ code: 'pas_de_schema', gravite: 2, detail: '' });
  else controles_ok.push(`Balisage schema.org présent (${types.slice(0, 3).join(', ')})`);

  // 7 · titre
  const titre = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [null, ''])[1]
                  .replace(/\s+/g, ' ').trim();
  if (!titre || titre.length < 15 || /^(accueil|home|bienvenue|site|index)$/i.test(titre)) {
    defauts.push({ code: 'titre_vide', gravite: 2, detail: titre || '(vide)' });
  } else {
    controles_ok.push('Le titre de votre page d\'accueil est renseigné');
  }

  defauts.sort((a, b) => b.gravite - a.gravite);

  // Score indicatif sur 30, la partie technique de la grille Blason.
  // Volontairement nomme « indicatif » : il ne mesure que le site, jamais les citations.
  const POINTS = { 3: 10, 2: 5, 1: 2 };
  const perdus = defauts.reduce((s, d) => s + (POINTS[d.gravite] || 2), 0);
  const score = Math.max(0, 30 - perdus);

  return reponseJson({
    domaine,
    url: base,
    statut: defauts.length ? (defauts[0].gravite >= 3 ? 'critique' : 'mineur') : 'conforme',
    gravite: defauts.length ? defauts[0].gravite : 0,
    score_indicatif: score,
    score_sur: 30,
    titre,
    extrait_200: texteVisible(html).slice(0, 200),
    poids: formaterPoids(poids),
    poids_octets: poids,
    schema_types: types,
    defauts: defauts.map(d => ({ code: d.code, gravite: d.gravite, ...LIBELLES[d.code](d) })),
    controles_ok,
    scanne_le: new Date().toISOString(),
  });
};

export const config = { path: '/api/scan' };
