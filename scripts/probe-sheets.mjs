/* Script de reconnaissance temporaire : n'entre pas dans l'architecture finale.
   Sert uniquement à découvrir, depuis les runners GitHub Actions (le réseau du
   sandbox de développement n'a pas accès à docs.google.com), les en-têtes de
   colonnes réels des onglets utiles avant d'écrire scripts/ingest.mjs. */

const SHEETS = {
  A_planning: "1J1_RPiK6E5rpTGMNqsGtC5eWFvJkAhXdxyUHYTqeOZE",
  B_postes: "1AIQePbwBukAJo85098uk76SJr-UZ8M4gvEryyLO6Sfs",
  C_binomes: "1oVdKc3CuJIoMw35U9vojlH8XhjnVKkC9dD4EnVt5tkk",
};

const csvUrl = (id, gid) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;

async function dump(label, id, gid) {
  console.log(`\n=== ${label} (gid=${gid}) ===`);
  try {
    const rep = await fetch(csvUrl(id, gid), { redirect: "follow" });
    console.log(`HTTP ${rep.status}, content-type: ${rep.headers.get("content-type")}`);
    if (!rep.ok) return;
    const texte = await rep.text();
    console.log(`Longueur : ${texte.length} caractères`);
    console.log(texte.split("\n").slice(0, 6).join("\n"));
  } catch (e) {
    console.log(`Erreur : ${e.message}`);
  }
}

async function main() {
  for (const [label, id] of Object.entries(SHEETS)) {
    await dump(`${label} / première feuille`, id, "0");
  }
  // Onglet explicitement pointé par le lien fourni pour le planning DFASM1.
  await dump("A_planning / onglet lié dans le mail", SHEETS.A_planning, "923745554");
}

main();
