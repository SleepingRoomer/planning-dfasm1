/* Script de reconnaissance temporaire : n'entre pas dans l'architecture finale.
   Sert uniquement à découvrir, depuis les runners GitHub Actions (le réseau du
   sandbox de développement n'a pas accès à docs.google.com), la structure
   réelle des onglets utiles avant d'écrire scripts/ingest.mjs.

   Important : ce script n'imprime JAMAIS de ligne brute des feuilles B et C,
   qui contiennent des étudiants nommés (colonnes NOM/Prénom). Il n'en publie
   que des agrégats anonymisés (valeurs uniques de la colonne « service »). */

const SHEETS = {
  A_planning: "1J1_RPiK6E5rpTGMNqsGtC5eWFvJkAhXdxyUHYTqeOZE",
  B_atelier_gouv: "1AIQePbwBukAJo85098uk76SJr-UZ8M4gvEryyLO6Sfs",
  C_atelier_urgrea: "1oVdKc3CuJIoMw35U9vojlH8XhjnVKkC9dD4EnVt5tkk",
};

const csvUrl = (id, gid) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
const gvizUrl = (id, sheet) =>
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

function parseCSV(texte) {
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
  return lignes;
}

async function fetchCSV(url) {
  const rep = await fetch(url, { redirect: "follow" });
  const texte = await rep.text();
  return { ok: rep.ok, status: rep.status, ct: rep.headers.get("content-type"), texte };
}

async function probeDeroule() {
  console.log("\n=== A_planning / gid=0 (déroulé) : analyse complète et anonymisée ===");
  const { ok, status, texte } = await fetchCSV(csvUrl(SHEETS.A_planning, "0"));
  console.log(`HTTP ${status}`);
  if (!ok) return;
  const lignes = parseCSV(texte).filter((l) => l.some((c) => c.trim()));
  const [entetes, ...corps] = lignes;
  console.log(`En-têtes : ${JSON.stringify(entetes)}`);
  console.log(`Lignes de données : ${corps.length}`);
  const col = (nom) => entetes.findIndex((e) => e.trim().toLowerCase() === nom);
  const iPole = col("pole"), iType = col("type"), iDate = col("date");
  const poles = new Set(corps.map((r) => r[iPole]?.trim()).filter(Boolean));
  const types = new Set(corps.map((r) => r[iType]?.trim()).filter(Boolean));
  console.log(`Pôles rencontrés : ${[...poles].sort().join(", ")}`);
  console.log(`Types rencontrés : ${[...types].sort().join(", ")}`);
  const dates = corps.map((r) => r[iDate]?.trim()).filter(Boolean);
  console.log(`Première date (brute) : ${dates[0]} — Dernière : ${dates[dates.length - 1]}`);
}

async function probeNomsOnglets(id, label) {
  console.log(`\n=== ${label} : recherche d'onglets par nom (gviz) ===`);
  const candidats = [
    "cycle 1", "Cycle 1", "CYCLE 1", "cycle1",
    "groupes atelier suture", "groupe atelier suture", "atelier suture", "suture",
    "emploi du temps", "Emploi du temps",
  ];
  for (const nom of candidats) {
    const { ok, status, texte } = await fetchCSV(gvizUrl(id, nom));
    const premiereLigne = texte.split("\n")[0]?.slice(0, 200);
    const sembleErreur = texte.includes("Invalid query") || texte.includes("<HTML>") || !ok;
    console.log(`« ${nom} » -> HTTP ${status}${sembleErreur ? " (probablement absent)" : " -> " + premiereLigne}`);
  }
}

async function probeAtelierAnonymise(id, label, colService, colonnesSures) {
  console.log(`\n=== ${label} : correspondance service -> session (anonymisé) ===`);
  const { ok, status, texte } = await fetchCSV(csvUrl(id, "0"));
  console.log(`HTTP ${status}`);
  if (!ok) return;
  const lignes = parseCSV(texte).filter((l) => l.some((c) => c.trim()));
  const [entetes, ...corps] = lignes;
  console.log(`En-têtes (structure uniquement, pas de contenu) : ${JSON.stringify(entetes)}`);
  console.log(`Lignes de données : ${corps.length}`);
  const col = (nom) => entetes.findIndex((e) => e.trim().toLowerCase() === nom.toLowerCase());
  const iSvc = col(colService);
  if (iSvc < 0) { console.log(`Colonne « ${colService} » introuvable.`); return; }
  // Liste blanche stricte des colonnes affichées : jamais NOM/Prénom, même en interne à ce log.
  const indicesSurs = colonnesSures.map((nom) => col(nom)).filter((i) => i >= 0);
  const parService = new Map();
  for (const r of corps) {
    const svc = r[iSvc]?.trim();
    if (!svc) continue;
    const reste = indicesSurs.map((i) => `${entetes[i].trim()}=${r[i]?.trim()}`).join(" | ");
    if (!parService.has(svc)) parService.set(svc, reste);
  }
  console.log(`Services distincts : ${parService.size}`);
  for (const [svc, info] of [...parService.entries()].sort()) {
    console.log(`  ${svc} :: ${info}`);
  }
}

async function main() {
  await probeDeroule();
  await probeNomsOnglets(SHEETS.A_planning, "A_planning");
  await probeAtelierAnonymise(SHEETS.B_atelier_gouv, "B_atelier_gouv", "Stage 1",
    ["DATE", "GROUPE", "ACCOUCHEMENT", "ECHO", "RDS"]);
  await probeAtelierAnonymise(SHEETS.C_atelier_urgrea, "C_atelier_urgrea", "service",
    ["URGENCES VITALES 1 - 9h-12h", "ACR2 12h-14h", "heure"]);
}

main();
