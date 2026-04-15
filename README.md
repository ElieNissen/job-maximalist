# Job Maximalist

Tableau de bord local pour centraliser des offres d'emploi depuis plusieurs sources, appliquer des filtres personnalisables, suivre les nouveaux résultats et garder un historique de consultation.

## Ce que fait l'application

- agrège des offres depuis plusieurs sites d'emploi
- permet de gérer les sources suivies depuis l'interface
- applique des filtres persistants modifiables dans l'app
- distingue les offres visibles et les offres exclues
- garde un historique local des détections, vues et favoris
- expose un diagnostic par source pour comprendre ce qui a été trouvé ou bloqué

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
