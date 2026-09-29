# Assistance locale

L’assistance répare une méthode de récupération, puis s’arrête. Les actualisations suivantes exécutent les règles enregistrées sans modèle. Les règles restent utilisables lorsque l’assistance est désactivée.

## Installation et choix

Dans l’accueil initial ou Réglages → URLs, choisir Désactivée (par défaut), Me demander ou Automatique. Enregistrer le choix. Installer et ouvrir [Ollama](https://ollama.com/download), puis utiliser « Télécharger le modèle (3,4 Go) ». Le téléchargement de Qwen 3.5 4B est explicite, ne nécessite pas de compte et s’ajoute à l’espace occupé par Ollama. L’application ne télécharge rien automatiquement lors de l’activation du réglage.

L’inférence utilise exclusivement `http://127.0.0.1:11434`, sans service d’IA distant. Ollama peut rester ouvert, mais le modèle est déchargé après l’opération (`keep_alive: 0`). Sans Ollama ou sans modèle, le fonctionnement classique reste disponible.

## Utilisation

Après une extraction vide ou manifestement invalide, une vérification de la page est prévue en arrière-plan. Une recherche explicitement vide ou un blocage du site ne donne pas lieu à une génération. Les filtres utilisateur ne déclenchent pas de réparation. En mode Me demander, l’accord se donne dans Réglages → Diagnostic, source par source ; « Plus tard » reporte l’intervention. Le bouton « Réparer la récupération des offres » permet aussi de signaler une extraction incorrecte que la détection automatique n’a pas repérée.

Une seule réparation s’exécute à la fois. L’opération est limitée à 90 secondes après le contrôle des réglages ; les démarrages du navigateur et requêtes ont aussi leurs propres délais. Une tentative automatique infructueuse n’est pas répétée pendant 24 heures. Une nouvelle demande manuelle peut la relancer. Désactiver l’assistance annule l’opération active et empêche les suivantes. Une fermeture de l’application interrompt les travaux, sans reprise automatique de l’inférence au redémarrage.

## Règles et vérification

Les règles sont des sélecteurs CSS ou des chemins de champs dans une réponse JSON observée pendant la navigation. Aucun code généré, aucune commande et aucun nouvel appel réseau proposé par le modèle ne sont exécutés. Les sélecteurs sont testés sur la page, puis après une nouvelle navigation. Les réponses illisibles, les titres inutilisables et les règles qui produisent majoritairement des lignes invalides sont rejetés. Cette validation réduit les erreurs, mais ne prouve pas que toutes les offres ont été récupérées.

Le fichier `data/scraping-recipes.json` du profil local conserve les règles, la version précédente et l’état des réparations. Les écritures sont atomiques, avec une copie `.backup`. Les règles sont isolées par URL de recherche complète (paramètres triés), pour ne pas réutiliser une méthode sur une recherche différente sans validation. Aucun changement du dépôt source n’est nécessaire chez l’utilisateur.

## Limites de cette première version

- Le navigateur collecte la page initialement chargée et ses réponses JSON. Il ne génère pas de parcours de connexion, de clic « voir plus », de pagination ni de défilement infini. Les règles ne garantissent donc pas l’exhaustivité d’un site paginé.
- Les CAPTCHA, restrictions d’accès et résultats nécessitant un compte ne sont pas réparés par une modification des règles.
- Le diagnostic automatique est conservateur : une extraction partiellement incorrecte peut nécessiter le bouton de réparation manuelle.
- Les tests automatisés couvrent la persistance, les permissions, les recherches vides, la validation et le navigateur. La qualité du modèle Qwen sur chaque site et les performances CPU/GPU nécessitent une mesure sur une installation réelle d’Ollama.
