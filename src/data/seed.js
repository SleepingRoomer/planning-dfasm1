/* ------------------------------------------------------------------ *
 *  Événements du planning DFASM1 2026-2027, extraits du mail de rentrée
 *  (27 juillet 2026) et de son relanceur de rentrée (semaine du 7
 *  septembre 2026).
 *
 *  Deux rôles pour ce fichier :
 *   1. Source de vérité pour les événements qu'aucun onglet du sheet ne
 *      couvre encore (administratif, choix de stage) — ils viennent des
 *      mails de la scolarité, pas d'une colonne synchronisable. Ils
 *      restent affichés en permanence, que la synchronisation
 *      fonctionne ou non.
 *   2. Filet de secours complet si `data/events.json` est inaccessible
 *      ou manifestement tronqué (fetch en échec, moins de 50 événements).
 *
 *  N'invente aucune donnée : contrairement à DFASM2, aucune notice de
 *  stage détaillée (dates de CM/ED par matière) n'était disponible au
 *  moment d'écrire ce fichier — seul le mail de rentrée l'était. Le
 *  déroulé des cours et les confs du cycle 1 sont donc entièrement à la
 *  charge de la synchronisation `scripts/ingest.mjs` ; ce fichier ne
 *  contient que ce que le mail donne comme dates fermes.
 * ------------------------------------------------------------------ */

export const SEED_EVENTS = [
  // ---------- Rentrée et choix de stage n°1 ----------
  {
    d: "2026-09-07", s: "14:00", e: "17:00",
    t: "Examen blanc sur les matières de DFGSM3 (mini EDN blanc)",
    type: "edn", place: "Salle info uniquement",
  },
  {
    d: "2026-09-08", s: "14:00", e: "18:00",
    t: "Correction de l'examen blanc",
    type: "edn", place: "Zoom", note: "Non enregistrée.",
  },
  {
    d: "2026-09-08", s: "18:00",
    t: "Zoom questions/réponses avant le choix de stage",
    type: "admin", place: "Zoom",
    note: "Pour qui a des questions même après avoir revu la vidéo de la réunion du 29 juin.",
  },
  {
    d: "2026-09-11", s: "09:00",
    t: "Choix de stage n°1",
    type: "admin", place: "Zoom",
    note: "Compte « grande réunion », code secret transmis par mail. Durée envisagée : 5 heures. Si le choix des binômes de médecine ambulatoire est trop long, il est reporté au dimanche matin (13/09).",
  },

  // ---------- Administratif ----------
  {
    d: "2026-09-21", t: "Début du stage 1",
    type: "admin",
    note: "Statut d'étudiant hospitalier ; paye à partir de cette date (versée fin octobre pour le premier mois).",
  },
  {
    d: "2026-10-15", t: "Date limite d'inscription à la faculté",
    type: "admin",
    note: "Deadline impérative. Les stages et les cours peuvent commencer sans inscription, mais ne tardez pas trop.",
  },
];
