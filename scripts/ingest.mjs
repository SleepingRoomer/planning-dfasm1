import { writeFile, mkdir, readFile } from "node:fs/promises";

const SHEET_PLANNING = "1J1_RPiK6E5rpTGMNqsGtC5eWFvJkAhXdxyUHYTqeOZE";
const SHEET_ATELIER_GOUV = "1AIQePbwBukAJo85098uk76SJr-UZ8M4gvEryyLO6Sfs";
const SHEET_ATELIER_URGREA = "1oVdKc3CuJIoMw35U9vojlH8XhjnVKkC9dD4EnVt5tkk";

const csvUrl = (id, gid) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
// L'onglet « cycle 1 » n'a pas de gid stable connu : on le lit par son nom via
// l'endpoint gviz, qui accepte un paramètre `sheet=` au lieu d'un `gid=`.
const csvUrlParNom = (id, nom) =>
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nom)}`;

/* --- Listes blanches strictes. Tout ce qui n'est pas listé ne sort jamais. ---
   Le déroulé et l'onglet cycle 1 contiennent aussi les colonnes Enseignants,
   Adresse mail, Responsable et divers Rappels internes (destinataires de
   mail, mémos de la scolarité) : elles ne sont jamais lues ci-dessous. */
const CHAMPS_PUBLIES = [
  "date", "debut", "fin", "matiere", "libelle", "type", "site", "salle", "promo", "pole",
];

/* ------------------------------ CSV ------------------------------ */
/* Parseur RFC 4180 minimal : gère les guillemets et les retours ligne
   à l'intérieur des cellules, ce que `split(",")` ne fait pas. */
export function parseCSV(texte) {
  const lignes = [];
  let ligne = [], champ = "", dansGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') dansGuillemets = false;
      else champ += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else if (c !== "\r") champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter((l) => l.some((c) => c.trim()));
}

/* --------------------------- normalisation --------------------------- */

const MOIS = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  décembre: 12, decembre: 12,
};

/* "lundi 2 novembre 2026" -> "2026-11-02" */
export function normDate(brut) {
  if (!brut) return null;
  const s = brut.toLowerCase().trim();
  const m = s.match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/);
  if (m && MOIS[m[2]]) {
    return `${m[3]}-${String(MOIS[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const iso = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  return null;
}

/* "14h", "16h15" -> "14:00", "16:15" */
export function normHeure(brut) {
  if (!brut) return { valeur: null, ambigu: false };
  const s = brut.trim().toLowerCase();
  if (/\d+h\d*\s*[-–]\s*\d+h/.test(s)) return { valeur: null, ambigu: true };
  const m = s.match(/^(\d{1,2})\s*h\s*(\d{2})?$/);
  if (!m) return { valeur: null, ambigu: true };
  return { valeur: `${m[1].padStart(2, "0")}:${m[2] || "00"}`, ambigu: false };
}

/* "17h15 - 19h45" -> { debut: "17:15", fin: "19:45" } */
export function normPlage(brut) {
  if (!brut) return {};
  const m = brut.match(/(\d{1,2})\s*h\s*(\d{2})?\s*[-–à]\s*(\d{1,2})\s*h\s*(\d{2})?/);
  if (!m) return {};
  return {
    debut: `${m[1].padStart(2, "0")}:${m[2] || "00"}`,
    fin: `${m[3].padStart(2, "0")}:${m[4] || "00"}`,
  };
}

/* --------------------- lecture de l'onglet « déroulé » --------------------- *
 * En-têtes réels (relevés le 16/09/2026) :
 * Année, pole, Matière, Libelé du cours, durée, Type, Enseignants, date,
 * Début, Fin, Site , préférence de lieu, Groupe etu, Adresse mail ,
 * Responsable , Remarque, Rappels
 * Types rencontrés : CM, ED1..ED12, EXAMEN, conf, conf/ED1, conf/ED2. */

function normaliserType(brut) {
  const t = (brut || "").trim().toUpperCase();
  if (t === "EXAMEN") return "examen";
  if (t === "CM") return "cm";
  if (t.startsWith("ED")) return "ed";
  if (t.startsWith("CONF")) return "conf";
  return "cours";
}

export function lireDeroule(lignes) {
  const [entetes, ...corps] = lignes;
  const col = (nom) => entetes.findIndex((e) => e.trim().toLowerCase() === nom);
  const iAnnee = col("année"), iPole = col("pole"), iMat = col("matière"),
        iLib = col("libelé du cours"), iType = col("type"), iDate = col("date"),
        iDeb = col("début"), iFin = col("fin"), iSite = col("site"),
        iSalle = col("préférence de lieu");

  return corps.flatMap((r) => {
    // La colonne Année fait foi : cet onglet pourrait accueillir d'autres
    // promos à l'avenir, comme le sheet DFASM2 contient des lignes DFASM3.
    if (r[iAnnee]?.trim().toUpperCase() !== "DFASM1") return [];
    const date = normDate(r[iDate]);
    if (!date) return [];
    const deb = normHeure(r[iDeb]), fin = normHeure(r[iFin]);
    return [{
      date,
      debut: deb.valeur,
      fin: fin.valeur,
      matiere: r[iMat]?.trim() || null,
      libelle: (r[iLib] || "").trim().slice(0, 300),
      type: normaliserType(r[iType]),
      site: r[iSite]?.trim() || null,
      salle: r[iSalle]?.trim() || null,
      pole: r[iPole]?.trim() || null,
      promo: "DFASM1",
      _source: "deroule",
      _ambigu: deb.ambigu || fin.ambigu,
    }];
  });
}

/* ------------------------- lecture de l'onglet « cycle 1 » ------------------------- *
 * En-têtes réels : "" (matière), date, Horaires, Site, Amphi, INTERVENANTS,
 * ADRESSES DES INTERVENANTS, RESPONSABLES..., Rappel 1 mois, Rappel 15 jours,
 * Rappel 1 semaine, Visible UNESS 6 jours, "", mémo mcr, mémoi mcr.
 * Conférences optionnelles sur les matières de DFGSM3 (cf. mail de rentrée). */

export function lireCycle1(lignes) {
  const [entetes, ...corps] = lignes;
  const col = (nom) => entetes.findIndex((e) => e.trim().toLowerCase() === nom);
  const iMat = 0, iDate = col("date"), iHoraires = col("horaires"),
        iSite = col("site"), iAmphi = col("amphi");

  return corps.flatMap((r) => {
    const date = normDate(r[iDate]);
    if (!date) return [];
    const { debut, fin } = normPlage(r[iHoraires]);
    const matiere = r[iMat]?.trim() || null;
    return [{
      date, debut: debut ?? null, fin: fin ?? null,
      matiere,
      libelle: matiere || "Conférence du cycle 1",
      type: "conf",
      site: r[iSite]?.trim() || null,
      salle: r[iAmphi]?.trim() || null,
      pole: null,
      promo: "DFASM1",
      _source: "cycle1",
      _ambigu: !debut,
    }];
  });
}

/* --------------------- ateliers GOUV et urgences-réa --------------------- *
 * Les deux sheets sources listent les étudiants nommément (colonnes
 * NOM/Prénom). Cette fonction ne lit JAMAIS ces colonnes : elle ne conserve,
 * pour chaque service (nom du chef de service, donnée non nominative — cf.
 * README), que le créneau d'atelier qui lui est associé. C'est la même règle
 * que la « correspondance service → session » déjà utilisée par
 * planning-dfasm2 pour l'atelier vieillissement. */

export function lireAtelierParService(lignes, colService, colonnesRetenues) {
  const [entetes, ...corps] = lignes;
  const col = (nom) => entetes.findIndex((e) => e.trim().toLowerCase() === nom.toLowerCase());
  const iSvc = col(colService);
  if (iSvc < 0) return {};
  const indices = Object.entries(colonnesRetenues)
    .map(([cle, nom]) => [cle, col(nom)])
    .filter(([, i]) => i >= 0);
  const parService = {};
  for (const r of corps) {
    const svc = r[iSvc]?.trim();
    if (!svc || parService[svc]) continue;
    const info = {};
    for (const [cle, i] of indices) info[cle] = r[i]?.trim() || null;
    parService[svc] = info;
  }
  return parService;
}

/* ------------------------------ pipeline ------------------------------ */

const recuperer = async (url) => {
  const rep = await fetch(url, { redirect: "follow" });
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${url}`);
  return parseCSV(await rep.text());
};

const nettoyer = (ev) => {
  const propre = {};
  for (const champ of CHAMPS_PUBLIES) if (ev[champ] != null) propre[champ] = ev[champ];
  propre.id = `${ev.date}-${(ev.matiere || "x")}-${ev.debut || "jj"}`
    .toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  if (ev._ambigu) propre.aVerifier = "Horaire non interprétable dans le sheet";
  propre.source = ev._source;
  return propre;
};

const main = async () => {
  const [deroule, cycle1] = await Promise.all([
    recuperer(csvUrl(SHEET_PLANNING, "0")),
    recuperer(csvUrlParNom(SHEET_PLANNING, "cycle 1")),
  ]);

  // TODO : l'onglet « suture » n'est pas synchronisé. C'est un roster nominatif
  // de plus de 500 lignes (Nom, Prénom, groupe) — exactement le type de
  // fichier d'affectation que ce dépôt ne doit jamais publier. L'atelier
  // suture reste décrit en dur, sans date par étudiant, dans src/data/seed.js.

  const events = [
    ...lireDeroule(deroule),
    ...lireCycle1(cycle1),
  ]
    .map(nettoyer)
    .sort((a, b) => (a.date === b.date
      ? (a.debut || "").localeCompare(b.debut || "")
      : a.date.localeCompare(b.date)));

  // Fusion des corrections manuelles, qui l'emportent toujours sur le sheet.
  let overrides = [];
  try {
    overrides = JSON.parse(await readFile("config/overrides.json", "utf8"));
  } catch { /* pas d'overrides, cas normal */ }
  const parId = new Map(events.map((e) => [e.id, e]));
  for (const o of overrides) {
    if (o.supprimer) parId.delete(o.id);
    else parId.set(o.id, { ...(parId.get(o.id) || {}), ...o, corrige: true });
  }

  const final = [...parId.values()];
  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/events.json", JSON.stringify({
    promo: "DFASM1",
    annee: "2026-2027",
    genere: new Date().toISOString(),
    nb: final.length,
    events: final,
  }, null, 2));

  const suspects = final.filter((e) => e.aVerifier).length;
  console.log(`${final.length} événements écrits, ${suspects} à vérifier.`);
  if (final.length < 50) {
    // Garde-fou : un sheet vidé ou une URL cassée ne doit pas écraser
    // le planning de la promo.
    throw new Error("Trop peu d'événements, le commit est annulé.");
  }

  // Ateliers GOUV et urgences-réa : agrégats anonymisés, sans garde-fou de
  // volume (une douzaine de services est un résultat normal). Un échec de
  // récupération reste silencieux et conserve le fichier précédent : ces
  // deux ateliers ne sont qu'une commodité, jamais la source du planning.
  let ateliers = { gouv: {}, urgrea: {} };
  try {
    ateliers.gouv = lireAtelierParService(
      await recuperer(csvUrl(SHEET_ATELIER_GOUV, "0")),
      "Stage 1",
      { date: "DATE", groupe: "GROUPE", accouchement: "ACCOUCHEMENT", echo: "ECHO", rds: "RDS" },
    );
    ateliers.urgrea = lireAtelierParService(
      await recuperer(csvUrl(SHEET_ATELIER_URGREA, "0")),
      "service",
      { date: "URGENCES VITALES 1 - 9h-12h", acr2: "ACR2 12h-14h", heure: "heure" },
    );
    await writeFile("public/data/ateliers.json", JSON.stringify({
      genere: new Date().toISOString(), ...ateliers,
    }, null, 2));
    console.log(`Ateliers : ${Object.keys(ateliers.gouv).length} services GOUV, ${Object.keys(ateliers.urgrea).length} services urgences-réa.`);
  } catch (e) {
    console.warn(`Ateliers non mis à jour (${e.message}), fichier précédent conservé.`);
  }
};

// N'exécute le pipeline réseau que lorsque le script est lancé directement
// (`node scripts/ingest.mjs`), pas quand ses fonctions sont importées pour
// être testées unitairement contre un CSV synthétique.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
