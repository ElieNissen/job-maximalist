# Assistance locale

L’assistance répare une méthode de récupération, puis s’arrête. Les actualisations suivantes exécutent les règles enregistrées sans modèle. Les règles restent utilisables lorsque l’assistance est désactivée.

## Installation et choix

Dans l’accueil initial ou Réglages → URLs, choisir Désactivée (par défaut), Me demander ou Automatique. Enregistrer le choix. Installer et ouvrir [Ollama](https://ollama.com/download), puis utiliser « Télécharger le modèle (3,4 Go) ». Le téléchargement de Qwen 3.5 4B est explicite, ne nécessite pas de compte et s’ajoute à l’espace occupé par Ollama. L’application ne télécharge rien automatiquement lors de l’activation du réglage.

L’inférence utilise exclusivement `http://127.0.0.1:11434`, sans service d’IA distant. Ollama peut rester ouvert, mais le modèle est déchargé après l’opération (`keep_alive: 0`). Sans Ollama ou sans modèle, le fonctionnement classique reste disponible.

## Utilisation

Après une extraction vide ou manifestement invalide, une vérification de la page est prévue en arrière-plan. Une recherche explicitement vide ou un blocage du site ne donne pas lieu à une génération. Les filtres utilisateur ne déclenchent pas de réparation. En mode Me demander, l’accord se donne dans Réglages → Diagnostic, source par source ; « Plus tard » reporte l’intervention. Le bouton « Réparer la récupération des offres » permet aussi de signaler une extraction incorrecte que la détection automatique n’a pas repérée.

Une seule réparation s’exécute à la fois. L’opération est limitée à 150 secondes après le contrôle des réglages, pagination de validation comprise ; les démarrages du navigateur et requêtes ont aussi leurs propres délais. Une tentative automatique infructueuse n’est pas répétée pendant 24 heures, même si une actualisation redétecte ensuite une pagination incomplète. Une nouvelle demande manuelle peut la relancer. Désactiver l’assistance annule l’opération active et empêche les suivantes. Une fermeture de l’application interrompt les travaux, sans reprise automatique de l’inférence au redémarrage.

## Règles et vérification

Les règles sont des sélecteurs CSS ou des chemins de champs dans une réponse JSON observée pendant la navigation. Aucun code généré, aucune commande et aucun nouvel appel réseau proposé par le modèle ne sont exécutés. Les sélecteurs sont testés sur la page, puis après une nouvelle navigation. Les réponses illisibles, les titres inutilisables et les règles qui produisent majoritairement des lignes invalides sont rejetés. Cette validation réduit les erreurs, mais ne prouve pas que toutes les offres ont été récupérées.

Le fichier `data/scraping-recipes.json` du profil local conserve les règles, la version précédente et l’état des réparations. Les écritures sont atomiques, avec une copie `.backup`. Les règles sont isolées par URL de recherche complète (paramètres triés), pour ne pas réutiliser une méthode sur une recherche différente sans validation. Aucun changement du dépôt source n’est nécessaire chez l’utilisateur.

## Pagination

Les recettes peuvent enregistrer un bouton « page suivante », « voir plus » ou une zone de défilement (document ou liste interne). Le modèle choisit parmi des commandes observées sur la page. L’application vérifie leur nature à chaque étape, capture les nouvelles réponses JSON et dédoublonne les offres par URL. Elle ne suit pas un lien de pagination vers un autre domaine et ne clique jamais sur un bouton inconnu simplement parce qu’un sélecteur le désigne.

La validation d’une nouvelle méthode explore jusqu’à quatre pages pendant vingt secondes. Les actualisations suivantes explorent jusqu’à vingt pages, cinq cents offres ou quarante-cinq secondes de parcours, sans inférence. Un message signale une limite atteinte ou une pagination bloquée, sans supprimer les résultats partiels. Chaque actualisation repart de la recherche configurée pour retrouver les offres récentes. Deux défilements sans nouvelle offre terminent le parcours ; un bouton actif qui n’avance pas signale un problème et peut déclencher une nouvelle réparation.

## Connexions aux sites

Dans Réglages → Diagnostic → Connexion au site, « Se connecter au site » ouvre un navigateur dédié. L’utilisateur y saisit lui-même son mot de passe et effectue les validations demandées par le site (SSO, double authentification, etc.). « J’ai terminé la connexion » vérifie le retour à la recherche configurée et enregistre la session locale ; « Annuler la connexion » ferme la fenêtre sans nouvelle sauvegarde. La fenêtre expire après dix minutes.

Les cookies, le stockage local et IndexedDB de ce navigateur dédié sont conservés sous `data/browser-sessions/` dans le profil de l’application, à l’écart du dépôt Git. Ces fichiers contiennent des jetons de session sensibles : ils ne doivent pas être partagés et ne sont pas chiffrés par l’application. Les permissions restrictives du fichier sont demandées sur les systèmes qui les supportent. Aucun profil du navigateur personnel n’est importé et ces données ne sont jamais envoyées au modèle.

Une session est isolée par origine (protocole et domaine), partagée uniquement entre les recherches de ce même site. Les méthodes Playwright existantes et les recettes réparées la réutilisent. Une session expirée entraîne une demande de reconnexion, pas une génération de mots de passe. « Oublier la session locale » supprime les fichiers de cette origine et ferme sa fenêtre de connexion ; cela n’effectue pas une déconnexion distante du compte. La connexion reste disponible même lorsque l’assistance IA est désactivée.

## Limites

- Les limites de temps et de volume évitent de monopoliser l’ordinateur ; elles peuvent produire une récupération partielle, signalée dans le diagnostic.
- Un CAPTCHA ou une restriction d’accès n’est pas contourné par l’IA. Une connexion ou vérification humaine peut être nécessaire. Certains sites peuvent refuser le navigateur automatisé même avec une session valide.
- Les sessions fondées uniquement sur `sessionStorage` ou liées à un appareil ne sont pas garanties par la sauvegarde de cookies, stockage local et IndexedDB.
- Le diagnostic automatique est conservateur : une extraction partiellement incorrecte peut nécessiter le bouton de réparation manuelle.
- Les tests automatisés couvrent la persistance, les permissions, les recherches vides, la pagination, le défilement, la réutilisation des sessions et le navigateur. La qualité du modèle Qwen sur chaque site et les performances CPU/GPU nécessitent une mesure sur une installation réelle d’Ollama.
