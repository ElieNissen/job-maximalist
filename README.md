# JobMAXIMALIST

Un tableau de bord d'offres de missions/jobs qui centralise tout, donne un contrôle fin sur les sources suivies, réduit le bruit grâce à un tri avancé, et permet de repérer plus vite les annonces réellement pertinentes en quasi temps réel. L'objectif : remplacer la FOMO d'une veille manuelle, fragmentée et redondante par une paix intérieure au quotidien ✌️

## Ce que fait l'application

- agrège des offres depuis plusieurs sites d'emploi sélectionnables par l'utilisateur
- filtres poussés: mots clés flexibles, localisation, types de missions/contrats, exclusion de mots clés
- envoie une notification quand une offre correspondant aux critères est postée sur l'un des sites (intervalle de rafraîchissement modifiable) et différencie les nouvelles offres de celles déjà détectées
- dédoublonnage des offres présentes sur plusieurs sources
- interfaces diagnostics : consultation des offres refusées pour exclusion de mots-clés/localisation/etc, sources cassées/bloquées...

## Interface

L'application expose un flux principal : `URL Radar`.

Dans l'interface, on retrouve notamment :

- un switch `Offres / Exclues`
- des tags de source pour filtrer visuellement les clusters d'offres
- un panneau `Reglages` avec trois sections :
  - `URLs` pour les sources suivies
  - `Diagnostic` pour l'etat des sources et du scraping
  - `Filtres avances` pour les mots cles, la localisation, les contrats et l'anciennete
- un suivi local des statuts `vu` / `sauvegarde`
- des notifications navigateur locales quand de nouvelles offres correspondant aux filtres sont detectees

## Stack

- Next.js 15 (App Router) + TypeScript
- Prisma + SQLite
- node-cron
- Playwright
- Vitest
- Hugeicons

## Developpement local

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

Sur Windows, tu peux aussi utiliser :

```bash
start-dev.bat
```

Pour tester une version buildee locale :

```bash
start-app.bat
```

## Distribution

Le projet peut etre distribue comme une application locale prete a lancer, sans demander a l'utilisateur final d'installer Node, npm ou Prisma a la main.

La base SQLite seed vide est reconstruite pendant le packaging a partir du schema deja present dans `prisma/dev.db`.

### Construire le package Windows

Le package Windows est maintenant portable : pas de setup `.exe`, pas d'installation a faire chez l'utilisateur final.

Fichiers a lancer a la racine du projet :

1. `1 - Install Node.js for Windows build.bat`
2. `2 - Build JobMAXIMALIST Windows package.bat`
3. `3 - Open Windows package output.bat`

Ce que fait l'etape 1 :

1. installe `Node.js LTS` si besoin
2. si l'installation automatique ne marche pas, ouvre la page officielle

Ce que fait l'etape 2 :

1. build l'application en mode standalone
2. prepare le bundle runtime local
3. genere le dossier `dist/JobMAXIMALIST - Windows`
4. genere le zip `dist/JobMAXIMALIST - Windows.zip`

Ce que fait l'etape 3 :

1. ouvre directement le dossier de sortie

Contenu du package Windows pour l'utilisateur final :

1. `1 - Start JobMAXIMALIST.vbs`
2. `2 - Repair JobMAXIMALIST.vbs`
3. `3 - Open JobMAXIMALIST data.vbs`
4. `Lisez-moi - Demarrage.txt`

Ordre cote utilisateur final :

1. extraire le zip si besoin
2. garder tout le dossier ensemble
3. double-cliquer sur `1 - Start JobMAXIMALIST.vbs`

Lien officiel utile :

- Node.js : [https://nodejs.org/en/download](https://nodejs.org/en/download)

### Construire le package macOS

Prerequis :

- macOS
- Node.js installe sur la machine de build
- `pkgbuild` disponible

Commande :

```bash
npm run package:macos
```

Sortie :

- `dist/JobMAXIMALIST - macOS/1 - Installer JobMAXIMALIST.pkg`
- `dist/JobMAXIMALIST - macOS/Lisez-moi - Installation.txt`

### Premier lancement

Au premier lancement, l'application :

- cree son dossier de donnees local
- initialise sa base SQLite locale
- installe Chromium pour Playwright si necessaire
- demarre le serveur local
- ouvre automatiquement le navigateur

Une connexion Internet est donc necessaire lors du tout premier lancement installe.

## Configuration et persistance locale

L'application fonctionne avec une logique local-first.

En mode developpement source :

- la configuration radar est stockee dans `data/url-radar-config.json`
- l'etat radar est stocke dans `data/url-radar-state.json`
- la base SQLite est stockee dans `prisma/dev.db`

En mode application installee :

- Windows : `%LocalAppData%/JobMAXIMALIST`
- macOS : `~/Library/Application Support/JobMAXIMALIST`

Les donnees locales couvrent notamment :

- les URLs suivies
- les filtres
- l'historique des URLs retirees
- les statuts d'offre (`viewed`, `saved`)
- les offres detectees et les runs de refresh
- les navigateurs Playwright installes pour le scraping

## API

Le front de l'application consomme les routes suivantes :

- `GET /api/health`
- `GET /api/url-radar/config`
- `PUT /api/url-radar/config`
- `GET /api/url-radar/jobs`
- `PATCH /api/url-radar/jobs/:id/status`
- `GET /api/url-radar/refresh`
- `POST /api/url-radar/refresh`
- `GET /api/url-radar/status`
- `GET /api/url-radar/cloudflare-test`

## Notes

- le projet est pense pour un usage local d'abord, pas pour une architecture multi-utilisateur
- certaines sources peuvent etre limitees par l'anti-bot, Cloudflare, la session ou l'adresse IP
- selon les plateformes, la qualite d'extraction peut varier si le HTML ou le rendu JavaScript change
- les diagnostics aident a comprendre les echecs, mais ne garantissent pas qu'une source restera exploitable dans le temps
