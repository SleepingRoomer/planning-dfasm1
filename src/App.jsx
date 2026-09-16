import React, { useState, useMemo, useEffect } from "react";
import { SEED_EVENTS } from "./data/seed.js";

/* ------------------------------------------------------------------ *
 *  Planning DFASM1 2026-2027 — calqué sur planning-dfasm2, adapté à la
 *  structure réelle des sources DFASM1 (relevée le 16/09/2026) :
 *
 *   - onglet « déroulé » du sheet de la faculté : CM/ED/conf/examens des
 *     pôles GOUV (gynéco-obstétrique...) et URRO (urgences-réa...), deux
 *     cohortes chacun (1/2). Synchronisé par scripts/ingest.mjs.
 *   - onglet « cycle 1 » du même sheet : conférences optionnelles sur les
 *     matières de DFGSM3, le mercredi et certains vendredis. Synchronisé.
 *   - deux sheets d'atelier (GOUV : accouchement inopiné/écho/RDS ; urgences-
 *     réa : urgences vitales/ACR2) : listent les étudiants nommément. Seule
 *     la correspondance service (chef de service) -> créneau est publiée,
 *     jamais les lignes par étudiant. Voir README.
 *   - l'onglet « suture » (plus de 500 lignes Nom/Prénom/groupe) n'est PAS
 *     synchronisé : donnée nominative, hors de portée de ce dépôt.
 *   - le reste (choix de stage, dates administratives) vient du mail de
 *     rentrée et reste en dur dans src/data/seed.js.
 *
 *  N'invente aucune donnée manquante : une portion pour laquelle aucune
 *  source fiable n'a été trouvée reste simplement absente du planning,
 *  plutôt que d'être devinée.
 * ------------------------------------------------------------------ */

const pad2 = (n) => String(n).padStart(2, "0");
const isoLocal = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

const TYPES = {
  examen:  { label: "Examen",         c: "var(--grenat)" },
  edn:     { label: "EDN blanc",      c: "var(--grenat)" },
  cm:      { label: "Cours",          c: "var(--eau)" },
  ed:      { label: "ED",             c: "var(--eau)" },
  conf:    { label: "Conférence",     c: "var(--sauge)" },
  cours:   { label: "Cours",          c: "var(--eau)" },
  atelier: { label: "Atelier",        c: "var(--ambre)" },
  admin:   { label: "Administratif",  c: "var(--doux)" },
};

