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
- un panneau `Réglages` avec trois zones :
  - `URLs` : gestion des URLs suivies
  - `Diagnostic` : diagnostics par URL/source suivie
  - `Filtres avancés` : mots recherchés, mots exclus, localisation et contrats
- un suivi local des statuts `vu` / `sauvegardé`
- des notifications navigateur locales quand de nouvelles offres correspondant aux filtres sont détectées

## Stack

- Next.js 15 (App Router) + TypeScript
- Prisma + SQLite
- node-cron
- Playwright
- Vitest
- Hugeicons

## Lancer l'application

### Windows

Le plus simple est d'utiliser les scripts fournis à la racine du projet.

Pour le développement avec mise à jour automatique :

1. double-cliquer sur `start-dev.bat`
2. laisser la fenêtre ouverte
3. attendre l'ouverture automatique du navigateur sur [http://localhost:3000](http://localhost:3000)

Ce script :

1. copie `.env.example` vers `.env` si besoin
2. installe les dépendances si `node_modules` n'existe pas encore
3. initialise Prisma si `prisma/dev.db` n'existe pas encore
4. lance le serveur Next.js en mode développement rapide avec hot reload

Pour tester une version rebuildée locale, sans hot reload :

1. double-cliquer sur `start-app.bat`

Ce script :

1. nettoie `.next`
2. copie `.env.example` vers `.env` si besoin
3. installe les dépendances si nécessaire
4. initialise Prisma si besoin
5. lance `npm run build`
6. démarre l'application avec `npm run start`

### Manuel / hors Windows

Prérequis :

- Node.js 20 ou plus récent
- npm

Commandes :

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

Sur Windows, la copie peut aussi se faire avec :

```bash
copy .env.example .env
```

## Configuration

Le fichier `.env.example` contient la configuration minimale pour lancer l'application localement.

Les variables Cloudflare sont optionnelles. Elles servent uniquement à tester des fallbacks de rendu distant pour certaines sources et ne sont pas nécessaires au fonctionnement standard.

## Données locales

L'application fonctionne avec une logique local-first.

En mode développement source :

- la configuration radar est stockée dans `data/url-radar-config.json`
- l'état radar est stocké dans `data/url-radar-state.json`
- la base SQLite est stockée dans `prisma/dev.db`

En mode application packagée :

- Windows : `%LocalAppData%/JobMAXIMALIST`
- macOS : `~/Library/Application Support/JobMAXIMALIST`
- Linux : `~/.local/share/JobMAXIMALIST` ou `$XDG_DATA_HOME/JobMAXIMALIST`

Les données locales couvrent notamment :

- les URLs suivies
- les filtres
- l'historique des URLs retirées récemment
- les statuts d'offre (`viewed`, `saved`)
- les offres détectées et les runs de refresh
- les navigateurs Playwright installés pour le scraping

Ces fichiers ne doivent pas être commités, car ils peuvent contenir des recherches, des favoris ou des données personnelles.

## Distribution

Le projet peut être distribué comme une application locale prête à lancer, sans demander à l'utilisateur final d'installer Node, npm ou Prisma à la main.

### Construire le package Windows

Le package Windows est portable : pas de setup `.exe`, pas d'installation à faire chez l'utilisateur final.

Fichiers à lancer à la racine du projet :

1. `1 - Install Node.js for Windows build.bat`
2. `2 - Build JobMAXIMALIST Windows package.bat`
3. `3 - Open Windows package output.bat`

Ce que fait l'étape 1 :

1. installe `Node.js LTS` si besoin
2. si l'installation automatique ne marche pas, ouvre la page officielle

Ce que fait l'étape 2 :

1. build l'application en mode standalone
2. prépare le bundle runtime local
3. génère le dossier `dist/JobMAXIMALIST - Windows`
4. génère le zip `dist/JobMAXIMALIST - Windows.zip`

Ce que fait l'étape 3 :

1. ouvre directement le dossier de sortie

Contenu du package Windows pour l'utilisateur final :

1. `1 - Start JobMAXIMALIST.vbs`
2. `2 - Repair JobMAXIMALIST.vbs`
3. `3 - Open JobMAXIMALIST data.vbs`
4. `Lisez-moi - Démarrage.txt`

Ordre côté utilisateur final :

1. extraire le zip si besoin
2. garder tout le dossier ensemble
3. double-cliquer sur `1 - Start JobMAXIMALIST.vbs`

Lien officiel utile :

- Node.js : [https://nodejs.org/en/download](https://nodejs.org/en/download)

### Construire le package macOS

Prérequis :

- macOS
- Node.js installé sur la machine de build
- `pkgbuild` disponible

Commande :

```bash
npm run package:macos
```

Sortie :

- `dist/JobMAXIMALIST - macOS/1 - Installer JobMAXIMALIST.pkg`
- `dist/JobMAXIMALIST - macOS/Lisez-moi - Installation.txt`

### Premier lancement d'un package distribué

Au premier lancement, l'application :

- crée son dossier de données local
- initialise sa base SQLite locale
- installe Chromium pour Playwright si nécessaire
- démarre le serveur local
- ouvre automatiquement le navigateur

Une connexion Internet est donc nécessaire lors du tout premier lancement d'un package distribué.

## API locale

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

Ces routes sont pensées pour l'application locale, pas pour une exposition publique sur Internet.

## Scraping et limites

- Le projet est pensé pour un usage local d'abord, pas pour une architecture multi-utilisateur.
- Les sources peuvent être limitées par l'anti-bot, Cloudflare, la session, la géolocalisation ou l'adresse IP.
- La qualité d'extraction peut varier si le HTML ou le rendu JavaScript d'une plateforme change.
- Les diagnostics aident à comprendre les échecs, mais ne garantissent pas qu'une source restera exploitable dans le temps.
- Les URLs suivies sont configurées par l'utilisateur. Le dépôt ne contient pas d'URLs de recherche personnelles par défaut.

## Contribuer

Les contributions sont bienvenues. Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les étapes de setup et les règles à respecter avant une pull request.

## Sécurité

Voir [SECURITY.md](SECURITY.md) pour les points sensibles liés aux données locales, aux fichiers `.env` et à l'exposition du serveur local.

## Licence

JobMAXIMALIST est distribué sous licence MIT. Voir [LICENSE](LICENSE).
