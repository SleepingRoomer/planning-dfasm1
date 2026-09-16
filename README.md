# Planning DFASM1

Dashboard étudiant du planning DFASM1 2026-2027, publié sur GitHub Pages et
synchronisé automatiquement avec le sheet de la faculté.

Initiative étudiante, **sans lien officiel avec la faculté**. En cas de
doute sur un horaire ou un lieu, le document officiel de la faculté fait foi.

## Ce que ça fait

- Vue « Prochainement » et compte à rebours avant le prochain examen.
- Suivi du début du stage 1 (seule date de rotation connue pour l'instant).
- Un onglet par matière / groupe, construit automatiquement à partir de ce
  que le sheet publie réellement (rien n'est figé à l'avance).
- Deux champs de profil (« mon chef de service en GOUV », « mon chef de
  service en urgences-réa ») qui affichent la date de vos ateliers
  d'accouchement inopiné/écho/relation de soin et d'urgences vitales/ACR2.
  Rien de ce qui est saisi ne quitte le navigateur.
- Export `.ics` : un événement, un onglet ou tout le planning, avec rappels
  configurables (la veille, une heure avant).

## D'où viennent les données

Plusieurs origines, combinées en permanence :

1. **Synchronisée automatiquement** : les CM, ED, conférences et examens des
   pôles GOUV et URRO (urgences-réa) viennent de l'onglet « déroulé » du
   sheet de la faculté ; les conférences optionnelles sur les matières de
   DFGSM3 viennent de son onglet « cycle 1 ». `scripts/ingest.mjs` les
   récupère, les normalise et les publie dans `public/data/events.json` par
   liste blanche de colonnes (`date, debut, fin, matiere, libelle, type,
   site, salle, promo, pole` — rien d'autre ne sort du sheet, en particulier
   aucune adresse mail d'enseignant ni commentaire interne à la scolarité).
2. **Ateliers GOUV et urgences-réa, anonymisés** : deux sheets séparés
   listent les étudiants affectés à ces ateliers, nommément (colonnes
   Nom/Prénom). `scripts/ingest.mjs` ne lit jamais ces colonnes : il ne
   publie, dans `public/data/ateliers.json`, que la correspondance entre le
   nom du chef de service (donnée non nominative — un chef de service
   n'identifie aucun étudiant) et le créneau qui lui est associé.
3. **En dur dans `src/data/seed.js`** : le choix de stage n°1, le début du
   stage 1 et la date limite d'inscription viennent du mail de rentrée de la
   scolarité. Aucun onglet du sheet ne les couvre, ils restent donc affichés
   en permanence, que la synchronisation fonctionne ou non.

Si la récupération du sheet échoue, ou renvoie manifestement trop peu
d'événements (moins de 50), l'application retombe silencieusement sur les
événements administratifs de `seed.js` : un planning incomplet vaut mieux
qu'une page blanche. Contrairement à `planning-dfasm2`, aucune notice de
stage détaillée n'était disponible au moment d'écrire ce dépôt : `seed.js`
ne duplique donc pas les CM/ED du sheet, il ne contient que ce que le mail
de rentrée donne comme dates fermes.

## Ce qui n'est jamais publié

- L'onglet « suture » du sheet (plus de 500 lignes Nom/Prénom/groupe) n'est
  **pas synchronisé**. C'est un fichier d'affectation nominatif, exactement
  le type de donnée que ce dépôt ne doit jamais publier, même dans
  l'historique Git. L'atelier suture reste décrit en dur (lieu, modalités de
  permutation) sans date par étudiant.
- Les colonnes Enseignants, Adresse mail, Responsable et les différents
  Rappels internes du sheet (destinataires de mail, mémos de la scolarité)
  ne sont jamais lues par `scripts/ingest.mjs`.
- Les deux sheets d'atelier ne sont jamais republiés ligne par ligne :
  uniquement l'agrégat service → créneau, décrit au point 2 ci-dessus.

## Comment ça se met à jour

`.github/workflows/sync.yml` tourne toutes les heures (et sur demande,
onglet Actions → « Synchroniser le planning » → Run workflow). Il télécharge
le sheet en CSV, le normalise, et ne commite que si le résultat a réellement
changé. `.github/workflows/deploy.yml` reconstruit et republie le site à
chaque push sur `main` — donc uniquement quand la synchronisation a détecté
un vrai changement, pas à chaque passage horaire.

## Corriger une erreur

Si une donnée synchronisée est fausse ou mal interprétée (horaire ambigu
signalé « à vérifier », salle manquante...), sans attendre que la faculté
corrige le sheet : ajouter une entrée dans `config/overrides.json`.

```json
[
  { "id": "2026-11-02-gyneco-obstetrique-14-00", "salle": "amphi B" },
  { "id": "2027-01-12-gyneco-obstetrique-16-00", "supprimer": true }
]
```

L'`id` est celui publié dans `public/data/events.json` pour l'événement
concerné. Une correction l'emporte toujours sur le sheet ; `supprimer: true`
retire l'événement au lieu de le corriger. Les overrides sont réappliqués à
chaque synchronisation, donc ils restent valables tant que l'événement
n'est pas supprimé du sheet.

## Développement local

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # build de production dans dist/
npm run ingest    # relance scripts/ingest.mjs en local
```

## Ce qui n'est pas encore fait

- Le parseur de l'onglet visuel « Emploi du temps » (grille des stages,
  liens Zoom).
- Les dates de rotation des pôles ROM et médecine ambulatoire, et les dates
  de fin de chaque stage : seul le début du stage 1 était connu au moment
  d'écrire ce dépôt.
- Les fichiers `.ics` pré-générés par le workflow, pour s'abonner au
  planning plutôt que le télécharger à la main.
- La généralisation à d'autres promos que DFASM1.

## Confidentialité

Aucune donnée personnelle n'est publiée. Les fichiers d'affectation aux
ateliers (suture, GOUV, urgences-réa) et la liste des étudiants restent dans
le Drive de la faculté ; ce dépôt ne publie que des agrégats non nominatifs
(matières, horaires, et la correspondance service → créneau). `*.xlsx` et
`*.xls` sont exclus du dépôt dès le `.gitignore`.
