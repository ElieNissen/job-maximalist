# Contribuer à JobMAXIMALIST

Merci de vouloir améliorer JobMAXIMALIST. Le projet est pensé comme une application locale-first : les réglages, les URLs suivies, les favoris, l'historique et la base SQLite restent sur la machine de l'utilisateur.

## Préparer le projet

1. Installer Node.js 20 ou plus récent.
2. Lancer `npm install`.
3. Copier `.env.example` vers `.env`.
4. Lancer `npm run prisma:generate`.
5. Lancer `npm run prisma:push`.
6. Lancer `npm run dev`.

Sur Windows, `start-dev.bat` automatise ces étapes pour un usage local.

## Avant d'ouvrir une pull request

1. Vérifier que les données personnelles ne sont pas commitées.
2. Lancer `npm test`.
3. Lancer `npm run build`.
4. Décrire le changement côté utilisateur, pas seulement côté technique.

## Règles de contribution

- Ne pas ajouter d'URLs de recherche personnelles comme valeurs par défaut.
- Ne pas commiter `.env`, `data/*.json`, `prisma/dev.db`, `.next`, `dist` ou `node_modules`.
- Garder les scrapers robustes face aux changements HTML et documenter les limites quand une source dépend d'une session ou d'un anti-bot.
- Préserver la logique local-first : aucune donnée utilisateur ne doit être envoyée à un service externe sans action explicite et documentée.
