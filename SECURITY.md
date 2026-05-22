# Sécurité

JobMAXIMALIST est une application locale. Elle démarre un serveur Next.js sur la machine de l'utilisateur et stocke ses données localement.

## Signaler un problème

Si tu découvres une faille de sécurité, ouvre une issue privée si l'hébergement GitHub du projet le permet, ou contacte les mainteneurs avant de publier les détails.

## Points sensibles

- Ne publie jamais ton fichier `.env`.
- Les URLs suivies peuvent révéler tes recherches ou tes intentions professionnelles.
- La base SQLite locale peut contenir des offres sauvegardées, vues ou filtrées.
- L'application n'est pas pensée pour être exposée publiquement sur Internet.

## Services optionnels

Les variables Cloudflare présentes dans `.env.example` sont optionnelles et servent uniquement aux tests de rendu distant. L'application fonctionne sans compte Cloudflare.