const titreCas = (s) => (s || "").toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());
const slug = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* Groupes fixes (toujours proposés s'ils sont peuplés) + un onglet par
   matière rencontrée dans les données synchronisées. On ne connaît pas à
   l'avance la liste des matières du déroulé DFASM1 (seule GYNECO-OBSTETRIQUE
   a été vue au moment d'écrire ce fichier) : plutôt que de la figer, les
   onglets par matière se construisent dynamiquement depuis ce qui arrive
   réellement du sheet. */
const GROUPES_FIXES = [
  { id: "administratif", nom: "Vie de la promo", test: (ev) => ev.type === "admin" },
  { id: "edn", nom: "EDN blancs", test: (ev) => ev.type === "edn" },
  { id: "ateliers", nom: "Ateliers", test: (ev) => ev.type === "atelier" },
  { id: "cycle1", nom: "Cycle 1 (matières DFGSM3)", test: (ev) => ev.type === "conf" },
];

function construireGroupes(events) {
  const matieres = new Set();
  events.forEach((ev) => {
    if (GROUPES_FIXES.some((g) => g.test(ev))) return;
    if (ev.subj) matieres.add(ev.subj);
  });
  const dynamiques = [...matieres].sort().map((m) => ({
    id: `mat-${slug(m)}`,
    nom: m,
    test: (ev) => ev.subj === m && !GROUPES_FIXES.some((g) => g.test(ev)),
  }));
  return [...GROUPES_FIXES, ...dynamiques];
}

/* --------------------- fusion sheet ↔ événements en dur --------------------- *
 * Contrairement à planning-dfasm2, seed.js ne duplique aucune donnée déjà
 * couverte par le sheet (aucune notice détaillée n'était disponible pour
 * DFASM1 au moment d'écrire ce fichier) : tant que la synchronisation n'a
 * pas tourné avec succès au moins une fois, seuls les événements
 * administratifs du mail de rentrée s'affichent. Un planning incomplet
 * plutôt qu'un planning inventé. */

function depuisSheet(ev) {
  return {
    d: ev.date,
    s: ev.debut || undefined,
    e: ev.fin || undefined,
    t: ev.libelle || ev.matiere || "Séance",
    subj: ev.matiere ? titreCas(ev.matiere) : undefined,
    type: ev.type,
    place: ev.site || undefined,
    room: ev.salle || undefined,
    pole: ev.pole || undefined,
    note: ev.aVerifier || undefined,
  };
}

/* Un service (chef de service) publié par scripts/ingest.mjs dans
   ateliers.json donne directement le créneau : pas de calcul de session à
   faire côté client, contrairement à l'atelier vieillissement de DFASM2. */
function atelierGouv(service, infos) {
  const info = infos?.[service];
  if (!info?.date) return [];
  const d = normDateISO(info.date);
  if (!d) return [];
  const creneau = (nom, plage) => {
    const { debut, fin } = normPlageAffichage(plage);
    return { d, s: debut, e: fin, t: `Atelier GOUV — ${nom}`, type: "atelier", place: "Stage GOUV", pole: "GOUV" };
  };
  return [
    info.accouchement && creneau("accouchement inopiné", info.accouchement),
    info.echo && creneau("échographie en GO", info.echo),
    info.rds && creneau("relation de soin", info.rds),
  ].filter(Boolean);
}

function atelierUrgRea(service, infos) {
  const info = infos?.[service];
  if (!info?.date) return [];
  const d = normDateISO(info.date);
  if (!d) return [];
  const acr2Heure = info.heure ? normPlageAffichage(info.heure) : {};
  return [
    { d, s: "09:00", e: "12:00", t: "Atelier urgences vitales n°1", type: "atelier", place: "Plateforme de simulation", pole: "URRO",
      note: "Trois autres matinées suivront sur les semaines de stage aux urgences-réa (dates à venir sur le sheet)." },
    { d, s: acr2Heure.debut, e: acr2Heure.fin, t: "Atelier ACR de niveau 2", type: "atelier", place: "Plateforme de simulation", pole: "URRO" },
  ];
}

/* "lundi 28 septembre 2026" -> "2026-09-28" (mêmes tables que scripts/ingest.mjs) */
const MOIS_ISO = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 };
function normDateISO(brut) {
  const m = (brut || "").toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/);
  if (!m || !MOIS_ISO[m[2]]) return null;
  return `${m[3]}-${String(MOIS_ISO[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function normPlageAffichage(brut) {
  const m = (brut || "").match(/(\d{1,2})\s*h\s*(\d{2})?\s*[-–à]\s*(\d{1,2})\s*h\s*(\d{2})?/);
  if (!m) return {};
  return { debut: `${m[1].padStart(2, "0")}:${m[2] || "00"}`, fin: `${m[3].padStart(2, "0")}:${m[4] || "00"}` };
}

/* ------------------------------ utilitaires ------------------------------ */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const toDate = (d) => { const [y, m, j] = d.split("-").map(Number); return new Date(y, m - 1, j); };
const diff = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000);
const frDate = (d) => { const t = toDate(d); return `${JOURS[t.getDay()]} ${t.getDate()} ${MOIS[t.getMonth()]}`; };
const frCourt = (d) => { const t = toDate(d); return `${t.getDate()} ${MOIS[t.getMonth()]}`; };
const moisAnnee = (d) => { const t = toDate(d); return `${MOIS[t.getMonth()]} ${t.getFullYear()}`; };
const horaire = (ev) => !ev.s ? "Toute la journée" : ev.e ? `${ev.s.replace(":", "h")} – ${ev.e.replace(":", "h")}` : `à partir de ${ev.s.replace(":", "h")}`;
const lieu = (ev) => [ev.place, ev.room].filter(Boolean).join(", ");

const stageCourant = (today) => {
  const debut = "2026-09-21";
  if (today < debut) return { n: 1, statut: "avant", jours: diff(debut, today), debut };
  return { n: 1, statut: "pendant", debut };
};

/* Bornes réelles d'un événement. Sans horaire, il occupe la journée entière :
   il reste donc « à venir » jusqu'à minuit et pas jusqu'à 00h00. */
const bornes = (ev) => {
  const [y, m, j] = ev.d.split("-").map(Number);
  if (!ev.s) return [new Date(y, m - 1, j, 0, 0), new Date(y, m - 1, j, 23, 59, 59)];
  const [h1, n1] = ev.s.split(":").map(Number);
  const [h2, n2] = (ev.e || ev.s).split(":").map(Number);
  return [new Date(y, m - 1, j, h1, n1), new Date(y, m - 1, j, h2, n2)];
};

const relatif = (ev, now, today) => {
  const [debut, fin] = bornes(ev);
  if (now >= debut && now <= fin) return "en cours";
  const ms = debut - now;
  if (ms < 3600000) return `dans ${Math.max(1, Math.round(ms / 60000))} minutes`;
  if (ms < 12 * 3600000) return `dans ${Math.round(ms / 3600000)} heures`;
  const j = diff(ev.d, today);
  if (j === 0) return "plus tard aujourd'hui";
  if (j === 1) return "demain";
  if (j <= 6) return `dans ${j} jours`;
  return null;
};

const compte = (j) => {
  if (j <= 0) return { gros: null, texte: "C'est aujourd'hui" };
  if (j === 1) return { gros: "1", texte: "jour avant" };
  return { gros: String(j), texte: "jours avant" };
};

/* ------------------------------ export ICS ------------------------------ */

const VTZ = ["BEGIN:VTIMEZONE", "TZID:Europe/Paris", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT", "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"];
const esc = (s) => String(s || "").replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

const RAPPELS_DEFAUT = { veille: true, heure: true };

const buildICS = (events, titre, rappels = RAPPELS_DEFAUT) => {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Planning DFASM1//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(titre)}`, ...VTZ];
  events.forEach((ev) => {
    const c = ev.d.replace(/-/g, "");
    L.push("BEGIN:VEVENT", `UID:${ev.id}@planning-dfasm1`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`);
    if (ev.s) {
      L.push(`DTSTART;TZID=Europe/Paris:${c}T${ev.s.replace(":", "")}00`);
      L.push(`DTEND;TZID=Europe/Paris:${c}T${(ev.e || ev.s).replace(":", "")}00`);
    } else {
      const n = new Date(toDate(ev.d).getTime() + 86400000);
      L.push(`DTSTART;VALUE=DATE:${c}`, `DTEND;VALUE=DATE:${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}`);
    }
    const titreEv = (ev.subj ? `${ev.subj} — ${ev.t}` : ev.t);
    L.push(`SUMMARY:${esc(titreEv)}`);
    if (lieu(ev)) L.push(`LOCATION:${esc(lieu(ev))}`);
    if (ev.note) L.push(`DESCRIPTION:${esc(ev.note)}`);
    if (rappels.veille) {
      L.push("BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${esc(titreEv)} — demain`, "END:VALARM");
    }
    if (rappels.heure && ev.s) {
      L.push("BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", `DESCRIPTION:${esc(titreEv)} — dans une heure`, "END:VALARM");
    }
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n");
};

