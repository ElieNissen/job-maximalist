# Job Maximalist

Un tableau de bord d'offres de missions/jobs qui centralise tout, donne un contrôle fin sur les sources suivies, réduit le bruit grâce à un tri avancé, et permet de repérer plus vite les annonces réellement pertinentes en quasi temps réel. L'objectif : remplacer la FOMO d'une veille manuelle, fragmentée et redondante par une paix intérieure au quotidien ✌️

## Ce que fait l'application

- agrège des offres depuis plusieurs sites d'emploi sélectionnables par l'utilisateur
- filtres poussés: mots clés flexibles, localisation, types de missions/contrats, exclusion de mots clés
- envoie une notification quand une offre correspondant aux critères est postée sur l'un des sites (intervalle de rafraîchissement modifiable) et différencie les nouvelles offres de celles déjà détectées
- dédoublonnage des offres présentes sur plusieurs sources
- interfaces diagnostics : consultation des offres refusées pour exclusion de mots-clés/localisation/etc, sources cassées/bloquées...

## Interface

L'application expose un flux principal: `URL Radar`.

Dans l'interface, on retrouve notamment:

- un switch `Offres / Exclues`
- des tags de source pour filtrer visuellement les clusters d'offres
- un panneau `Reglages` avec trois zones:
  - `URLs`: gestion des URLs suivies
  - `Sources`: diagnostics par URL/source suivie
  - `Filtres`: mots-cles inclus/exclus, localisation, contrats, anciennete
- un suivi local des statuts `vu` / `sauvegarde`
- des notifications navigateur locales quand de nouvelles offres sont detectees et que la permission a ete accordee

## Stack

- Next.js 15 (App Router) + TypeScript
- Prisma + SQLite
- node-cron
- Playwright
- Vitest
- Hugeicons

## Lancement en local

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000)

Sur Windows, tu peux aussi lancer:

```bash
start-app.bat
```

## Configuration et persistance locale

L'application fonctionne en priorite avec une logique locale-first:

- les URLs suivies sont stockees localement
- les filtres sont stockes localement
- l'historique des URLs retirees est stocke localement
- les statuts d'offre (`viewed`, `saved`) sont stockes localement
- les offres detectees et les runs de refresh sont persistés via SQLite/Prisma sur la machine

Les filtres exposes dans l'UI sont:

- mots-cles a inclure
- mots-cles a exclure
- localisations
- types de contrat
- anciennete maximum optionnelle

## API

Le front de l'application consomme uniquement les routes suivantes:

- `GET /api/health`
- `GET /api/url-radar/config`
- `PUT /api/url-radar/config`
- `GET /api/url-radar/jobs`
- `PATCH /api/url-radar/jobs/:id/status`
- `GET /api/url-radar/refresh`
- `POST /api/url-radar/refresh`
- `GET /api/url-radar/status`

Route de diagnostic optionnelle:

- `GET /api/url-radar/cloudflare-test`

## Notes

- le projet est pense pour un usage local d'abord, pas pour une architecture multi-utilisateur
- certaines sources peuvent etre limitees par l'anti-bot, Cloudflare, la session ou l'adresse IP
- selon les plateformes, la qualite d'extraction peut varier si le HTML ou le rendu JavaScript change
- les diagnostics de source aident a comprendre les echecs, mais ne garantissent pas qu'une source restera exploitable dans le temps
- les donnees runtime locales ne sont pas destinees a etre versionnees par defaut
