# Politique relative aux cookies et au stockage local

{{siteName}} n’utilise ni cookies ni aucune technologie de suivi, de mesure d’audience ou de publicité. Il enregistre uniquement dans votre navigateur les informations strictement nécessaires au fonctionnement de l’application, et ces informations ne sont pas envoyées au titulaire.

## 1. Cookies et stockage local : de quoi s’agit-il ?

Les cookies et les autres technologies de stockage (localStorage, IndexedDB, Cache Storage) permettent à un site web d’enregistrer des informations sur l’appareil de l’utilisateur. L’article 22.2 de la loi espagnole 34/2002 (LSSI-CE) impose d’informer l’utilisateur et d’obtenir son consentement pour les utiliser, sauf lorsqu’ils sont strictement nécessaires à la fourniture d’un service expressément demandé par l’utilisateur.

## 2. Stockage utilisé par {{siteName}}

Tout le stockage est interne (aucun stockage de tiers), il est conservé uniquement dans votre navigateur et dure jusqu’à ce que vous le supprimiez.

| Catégorie | Nom technique | Finalité |
| --- | --- | --- |
| Documents | IndexedDB `ofimeo:<id>` et `ofimeo:<id>:comments` | Contenu de chaque document, commentaires, historique des versions et paternité |
| Journal des modifications signées | IndexedDB `ofimeo-kv` | Permet de transmettre aux autres participants les modifications des documents ouverts avec des liens de lecture ou de commentaire |
| Index des documents | localStorage `ofimeo:docs` | Liste de vos documents : titre, date, clés d’accès et fichier Nextcloud lié |
| Organisation locale | localStorage `ofimeo:library` ; IndexedDB `ofimeo-library` | Dossiers et étiquettes de vos documents, index de recherche dans leur texte et vos propres modèles |
| Sauvegardes | localStorage `ofimeo:backup` | Date de la dernière sauvegarde, rappel et sauvegarde automatique dans Nextcloud, si vous l’activez |
| Relais de l’établissement | localStorage `ofimeo:school-relay` | Adresse du relais de l’établissement et paramètres de connexion qu’il fournit |
| Identité | localStorage `ofimeo:user`, `ofimeo:writer-user-id` | Nom et couleur visibles par vos collaborateurs ; identifiant technique pour la paternité |
| Préférences | localStorage `ofimeo:language`, `ofimeo:a11y`, `ofimeo:spelling`, `ofimeo:spelling-dictionary:<langue>`, `ofimeo:zoom`, `ofimeo:home-view`, `wo-template-lang`, `diagram-libraries` | Langue, accessibilité, orthographe et dictionnaire personnel, zoom, langue des modèles et bibliothèques de formes choisies |
| Assistants IA (uniquement si vous l’activez) | localStorage `ofimeo:webmcp` | Le fait que vous avez autorisé les assistants IA à utiliser les documents ouverts dans ce navigateur (WebMCP ; désactivé par défaut). Voir la [Note sur l’intelligence artificielle](ai.md) |
| Nextcloud (uniquement si vous le configurez) | localStorage `ofimeo:nextcloud`, `ofimeo:nextcloud-server`, `ofimeo:nextcloud-folder`, `ofimeo:nextcloud-format`, `ofimeo:nextcloud-share` | Serveur, nom d’utilisateur et mot de passe d’application, dernier dossier et format utilisés |
| Fonctionnement hors ligne | Service worker et Cache Storage `workbox-precache-*`, `excalidraw-fonts`, `spelling`, `diagram-libs-*` | Fichiers de l’application, polices, dictionnaires et formes pour l’utiliser hors ligne |

Les noms techniques peuvent changer d’une version à l’autre ; les catégories et les finalités restent les mêmes. Les clés `ofimeo` proviennent du nom technique du projet.

## 3. Pourquoi il n’y a pas de bandeau cookies

Tout ce stockage est strictement nécessaire à la fourniture du service que vous demandez (modifier, enregistrer et partager vos documents, mémoriser vos préférences et utiliser l’application hors ligne) et est exempté de consentement en vertu de l’article 22.2 de la LSSI-CE et du guide sur l’utilisation des cookies de l’Agence espagnole de protection des données. Il n’est utilisé ni pour la mesure d’audience, ni pour la publicité, ni pour le profilage, et n’est partagé ni avec le titulaire ni avec des tiers.

Le serveur d’hébergement ne dépose pas de cookies sur ce site. Si un stockage non exempté devait être ajouté à l’avenir, votre consentement serait demandé avant son utilisation.

## 4. Consulter et supprimer le stockage

- **Un document :** sur l’écran d’accueil, ouvrez le menu ⋮ du document et choisissez *Retirer de ce navigateur*. Il est supprimé de ce navigateur ; les copies de vos collaborateurs ne sont pas affectées.
- **Identifiants Nextcloud :** dans le compte Nextcloud, *Se déconnecter*.
- **Tout :** dans les paramètres du navigateur, effacez les données du site (dans Chrome et Edge, *Paramètres → Confidentialité et sécurité → Cookies et données des sites* ; dans Firefox, *Paramètres → Vie privée et sécurité → Cookies et données de sites* ; dans Safari, *Réglages → Confidentialité → Gérer les données de sites web*).

Attention : effacer les données du site supprime définitivement vos documents de cet appareil. Téléchargez-les ou enregistrez-les dans Nextcloud auparavant.

En navigation privée, le navigateur supprime tout ce stockage à la fermeture de la fenêtre.

## 5. En savoir plus

Consultez la [Politique de confidentialité](privacy.md) pour savoir quelles données existent et qui peut les traiter.