const telecharger = (events, titre, fichier, rappels) => {
  const blob = new Blob([buildICS(events, titre, rappels)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fichier; a.click();
  URL.revokeObjectURL(url);
};

/* ------------------------------ styles ------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Archivo+Narrow:wght@500;600;700&family=Spectral:wght@500;600&display=swap');

.pl{
  --nuit:#1E2045; --profond:#2C2F63; --papier:#F2F2F6; --craie:#fff;
  --trait:#DEDEE7; --doux:#63668C; --pale:#8C8FAC;
  --grenat:#A81B37; --eau:#3D5F91; --sauge:#4C6E5A; --ambre:#8A6220;
  font-family:'Archivo',system-ui,sans-serif; background:var(--papier);
  color:var(--nuit); padding:26px 18px 70px; -webkit-font-smoothing:antialiased;
}
.pl-w{max-width:720px;margin:0 auto}

.pl-tete{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.pl-nom{font-family:'Spectral',Georgia,serif;font-weight:600;font-size:18px;letter-spacing:.005em;margin:0}
.pl-an{font-family:'Archivo Narrow',sans-serif;font-size:13px;color:var(--pale);letter-spacing:.06em}
.pl-regle{height:2px;width:54px;background:var(--grenat);margin:9px 0 0;border-radius:1px}

.pl-next{margin-top:24px}
.pl-next-l{font-size:12.5px;color:var(--pale);margin:0 0 6px}
.pl-next-m{font-family:'Archivo Narrow',sans-serif;font-size:13.5px;font-weight:600;color:var(--eau);margin:0}
.pl-next-t{font-size:25px;font-weight:600;line-height:1.18;letter-spacing:-.015em;margin:2px 0 0}
.pl-next-d{font-size:14px;color:var(--doux);margin:7px 0 0;line-height:1.45}

.pl-cd{display:flex;align-items:center;gap:14px;margin-top:20px;padding:14px 16px;
  background:var(--craie);border:1px solid var(--trait);border-left:2px solid var(--grenat);border-radius:2px}
.pl-cd-n{font-family:'Archivo Narrow',sans-serif;font-size:38px;font-weight:700;line-height:.85;color:var(--grenat)}
.pl-cd-x{font-size:13.5px;line-height:1.4;color:var(--doux)}
.pl-cd-x b{color:var(--nuit);font-weight:600}

.pl-stage{display:flex;align-items:center;gap:10px;margin-top:14px;
  font-family:'Archivo Narrow',sans-serif;font-size:13px;color:var(--doux)}
.pl-stage-n{font-weight:700;color:var(--profond)}

.pl-profil{margin-top:22px;padding:15px 16px;background:var(--craie);
  border:1px solid var(--trait);border-radius:2px}
.pl-rangee{display:flex;flex-wrap:wrap;gap:13px}
.pl-rangee>div{flex:1 1 200px;min-width:0}
.pl-champ{display:block;font-size:12.5px;color:var(--doux);margin-bottom:5px}
select{font-family:inherit;font-size:14px;width:100%;padding:8px 10px;
  border:1px solid var(--trait);border-radius:2px;background:#FAFAFC;color:var(--nuit)}
.pl-aide{font-size:12.5px;color:var(--doux);margin:11px 0 0;line-height:1.5}

.pl-infos{margin-top:16px;padding:15px 16px;background:var(--craie);
  border:1px solid var(--trait);border-radius:2px}
.pl-infos h3{font-size:13px;font-weight:600;margin:0 0 6px;color:var(--profond)}
.pl-infos p{font-size:12.5px;color:var(--doux);margin:0 0 8px;line-height:1.5}
.pl-infos p:last-child{margin-bottom:0}

.pl-onglets{display:flex;gap:4px;margin-top:26px;border-bottom:1px solid var(--trait);
  overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.pl-onglets::-webkit-scrollbar{display:none}
.pl-onglet{font-family:inherit;font-size:14px;font-weight:500;background:none;border:none;
  border-bottom:2px solid transparent;padding:9px 13px;color:var(--doux);cursor:pointer;
  margin-bottom:-1px;white-space:nowrap;flex:0 0 auto}
.pl-onglet[aria-selected="true"]{color:var(--profond);border-bottom-color:var(--profond);font-weight:600}
.pl-onglet:focus-visible,button:focus-visible,select:focus-visible{outline:2px solid var(--eau);outline-offset:2px}

.pl-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:11px 0 0;font-size:13px;color:var(--doux)}
.pl-bar-n{font-family:'Archivo Narrow',sans-serif;font-weight:600;color:var(--profond)}
.pl-bar button{font-family:inherit;font-size:13px;font-weight:500;padding:6px 12px;
  border:1px solid var(--profond);border-radius:2px;background:var(--profond);color:#fff;
  cursor:pointer;white-space:nowrap}
.pl-bar button:hover{background:var(--nuit);border-color:var(--nuit)}

.pl-mois{display:flex;align-items:center;gap:12px;margin:30px 0 4px}
.pl-mois span{font-family:'Archivo Narrow',sans-serif;font-size:13px;font-weight:700;
  color:var(--profond);letter-spacing:.04em;white-space:nowrap}
.pl-mois i{flex:1;height:1px;background:var(--trait)}

.pl-jour{display:flex;gap:15px;margin-top:16px}
.pl-rail{flex:0 0 44px;text-align:right;padding-top:3px}
.pl-rail-j{font-family:'Archivo Narrow',sans-serif;font-size:12px;color:var(--pale);line-height:1.1}
.pl-rail-n{font-family:'Archivo Narrow',sans-serif;font-size:26px;font-weight:700;line-height:1.05;color:var(--profond)}
.pl-rail.auj .pl-rail-j{color:var(--grenat);font-weight:700}
.pl-rail.auj .pl-rail-n{color:var(--grenat)}
.pl-pile{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}

.pl-ev{background:var(--craie);border:1px solid var(--trait);border-left:3px solid var(--doux);
  border-radius:2px;padding:11px 13px;position:relative}
.pl-ev-h{font-family:'Archivo Narrow',sans-serif;font-size:12.5px;font-weight:600;letter-spacing:.02em}
.pl-ev-t{font-size:15px;font-weight:500;line-height:1.35;margin:2px 0 0;padding-right:66px}
.pl-ev-s{font-size:13px;color:var(--doux);margin:3px 0 0}
.pl-ev-n{font-size:12.5px;color:var(--doux);margin:7px 0 0;line-height:1.5;
  padding-left:9px;border-left:1px solid var(--trait)}
.pl-ev.exam{background:#FCF6F7;border-color:#E9D2D6}
.pl-add{position:absolute;top:10px;right:10px;font-family:'Archivo Narrow',sans-serif;
  font-size:12px;font-weight:600;background:none;border:1px solid var(--trait);
  border-radius:2px;padding:3px 8px;color:var(--pale);cursor:pointer}
.pl-add:hover{color:var(--profond);border-color:var(--doux)}

.pl-vide{background:var(--craie);border:1px dashed var(--trait);border-radius:2px;
  padding:28px 18px;text-align:center;margin-top:24px}
.pl-vide p{margin:0;font-size:14px;color:var(--doux)}

.pl-lots{margin-top:36px;padding-top:22px;border-top:1px solid var(--trait)}
.pl-lots h2{font-family:'Spectral',Georgia,serif;font-size:16px;font-weight:600;margin:0 0 3px}
.pl-lots>p{font-size:13px;color:var(--doux);margin:0 0 15px;line-height:1.5}
.pl-entete{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:9px}
.pl-entete h3{font-size:12.5px;font-weight:500;color:var(--doux);margin:0}
.pl-lien{font-family:inherit;font-size:12.5px;background:none;border:none;padding:0;
  color:var(--eau);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.pl-grille{display:flex;flex-wrap:wrap;gap:7px}
.pl-lot{font-family:inherit;font-size:13.5px;padding:8px 12px;border:1px solid var(--trait);
  border-radius:2px;background:var(--craie);color:var(--doux);cursor:pointer;
  display:flex;gap:8px;align-items:center;line-height:1.2}
.pl-lot:hover{border-color:var(--doux)}
.pl-lot em{font-style:normal;font-family:'Archivo Narrow',sans-serif;font-size:12.5px;color:var(--pale)}
.pl-lot::before{content:"";width:13px;height:13px;flex:0 0 auto;border:1px solid var(--trait);
  border-radius:2px;background:var(--craie)}
.pl-lot.on{background:#EDEEF6;border-color:var(--profond);color:var(--nuit);font-weight:500}
.pl-lot.on::before{background:var(--profond);border-color:var(--profond);
  box-shadow:inset 0 0 0 2px #EDEEF6}
.pl-lot.on em{color:var(--doux)}

.pl-rappels{margin-top:18px;padding:13px 15px;background:var(--craie);
  border:1px solid var(--trait);border-radius:2px}
.pl-rappels p{font-size:12.5px;color:var(--doux);margin:0 0 9px}
.pl-rap{display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:7px;color:var(--nuit)}
.pl-rap input{width:15px;height:15px;accent-color:var(--profond)}

.pl-final{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:16px}
.pl-final button{font-family:inherit;font-size:14.5px;font-weight:600;padding:12px 20px;
  border:1px solid var(--profond);border-radius:2px;background:var(--profond);color:#fff;cursor:pointer}
.pl-final button:hover:not(:disabled){background:var(--nuit);border-color:var(--nuit)}
.pl-final button:disabled{background:var(--trait);border-color:var(--trait);color:var(--pale);cursor:not-allowed}
.pl-final span{font-size:13px;color:var(--doux)}

.pl-pied{margin-top:30px;padding-top:16px;border-top:1px solid var(--trait);
  font-size:12.5px;color:var(--pale);line-height:1.6}

@media(max-width:520px){
  .pl-next-t{font-size:21px}
  .pl-rail{flex-basis:38px}
  .pl-ev-t{padding-right:0;margin-top:5px}
  .pl-add{position:static;display:inline-block;margin-top:9px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

/* ------------------------------ composants ------------------------------ */

function Evenement({ ev, rappels }) {
  const m = TYPES[ev.type] || TYPES.cours;
  return (
    <div className={`pl-ev ${["examen", "edn"].includes(ev.type) ? "exam" : ""}`} style={{ borderLeftColor: m.c }}>
      <button className="pl-add" onClick={() => telecharger([ev], ev.t, `${ev.id}.ics`, rappels)}>Ajouter</button>
      <div className="pl-ev-h" style={{ color: m.c }}>{horaire(ev)}</div>
      <p className="pl-ev-t">{ev.subj ? `${ev.subj} — ${ev.t}` : ev.t}</p>
      {lieu(ev) && <p className="pl-ev-s">{lieu(ev)}</p>}
      {ev.note && <p className="pl-ev-n">{ev.note}</p>}
    </div>
  );
}

function Journee({ date, events, rappels, today }) {
  const t = toDate(date);
  const auj = date === today;
  return (
    <div className="pl-jour">
      <div className={`pl-rail ${auj ? "auj" : ""}`}>
        <div className="pl-rail-j">{auj ? "auj." : JOURS[t.getDay()].slice(0, 3)}</div>
        <div className="pl-rail-n">{t.getDate()}</div>
      </div>
      <div className="pl-pile">{events.map((ev) => <Evenement key={ev.id} ev={ev} rappels={rappels} />)}</div>
    </div>
  );
}

export default function Planning() {
  const [serviceGouv, setServiceGouv] = useState("");
  const [serviceUrgRea, setServiceUrgRea] = useState("");
  const [vue, setVue] = useState("avenir");
  const [rappels, setRappels] = useState(RAPPELS_DEFAUT);
  const [choisis, setChoisis] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Événements synchronisés depuis data/events.json (déroulé + cycle 1
  // uniquement) ; null tant que rien n'a encore été chargé avec succès. Un
  // échec de fetch reste silencieux : un planning incomplet vaut mieux
  // qu'une page blanche ou une erreur affichée à l'étudiant.
  const [distants, setDistants] = useState(null);
  const [ateliers, setAteliers] = useState(null);

  useEffect(() => {
    let annule = false;
    fetch(`${import.meta.env.BASE_URL}data/events.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (annule) return;
        if (!Array.isArray(data.events) || data.events.length < 50) {
          throw new Error("data/events.json contient trop peu d'événements");
        }
        setDistants(data.events.map(depuisSheet));
      })
      .catch(() => { if (!annule) setDistants(null); });
    fetch(`${import.meta.env.BASE_URL}data/ateliers.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (!annule) setAteliers(data); })
      .catch(() => { if (!annule) setAteliers(null); });
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const today = isoLocal(now);
  const stage = stageCourant(today);

  const E = useMemo(() => [...SEED_EVENTS, ...(distants ?? [])], [distants]);

  const mesEvents = useMemo(() => {
    return [
      ...E,
      ...atelierGouv(serviceGouv, ateliers?.gouv),
      ...atelierUrgRea(serviceUrgRea, ateliers?.urgrea),
    ]
      .map((ev, i) => ({ ...ev, id: ev.id || `evt-${i}` }))
      .sort((a, b) => (a.d === b.d ? (a.s || "").localeCompare(b.s || "") : a.d.localeCompare(b.d)));
  }, [E, serviceGouv, serviceUrgRea, ateliers]);

  const futurs = useMemo(() => mesEvents.filter((ev) => bornes(ev)[1] >= now), [mesEvents, now]);

  const groupes = useMemo(() => construireGroupes(mesEvents), [mesEvents]);
  const groupesActifs = useMemo(
    () => groupes.map((g) => ({ ...g, ev: mesEvents.filter(g.test) })).filter((g) => g.ev.length),
    [groupes, mesEvents]
  );
  const choisisEffectif = choisis ?? new Set(groupesActifs.map((g) => g.id));

  const onglets = useMemo(() => [
    { id: "semaine", nom: "7 prochains jours" },
    { id: "avenir", nom: "Tout à venir" },
    { id: "examens", nom: "Examens" },
    ...groupesActifs.map((g) => ({ id: g.id, nom: g.nom })),
  ], [groupesActifs]);

  const vueOk = onglets.some((o) => o.id === vue) ? vue : "avenir";

  const affiches = useMemo(() => {
    if (vueOk === "examens") return futurs.filter((ev) => ["examen", "edn"].includes(ev.type));
    if (vueOk === "semaine") return futurs.filter((ev) => diff(ev.d, today) <= 7);
    const g = groupes.find((x) => x.id === vueOk);
    return g ? futurs.filter(g.test) : futurs;
  }, [futurs, vueOk, today, groupes]);

  const selection = useMemo(() => {
    const vus = new Set();
    const out = [];
    groupesActifs.filter((g) => choisisEffectif.has(g.id)).forEach((g) =>
      g.ev.forEach((ev) => { if (!vus.has(ev.id)) { vus.add(ev.id); out.push(ev); } })
    );
    return out.sort((a, b) => (a.d === b.d ? (a.s || "").localeCompare(b.s || "") : a.d.localeCompare(b.d)));
  }, [groupesActifs, choisisEffectif]);

  const basculer = (id) => setChoisis((s) => {
    const n = new Set(s ?? groupesActifs.map((g) => g.id));
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const tousChoisis = groupesActifs.length > 0 && groupesActifs.every((g) => choisisEffectif.has(g.id));
  const nomExport = choisisEffectif.size === 1
    ? groupesActifs.find((g) => choisisEffectif.has(g.id))?.nom
    : tousChoisis ? "Tout mon planning" : `${choisisEffectif.size} matières`;

  const blocs = useMemo(() => {
    const out = [];
    let moisCourant = null, jourCourant = null;
    affiches.forEach((ev) => {
      const m = moisAnnee(ev.d);
      if (m !== moisCourant) { moisCourant = m; jourCourant = null; out.push({ type: "mois", cle: m, label: m }); }
      if (ev.d !== jourCourant) { jourCourant = ev.d; out.push({ type: "jour", cle: ev.d, date: ev.d, events: [] }); }
      out[out.length - 1].events.push(ev);
    });
    return out;
  }, [affiches]);

  const prochain = futurs[0];
  const prochainExam = futurs.find((ev) => ["examen", "edn"].includes(ev.type));

  const servicesGouvDispo = ateliers?.gouv ? Object.keys(ateliers.gouv).sort() : [];
  const servicesUrgReaDispo = ateliers?.urgrea ? Object.keys(ateliers.urgrea).sort() : [];

  return (
    <div className="pl">
      <style>{CSS}</style>
      <div className="pl-w">

        <div className="pl-tete">
          <h1 className="pl-nom">Planning DFASM1</h1>
          <span className="pl-an">2026 · 2027</span>
        </div>
        <div className="pl-regle" />

        <div className="pl-next">
          <p className="pl-next-l">Prochainement</p>
          {prochain ? (
            <>
              {prochain.subj && <p className="pl-next-m">{prochain.subj}</p>}
              <p className="pl-next-t">{prochain.t}</p>
              <p className="pl-next-d">
                {(() => {
                  const r = relatif(prochain, now, today);
                  return r ? `${r.charAt(0).toUpperCase()}${r.slice(1)}, ` : "";
                })()}
                {frDate(prochain.d)}, {horaire(prochain).toLowerCase()}
                {lieu(prochain) && <><br />{lieu(prochain)}</>}
              </p>
            </>
          ) : <p className="pl-next-t">Rien de programmé pour l'instant</p>}

          {prochainExam && (() => {
            const c = compte(diff(prochainExam.d, today));
            const quoi = prochainExam.type === "edn" ? "l'EDN blanc" : `l'examen de ${(prochainExam.subj || prochainExam.t).toLowerCase()}`;
            return (
              <div className="pl-cd">
                {c.gros && <span className="pl-cd-n">{c.gros}</span>}
                <span className="pl-cd-x">
                  {c.gros ? <>{c.texte} <b>{quoi}</b></> : <><b>{quoi}</b> a lieu aujourd'hui</>}
                  <br />{frDate(prochainExam.d)}
                </span>
              </div>
            );
          })()}
        </div>

        {stage.statut === "pendant" ? (
          <div className="pl-stage">
            <span className="pl-stage-n">Stage 1</span>
            <span>en cours depuis le {frCourt(stage.debut)}</span>
          </div>
        ) : (
          <div className="pl-stage">
            <span className="pl-stage-n">Stage 1</span>
            <span>commence dans {stage.jours} jours, le {frCourt(stage.debut)}</span>
          </div>
        )}

        <div className="pl-profil">
          <div className="pl-rangee">
            <div>
              <label className="pl-champ" htmlFor="svc-gouv">Mon chef de service en GOUV</label>
              <select id="svc-gouv" value={serviceGouv} onChange={(e) => setServiceGouv(e.target.value)}>
                <option value="">{servicesGouvDispo.length ? "Choisir…" : "Pas encore disponible"}</option>
                {servicesGouvDispo.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="pl-champ" htmlFor="svc-urgrea">Mon chef de service en urgences-réa</label>
              <select id="svc-urgrea" value={serviceUrgRea} onChange={(e) => setServiceUrgRea(e.target.value)}>
                <option value="">{servicesUrgReaDispo.length ? "Choisir…" : "Pas encore disponible"}</option>
                {servicesUrgReaDispo.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <p className="pl-aide">
            Ces deux champs déterminent la date de vos ateliers d'accouchement inopiné/écho/relation de
            soin (GOUV) et d'urgences vitales/ACR2 (urgences-réa). Rien de ce que vous saisissez ne quitte
            votre appareil.
          </p>
        </div>

        <div className="pl-infos">
          <h3>Atelier suture</h3>
          <p>
            À DEESSES, au-dessus de l'amphi Charcot à Pitié. Fortement conseillé : la suture est un ECOS
            technique qui tombe souvent aux ECOS facultaires, et un prérequis utile avant le stage de
            chirurgie. Permutation entre étudiants possible à condition de garder les groupes équilibrés en
            nombre ; aucune conséquence en cas d'absence, si ce n'est de manquer un atelier utile.
          </p>
          <p>
            La liste nominative des groupes n'est pas publiée ici (données personnelles) : consultez le
            planning transmis par la scolarité pour connaître votre créneau.
          </p>
        </div>

        <div className="pl-onglets" role="tablist">
          {onglets.map((o) => (
            <button key={o.id} role="tab" aria-selected={vueOk === o.id} className="pl-onglet"
              onClick={() => setVue(o.id)}>{o.nom}</button>
          ))}
        </div>

        {affiches.length > 0 && (
          <div className="pl-bar">
            <span><span className="pl-bar-n">{affiches.length}</span> {affiches.length > 1 ? "événements" : "événement"} à venir</span>
            <button onClick={() => telecharger(
              affiches,
              `DFASM1 — ${onglets.find((o) => o.id === vueOk)?.nom}`,
              `dfasm1-${vueOk}.ics`,
              rappels
            )}>
              Ajouter cet onglet au calendrier
            </button>
          </div>
        )}

        {blocs.length === 0
          ? <div className="pl-vide"><p>Rien sur cette période.</p></div>
          : blocs.map((b) => b.type === "mois"
              ? <div className="pl-mois" key={`m-${b.cle}`}><span>{b.label}</span><i /></div>
              : <Journee key={b.cle} date={b.date} events={b.events} rappels={rappels} today={today} />)}

        <div className="pl-lots">
          <h2>Composer un calendrier</h2>
          <p>Cochez ce que vous voulez emporter, tout est coché au départ. Un seul fichier est produit.</p>

          <div className="pl-entete">
            <h3>Matières et groupes</h3>
            <button className="pl-lien"
              onClick={() => setChoisis(tousChoisis ? new Set() : new Set(groupesActifs.map((g) => g.id)))}>
              {tousChoisis ? "Tout décocher" : "Tout cocher"}
            </button>
          </div>

          <div className="pl-grille">
            {groupesActifs.map((g) => (
              <button key={g.id} className={`pl-lot ${choisisEffectif.has(g.id) ? "on" : ""}`}
                aria-pressed={choisisEffectif.has(g.id)} onClick={() => basculer(g.id)}>
                {g.nom} <em>{g.ev.length}</em>
              </button>
            ))}
          </div>

          <div className="pl-rappels">
            <p>Rappels ajoutés à chaque événement</p>
            <label className="pl-rap">
              <input type="checkbox" checked={rappels.veille}
                onChange={(e) => setRappels({ ...rappels, veille: e.target.checked })} />
              La veille, à la même heure
            </label>
            <label className="pl-rap">
              <input type="checkbox" checked={rappels.heure}
                onChange={(e) => setRappels({ ...rappels, heure: e.target.checked })} />
              Une heure avant
            </label>
          </div>

          <div className="pl-final">
            <button disabled={!selection.length}
              onClick={() => telecharger(selection, `DFASM1 — ${nomExport}`, "dfasm1-planning.ics", rappels)}>
              Télécharger {selection.length} {selection.length > 1 ? "événements" : "événement"}
            </button>
            <span>{selection.length ? nomExport : "Rien de sélectionné"}</span>
          </div>
        </div>

        <p className="pl-pied">
          Données issues du planning de la faculté et du mail de rentrée. En cas de doute, le document de
          la faculté fait foi. Aucune donnée personnelle n'est stockée ni transmise : les ateliers GOUV et
          urgences-réa n'affichent que la date associée au chef de service que vous sélectionnez, jamais de
          liste d'étudiants. Ce site est une initiative étudiante, sans lien officiel avec la faculté.
        </p>
      </div>
    </div>
  );
}
