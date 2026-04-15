# Job Maximalist

Un tableau de bord d'offres de missions/jobs qui centralise tout, donne un contrôle fin sur les sources suivies, réduit le bruit grâce à un tri avancé, et permet de repérer plus vite les annonces réellement pertinentes en quasi temps réel. L'objectif : remplacer la FOMO d'une veille manuelle, fragmentée et redondante par une paix intérieure au quotidien ✌️

## Ce que fait l'application

- agrège des offres depuis plusieurs sites d'emploi sélectionnables par l'utilisateur
- filtres poussés: mots clés flexibles, localisation, types de missions/contrats, exclusion de mots clés
- envoie une notification quand une offre correspondant aux critères est postée sur l'un des sites (intervalle de rafraîchissement modifiable) et différencie les nouvelles offres de celles déjà détectées
- dédoublonnage des offres présentes sur plusieurs sources
- interfaces diagnostics : consultation des offres refusées pour exclusion de mots-clés/localisation/etc, sources cassées/bloquées...
  
## Stack

- Next.js (App Router) + TypeScript
- Prisma + SQLite
- node-cron
- Playwright
- Vitest

## Lancement en local

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000)

Sur Windows, tu peux aussi lancer :

```bash
start-app.bat
```

## Configuration

L'application fonctionne en priorité avec une configuration locale persistée :

- sources d'offres
- cadence de rafraîchissement
- filtres de mots-clés, localisations, contrats et sources

Une partie de cette configuration est modifiable directement dans l'interface via `Réglages`.

## API principale

- `GET /api/health`
- `GET /api/jobs`
- `GET /api/jobs/search`
- `POST /api/jobs/refresh`
- `PATCH /api/jobs/:id/status`
- `GET /api/url-radar/config`
- `PUT /api/url-radar/config`
- `GET /api/url-radar/jobs`
- `POST /api/url-radar/refresh`
- `GET /api/url-radar/status`

## Notes

- le projet est pensé pour un usage local d'abord
- certaines sources peuvent être limitées par l'anti-bot ou par leurs conditions d'accès
- les données runtime locales ne sont pas destinées à être versionnées par défaut

## Known limitations

- certaines plateformes bloquent ou limitent le scraping public selon la fréquence, la session ou l'adresse IP
- selon la source, la qualité d'extraction peut varier si le site change sa structure HTML ou son rendu JavaScript
- toutes les métadonnées ne sont pas toujours disponibles de manière fiable sur toutes les plateformes
- les diagnostics de source aident à comprendre les échecs, mais ne garantissent pas qu'une plateforme restera exploitable dans le temps
- l'application privilégie un usage local avec persistance de données sur la machine, pas une architecture multi-utilisateur
