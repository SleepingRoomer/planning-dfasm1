/* Script de reconnaissance temporaire (round 3) : structure de l'onglet
   "cycle 1" et de l'onglet "suture". N'imprime aucune ligne contenant un nom
   d'intervenant ou d'étudiant : uniquement les en-têtes et les colonnes de
   planification (date, horaires, site) déjà validées comme sûres. */

const A = "1J1_RPiK6E5rpTGMNqsGtC5eWFvJkAhXdxyUHYTqeOZE";

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

async function fetchLignes(url) {
  const rep = await fetch(url, { redirect: "follow" });
  const texte = await rep.text();
  return parseCSV(texte).filter((l) => l.some((c) => c.trim()));
}

async function probeCycle1() {
  console.log("\n=== onglet « cycle 1 » : en-têtes + colonnes sûres uniquement ===");
  const lignes = await fetchLignes(gvizUrl(A, "cycle 1"));
  console.log(`Lignes non vides : ${lignes.length}`);
  const entetes = lignes[0];
  console.log(`En-têtes complets : ${JSON.stringify(entetes)}`);
  const col = (nom) => entetes.findIndex((e) => e.trim().toLowerCase().includes(nom));
  const surs = ["date", "horaire", "site", "amphi"].map((n) => ({ n, i: col(n) }));
  console.log(`Index des colonnes sûres : ${JSON.stringify(surs)}`);
  for (const r of lignes.slice(1, 6)) {
    console.log("  " + surs.map(({ n, i }) => `${n}=${i >= 0 ? r[i] : "?"}`).join(" | "));
  }
  // Colonne 0 (sans en-tête visible) : à quoi sert-elle (matière ? type ?) ?
  console.log(`Colonne 0 sur les 5 premières lignes : ${lignes.slice(1, 6).map((r) => JSON.stringify(r[0])).join(", ")}`);
}

async function probeSuture() {
  console.log("\n=== onglet « suture » : structure ===");
  const lignes = await fetchLignes(gvizUrl(A, "suture"));
  console.log(`Lignes non vides : ${lignes.length}`);
  for (let i = 0; i < Math.min(lignes.length, 8); i++) {
    console.log(`  ligne ${i} (longueur ${lignes[i].length}) : ${JSON.stringify(lignes[i].slice(0, 3))}...`);
  }
  const enTeteProbable = lignes.find((l) => l.some((c) => /nom|prénom|groupe|date/i.test(c)));
  console.log(`Ligne d'en-tête probable : ${JSON.stringify(enTeteProbable)}`);
}

async function main() {
  await probeCycle1();
  await probeSuture();
}

main();
