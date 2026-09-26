// Articles du centre d’aide en français (traduction de en.ts).
import type { Articles } from './types'

const NB = ' ' // espace insécable avant « : ; ! ? »

const articles: Articles = {
  'getting-started': {
    title: 'Premiers pas',
    keywords: 'commencer début démarrer bienvenue accueil nouveau document ouvrir modèle compte',
    body: `Ofimeo est une suite bureautique qui fonctionne entièrement dans votre navigateur${NB}: documents, classeurs, dessins, diagrammes, présentations, formulaires et correction de PDF. Aucun compte n’est nécessaire et rien n’est installé sur un serveur.

## L’écran d’accueil
- **Créer quelque chose de nouveau**${NB}: cliquez sur une carte pour créer un document de ce type.
- **Modèles**${NB}: fiches d’exercices, grilles d’évaluation, carnets de notes, emplois du temps, cartes mentales et plus encore. Cliquez sur l’un d’eux pour obtenir votre propre copie.
- **Ouvrir un fichier…**${NB}: ouvre des fichiers Word, OpenDocument, Excel, CSV, PowerPoint, draw.io, Excalidraw et PDF de votre ordinateur.
- **Vos documents**${NB}: tout ce que vous avez créé ou ouvert dans ce navigateur, avec recherche, dossiers, étiquettes et corbeille (les documents supprimés sont conservés 30${NB}jours).

## Votre nom
Saisissez votre nom dans la case en haut à droite (sur un téléphone ou dans une fenêtre étroite, touchez le bouton en forme de personne en haut à droite). Vos collaborateurs le voient à côté de votre curseur et dans les commentaires, et il sert au nom du fichier quand vous rendez un travail. Un prénom ou des initiales suffisent.

## À savoir
- Les documents sont enregistrés **uniquement dans ce navigateur**. Lisez [Travailler hors ligne et où sont stockées vos données](help:offline) et faites des [sauvegardes](help:backup).
- Pour travailler à plusieurs, envoyez un [lien de partage](help:sharing).
- Les élèves rendent leurs travaux avec le bouton [Rendre](help:handin).

[Revoir la visite guidée](action:tour)`,
  },
  sharing: {
    title: 'Partage et autorisations',
    keywords: 'partager lien inviter collaborer ensemble autorisation droits modifier commenter afficher lecture seule copie fiche code qr élèves',
    body: `Cliquez sur **Partager** (en haut à droite dans chaque application) pour obtenir un lien. Toute personne qui ouvre le lien rejoint le document, et les modifications apparaissent pour tous en temps réel.

## Types de lien
- **Peut modifier**${NB}: les personnes peuvent modifier le document avec vous.
- **Commentaires autorisés**${NB}: les personnes peuvent lire et ajouter des commentaires, mais pas modifier le texte.
- **Peut afficher**${NB}: les personnes peuvent lire le document et suivre les modifications en direct.
- **Crée une copie**${NB}: chaque personne qui l’ouvre obtient sa propre copie privée. Utilisez-le pour donner une fiche à chaque élève.

La boîte de dialogue affiche aussi un **code QR**, pratique pour les tablettes et les téléphones en classe.

## Bon à savoir
- Un lien est comme une clé${NB}: quiconque le possède obtient son accès. Ne le partagez qu’avec les personnes concernées.
- Les liens de lecture et de commentaire ne peuvent pas devenir des liens de modification${NB}: les modifications ne sont acceptées que si elles sont signées avec la clé de modification.
- Il n’y a pas de copie centrale sur un serveur. Pour recevoir les dernières modifications, une personne qui a le document doit être en ligne en même temps. Les modifications faites hors ligne sont fusionnées automatiquement lors de la prochaine connexion commune.
- L’état à côté de Partager indique **Vous seul** ou le nombre de personnes présentes. Si personne n’apparaît jamais, lancez le [test de connexion](help:network).
- Les documents créés avant l’existence des liens avec autorisations ne peuvent être partagés qu’avec des liens de modification. Utilisez Fichier ▸ Faire une copie pour disposer de tous les types de lien.`,
  },
  offline: {
    title: 'Travailler hors ligne et où sont stockées vos données',
    keywords: 'hors ligne internet connexion installer application pwa stockage indexeddb données du navigateur effacer perdus appareil ordinateur',
    body: `Vos documents sont enregistrés **dans ce navigateur, sur cet appareil** (dans son stockage IndexedDB). Ils ne sont envoyés à aucun serveur. L’état d’enregistrement de la barre d’état indique **Enregistré dans ce navigateur**.

## Ce que cela signifie
- Effacer les données du navigateur (historique, cookies et données de sites) **supprime vos documents**. Faites des [sauvegardes](help:backup) ou enregistrez-les dans [Nextcloud](help:nextcloud).
- Un autre navigateur ou un autre ordinateur ne voit pas vos documents. Pour continuer sur un autre appareil, ouvrez-y votre lien de modification pendant que cet appareil est en ligne, ou restaurez une sauvegarde.
- Ofimeo demande au navigateur de protéger son stockage afin qu’il ne supprime pas les documents quand l’espace manque. [Stockage et sauvegarde](action:storage) indique s’il est protégé et l’espace utilisé.

## Travailler sans connexion
- Après la première visite, toute la suite fonctionne hors ligne. L’écran d’accueil affiche **✓ Disponible hors ligne** quand elle est prête.
- Vous pouvez installer Ofimeo comme application (menu du navigateur ou barre d’adresse ▸ Installer). Installée, elle ouvre les fichiers Word, Excel, PowerPoint et autres depuis votre ordinateur.
- Créer, modifier, ouvrir et télécharger des fichiers ne nécessite aucune connexion. Les modifications faites hors ligne sont envoyées aux collaborateurs dès que vous êtes de nouveau connecté.
- Nextcloud et la dictée nécessitent une connexion.`,
  },
  backup: {
    title: 'Sauvegardes et restauration',
    keywords: 'sauvegarde restaurer récupérer copie de sécurité mot de passe chiffré ofimeo-backup rappel documents perdus changer d’ordinateur',
    body: `Comme les documents ne se trouvent que dans ce navigateur, gardez une sauvegarde. Ouvrez [Stockage et sauvegarde](action:storage) (icône de disque sur l’écran d’accueil, ou Fichier ▸ Stockage et sauvegarde… dans n’importe quelle application).

## Sauvegarder
- **Sauvegarder tous les documents** télécharge un seul fichier **.ofimeo-backup** avec tous vos documents, leur historique des versions, les commentaires et vos propres modèles.
- Vous pouvez le protéger par un **mot de passe** (chiffrement fort). Faites-le${NB}: le fichier contient les clés pour modifier vos documents. Sans le mot de passe, il ne peut pas être restauré.
- Sur l’écran d’accueil, vous pouvez aussi sauvegarder uniquement les documents sélectionnés.

## Restaurer
**Restaurer une sauvegarde** lit le fichier et le fusionne${NB}: les documents déjà présents sont mis à jour sans rien perdre et ceux qui manquent sont ajoutés. Un rapport indique ce qui a été ajouté et fusionné. Utilisez-le pour transférer vos documents vers un autre ordinateur ou navigateur.

## Rappels et sauvegarde automatique
- L’écran d’accueil vous prévient lorsque des documents n’existent que dans ce navigateur et qu’aucune sauvegarde n’a été faite depuis 7${NB}jours (vous pouvez changer le nombre de jours ou désactiver le rappel).
- Avec un compte [Nextcloud](help:nextcloud), la sauvegarde automatique dépose une sauvegarde tous les quelques jours dans un dossier de votre Nextcloud (désactivée par défaut).`,
  },
  nextcloud: {
    title: 'Nextcloud',
    keywords: 'cloud nuage serveur webdav enregistrer ouvrir synchroniser mot de passe d’application connexion compte établissement fichier',
    body: `Si votre établissement dispose d’un serveur Nextcloud, vous pouvez y ouvrir des fichiers et les y enregistrer. Votre navigateur communique directement avec Nextcloud.

## Connecter votre compte
Ouvrez [Compte Nextcloud](action:nextcloud) (bouton Nextcloud de l’écran d’accueil, ou Fichier ▸ Compte Nextcloud…). Saisissez l’adresse du serveur et choisissez **Se connecter avec Nextcloud**, ou utilisez un **mot de passe d’application** (Nextcloud ▸ Paramètres personnels ▸ Sécurité ▸ Créer un nouveau mot de passe d’application). Ne saisissez jamais votre mot de passe principal. **Tester la connexion** explique ce qui ne va pas en cas d’échec.

## Ouvrir et enregistrer
- **Ouvrir depuis Nextcloud…** (écran d’accueil et menu Fichier) ouvre un fichier comme nouveau document **lié** à celui-ci.
- **Enregistrer dans Nextcloud** (\`Ctrl+S\`) met à jour le fichier lié. **Enregistrer dans Nextcloud sous…** permet de choisir le dossier, le nom et le format.
- Si le fichier a été modifié entre-temps dans Nextcloud, vous choisissez de l’écraser, d’enregistrer une copie ou d’annuler.
- Enregistrement automatique facultatif toutes les quelques minutes.

## Bon à savoir
- Seule la personne qui a lié un document l’enregistre dans Nextcloud${NB}; la collaboration passe toujours directement entre navigateurs.
- Hors ligne, les actions Nextcloud sont désactivées.
- Si la connexion échoue parce que le serveur bloque ce site, votre service informatique doit l’autoriser (CORS). La boîte de dialogue du compte indique ce dont il a besoin.`,
  },
  handin: {
    title: 'Rendre un travail',
    keywords: 'rendre remettre devoir travail professeur enseignant élève zip pdf déposer lien de dépôt envoyer',
    body: `**Pour les élèves.** Cliquez sur **Rendre** (à côté de Partager). Ofimeo télécharge un fichier ZIP à votre nom et au titre du document, qui contient le document dans ses formats d’origine (par exemple .odt et .docx, ou .pptx et des images des diapositives).

- Si vous n’avez pas encore saisi votre nom, il vous est demandé${NB}: il figure dans le nom du fichier.
- Déposez ou envoyez le ZIP à votre professeur comme il l’a demandé (ENT, e-mail…).
- **Imprimer / Enregistrer en PDF** crée un PDF si nécessaire${NB}: choisissez «${NB}Enregistrer au format PDF${NB}» comme imprimante.
- **Déposer dans un lien de partage Nextcloud…**${NB}: si votre professeur vous a donné un lien de dépôt, le fichier y est envoyé directement. Aucun compte Nextcloud n’est nécessaire.

**Pour les enseignants.**
- Donnez à chaque élève sa propre fiche avec un lien **Crée une copie** (voir [Partage](help:sharing)).
- Créez un lien de dépôt («${NB}Dépôt de fichiers${NB}») dans votre Nextcloud et donnez-le à la classe.
- Ouvrez les PDF des élèves, ou les ZIP rendus, dans [Ofimeo PDF](help:pdf) pour les corriger.
- Pour les quiz, utilisez [Ofimeo Formulaires](help:forms).`,
  },
  network: {
    title: `Réseaux scolaires${NB}: test de connexion et relais`,
    keywords: 'réseau wifi pare-feu filtre bloqué vous seul pas de connexion relais relay turn stun nostr service informatique proxy',
    body: `Les collaborateurs se connectent directement entre eux. Les relais publics servent uniquement à se trouver. Certains réseaux scolaires le bloquent${NB}: l’état reste alors sur **Vous seul**.

## Test de connexion
Ouvrez [Aide ▸ Test de connexion…](action:connection) ou cliquez sur l’état de connexion à côté de Partager. Il vérifie l’accès à Internet, les relais, la possibilité de connexions directes et la façon dont chaque personne du document est connectée. Il se termine par un diagnostic en langage clair. **Copier le rapport** copie les détails pour votre service informatique.

## Causes fréquentes
- Un filtre de contenu bloque les relais publics.
- Un pare-feu strict bloque les connexions directes.
- Le Wi-Fi isole les appareils les uns des autres.

## Ofimeo Relay
Pour ces réseaux, un établissement peut faire tourner **Ofimeo Relay**, un petit programme pour son propre réseau (Windows, macOS, Linux ou Raspberry Pi). Il aide les appareils à se trouver et à se joindre.
- Collez son adresse dans le test de connexion, ou ouvrez un lien avec **?relay=** suivi de son adresse. Le navigateur la mémorise.
- Les liens de partage incluent le relais${NB}: les élèves le reçoivent en ouvrant le lien.
- Vous pouvez choisir de n’utiliser que le relais de l’établissement.

Le service informatique trouve le guide d’installation dans la documentation du projet (docs/relay.md).`,
  },
  privacy: {
    title: 'Confidentialité',
    keywords: 'confidentialité vie privée protection des données rgpd données personnelles élèves mineurs cookies pistage sécurité chiffré',
    body: `Ofimeo est conçu pour que personne d’autre que vous et les personnes avec qui vous partagez ne reçoive vos documents.

- **Pas de compte, pas de cookies, pas de statistiques, pas de publicité.** Le site ne fait que fournir le programme, qui s’exécute ensuite dans votre navigateur.
- **Vos documents restent sur votre appareil** (dans le navigateur). Les préférences, votre nom et vos identifiants Nextcloud sont aussi stockés uniquement ici.
- **Au partage**, les collaborateurs reçoivent le document, ses commentaires et versions, le nom que vous avez saisi et, la connexion étant directe, votre adresse IP. Les données circulent chiffrées directement entre navigateurs. Les relais publics ne voient que des messages de connexion chiffrés.
- **Les liens sont des clés**${NB}: quiconque possède un lien obtient son accès. Ne publiez pas de liens de modification.
- **Nextcloud**${NB}: votre mot de passe n’est envoyé qu’à votre serveur Nextcloud.
- **La dictée** utilise la reconnaissance vocale du navigateur, qui peut envoyer l’audio au service de l’éditeur du navigateur.

## Conseils pour la classe
- Utilisez un prénom, des initiales ou un pseudonyme.
- Ne mettez pas de données personnelles sensibles (santé, situation familiale) dans des documents partagés.

Lisez la [politique de confidentialité](legal:privacy) complète et les [informations pour les établissements](legal:schools).`,
  },
  shortcuts: {
    title: 'Raccourcis clavier',
    keywords: 'clavier raccourcis touches combinaisons ctrl commande mac f1 f10',
    body: `Ces touches fonctionnent dans toutes les applications (sur Mac, utilisez ⌘ au lieu de Ctrl)${NB}:

- \`Ctrl+O\` ouvrir un fichier, \`Ctrl+P\` imprimer, \`Ctrl+S\` enregistrer dans Nextcloud (votre travail est de toute façon toujours enregistré dans le navigateur)
- \`Ctrl+Z\` annuler, \`Ctrl+Y\` rétablir
- \`Ctrl+X\` couper, \`Ctrl+C\` copier, \`Ctrl+V\` coller, \`Ctrl+A\` tout sélectionner
- \`Ctrl+F\` rechercher
- \`F10\` ou \`Alt+Maj+M\` aller à la barre de menus${NB}; utilisez ensuite les flèches, \`Entrée\` et \`Échap\`
- \`Ctrl+/\` ou \`F1\` afficher tous les raccourcis de l’application utilisée
- \`Alt+Maj+A\` panneau d’accessibilité, \`Alt+Maj+R\` lecture à voix haute, \`Alt+Maj+D\` dictée

Dans Ofimeo Documents et Ofimeo Classeurs, \`Ctrl+H\` ouvre rechercher et remplacer.

Les menus affichent le raccourci de chaque commande à côté de celle-ci.

[Afficher les raccourcis de cette application](action:shortcuts)`,
  },
  accessibility: {
    title: 'Accessibilité',
    keywords: 'accessibilité dyslexie police gros caractères texte zoom contraste thème sombre lecteur d’écran lecture à voix haute dictée voix clavier animations',
    body: `Ouvrez le [panneau d’accessibilité](action:accessibility) avec le bouton d’accessibilité ou \`Alt+Maj+A\`. Les réglages sont enregistrés dans ce navigateur et s’appliquent à toute la suite${NB}; vos documents ne changent pas.

- **Polices de lecture**${NB}: OpenDyslexic ou Atkinson Hyperlegible pour l’interface et, si vous le souhaitez, pour le texte des documents.
- **Taille du texte** de l’interface, **interligne et espacement des lettres** pour la lecture.
- **Thèmes**${NB}: clair, sombre, selon le système et deux thèmes à contraste élevé.
- **Réduire les animations**, **grand pointeur de souris**, **contour de focus épais**.
- **Règle de lecture** ou **masque de focus** qui suivent le pointeur et le curseur de texte.
- **Lecture à voix haute** (\`Alt+Maj+R\`)${NB}: lit la sélection, le paragraphe ou tout le document avec les voix du navigateur.
- **Dictée** (\`Alt+Maj+D\`)${NB}: écrit ce que vous dites. Elle nécessite une connexion et un navigateur compatible (Chrome, Edge).
- **Clavier**${NB}: tout s’utilise au clavier. \`F10\` mène à la barre de menus et un lien «${NB}Aller au contenu${NB}» apparaît avec \`Tab\`. Voir [Raccourcis clavier](help:shortcuts).

La langue de l’interface se change sur l’écran d’accueil ou dans le panneau.`,
  },
  writer: {
    title: 'Ofimeo Documents (traitement de texte)',
    keywords: 'traitement de texte document word docx odt page table des matières citation bibliographie commentaire suggestion suivi des modifications révision corriger',
    body: `Un traitement de texte avec de vraies pages, comme ceux que vous connaissez.

## Écrire
- Utilisez les menus (Fichier, Édition, Affichage, Insertion, Format, Tableau, Références, Outils, Révision) et la barre d’outils. Le clic droit offre d’autres options.
- Les styles de paragraphe (Titre, Titres 1, 2…) structurent le texte et alimentent la **table des matières** (Insertion ou Références ▸ Table des matières).
- **Références** propose des citations et une bibliographie aux styles APA, MLA ou Chicago.
- Le format de page, les marges et l’orientation se trouvent dans Fichier ▸ Mise en page…

## Réviser (corriger les travaux des élèves)
- **Commentaires**${NB}: sélectionnez du texte et appuyez sur \`Ctrl+Alt+M\` (ou Révision ▸ Commentaire). Les personnes disposant d’un lien de commentaire peuvent aussi commenter.
- **Suggestions**${NB}: passez du mode **Modification** au mode **Suggestion**. Vos changements sont marqués et l’auteur les accepte ou les refuse.
- Révision ▸ Afficher les auteurs colore le texte selon la personne qui l’a écrit.

## Fichiers
Ouvre et télécharge Word (.docx) et OpenDocument (.odt)${NB}; ouvre aussi Word 97-2003 (.doc), RTF, .html, .txt et Markdown (.md, avec titres, listes, liens, code et tableaux), et télécharge en Markdown. Si un fichier contient quelque chose qu’Ofimeo ne peut pas reprendre (par exemple des zones de texte ou des notes de fin d’un .doc), un message l’indique une fois. Imprimez ou enregistrez en PDF avec Fichier ▸ Imprimer. Affichage ▸ Zoom (ou \`Ctrl++\`, \`Ctrl+-\`, \`Ctrl+0\`) change le zoom.`,
  },
  sheet: {
    title: 'Ofimeo Classeurs (tableur)',
    keywords: 'tableur classeur feuille excel xlsx ods csv formule fonction graphique tableau croisé dynamique cellules carnet de notes',
    body: `Des classeurs avec formules, graphiques et plusieurs feuilles.

- Tapez \`=\` pour commencer une formule, par exemple =SUM(B2:B30) ou =AVERAGE(C2:C30). Des centaines de fonctions sont disponibles.
- **Insertion ▸ Graphique…** crée un graphique en colonnes, en barres, en courbes, en secteurs ou en nuage de points à partir des cellules sélectionnées. Les graphiques se mettent à jour quand les valeurs changent.
- **Données** propose le tri, les filtres, la validation et le **Tableau croisé dynamique…**.
- **Format** propose les formats de nombre, la fusion de cellules et la mise en forme conditionnelle${NB}; les bordures sont dans la barre d’outils.
- La barre d’état affiche la somme, la moyenne et le nombre des cellules sélectionnées.
- Plusieurs personnes peuvent modifier en même temps${NB}; vous voyez leurs sélections dans leurs couleurs.

## Fichiers
Ouvre et télécharge Excel (.xlsx), OpenDocument (.ods) et CSV. Les graphiques sont enregistrés comme de vrais graphiques modifiables dans Excel et LibreOffice. Imprimez ou enregistrez la feuille active en PDF avec Fichier ▸ Imprimer.

Les modèles de carnet de notes, d’appel et de grille d’évaluation de l’écran d’accueil sont prêts à l’emploi.`,
  },
  draw: {
    title: 'Ofimeo Dessin (tableau blanc)',
    keywords: 'dessin tableau blanc croquis dessiner à main levée excalidraw remue-méninges formes flèches',
    body: `Un tableau blanc pour dessiner à main levée ou avec des formes, des flèches et du texte, seul ou avec la classe.

- Choisissez un outil dans la barre d’outils du canevas et faites glisser pour dessiner. Les flèches restent attachées aux formes qu’elles relient.
- Le panneau à côté de la sélection modifie les couleurs, les traits, le remplissage et la police.
- Maintenez \`Espace\` et faites glisser pour vous déplacer${NB}; \`Ctrl\` et la molette de la souris zooment.
- Toutes les personnes présentes dans le dessin voient les pointeurs et les modifications des autres en direct.
- Vous pouvez coller ou déposer des images sur le canevas.

## Fichiers
Fichier ▸ Télécharger au format enregistre des images PNG ou SVG, ou un fichier .excalidraw à rouvrir plus tard. Fichier ▸ Exporter l’image… offre plus d’options (arrière-plan, mode sombre, échelle).`,
  },
  diagram: {
    title: 'Ofimeo Diagrammes',
    keywords: 'diagramme organigramme logigramme carte mentale carte conceptuelle uml réseau drawio visio formes connecteurs frise chronologique',
    body: `Diagrammes, logigrammes et cartes mentales, compatibles avec draw.io.

- Faites glisser des formes depuis le **panneau des formes** vers le canevas, ou cliquez sur l’une d’elles pour l’insérer. La recherche trouve les formes par leur nom.
- Faites glisser depuis un point de connexion d’une forme vers une autre forme pour les relier.
- Double-cliquez sur une forme pour saisir son texte.
- Le **panneau de format** modifie le remplissage, le trait, le texte, les flèches, la position et la taille.
- **Disposition** propose l’alignement, le groupement et les dispositions automatiques (arbre, cercle…).
- **Affichage ▸ Plus de formes…** ajoute des bibliothèques comme UML, réseaux, plans d’étage, électricité ou BPMN.
- Un diagramme peut avoir plusieurs pages (onglets en bas).

## Fichiers
Ouvre et télécharge les fichiers draw.io (.drawio)${NB}; ouvre les dessins Visio (.vsdx). Téléchargez des images PNG ou SVG, ou imprimez et enregistrez en PDF.

L’écran d’accueil propose des modèles de cartes mentales, frises chronologiques, logigrammes et organisateurs graphiques.`,
  },
  slides: {
    title: 'Ofimeo Présentations',
    keywords: 'présentation diapositives powerpoint pptx odp présenter projecteur présentateur notes animation thème disposition suivre',
    body: `Des présentations pour la classe.

- Le **volet des diapositives** à gauche affiche les diapositives. Cliquez avec le bouton droit sur une miniature pour ajouter, dupliquer, déplacer ou supprimer une diapositive et pour changer sa disposition ou son arrière-plan.
- Choisissez un **thème** et une **disposition** pour chaque diapositive. Cliquez sur les espaces réservés pour ajouter un titre et du texte.
- Insérez des images, des formes, des tableaux et des équations. Saisissez les **notes du présentateur** sous la diapositive.
- Les **animations** et **transitions** font apparaître les objets et les diapositives tour à tour.
- **Présenter** affiche les diapositives en plein écran${NB}: flèches ou clic pour avancer, \`L\` pour un pointeur laser, \`B\` pour un écran noir, \`Échap\` pour terminer. Le **mode Présentateur** affiche les notes et un chronomètre dans une deuxième fenêtre.
- Pendant que vous présentez, les autres personnes de la présentation peuvent vous **suivre** (Suivre le présentateur), même avec un lien de lecture.

## Fichiers
Ouvre PowerPoint (.pptx). Télécharge PowerPoint (.pptx), OpenDocument (.odp), PDF et des images des diapositives.`,
  },
  forms: {
    title: 'Ofimeo Formulaires (formulaires et quiz)',
    keywords: 'formulaire quiz questionnaire test examen sondage enquête questions réponses noter note score autoévaluation',
    body: `Des formulaires, sondages et quiz qui se corrigent tout seuls.

## Pour les enseignants
- **Question** ajoute une question${NB}; choisissez son type${NB}: réponse courte, paragraphe, choix multiple, cases à cocher, liste déroulante, échelle, grille, date, heure ou nombre. **Section** crée une nouvelle page.
- Activez **Quiz** pour définir les bonnes réponses, les points et les commentaires. La correction est automatique${NB}; les paragraphes sont corrigés à la main.
- **Envoyer** donne le lien et un code QR pour vos élèves. Ils ne voient que le formulaire, pas les réponses des autres.
- Les réponses arrivent quand votre navigateur (ou celui d’un autre éditeur) est en ligne. Consultez-les dans **Réponses**, avec graphiques et statistiques, et exportez-les vers un classeur.

## Pour les élèves
- Saisissez votre nom, répondez aux questions et appuyez sur **Envoyer**.
- Si vous êtes hors ligne, la réponse est envoyée au retour de la connexion.
- Si aucun enseignant n’est en ligne, utilisez **Télécharger ma réponse** et remettez le fichier à votre enseignant.

Les réponses sont chiffrées dans le navigateur de l’élève${NB}: seuls les éditeurs du formulaire peuvent les lire.`,
  },
  pdf: {
    title: 'Ofimeo PDF (corriger des PDF)',
    keywords: 'pdf corriger noter annoter surligner stylo tampon signature note acrobat copie rendue zip',
    body: `Corrigez et annotez des fichiers PDF, par exemple les travaux rendus par vos élèves.

- Ouvrez un PDF depuis l’écran d’accueil, depuis Fichier ▸ Ouvrir…, ou ouvrez un ZIP rendu${NB}: les PDF qu’il contient sont listés.
- Outils${NB}: surligner, souligner et barrer (sélectionnez du texte), stylo et gomme, zones de texte, formes, **tampons** (coche, croix, «${NB}Bien${NB}», une note…), **notes** et votre **signature**.
- Touches${NB}: \`H\` surligner, \`P\` stylo, \`T\` zone de texte, \`N\` note, \`S\` tampon, \`G\` signature, \`Échap\` retour à Sélectionner.
- Clavier${NB}: choisissez un outil (par exemple \`T\`, \`N\`, \`R\` ou \`S\`) et appuyez sur \`Entrée\` pour le placer au centre de la page affichée. Dans le panneau Commentaires, **Ajouter un commentaire** fait de même pour les notes.
- Partagez le PDF pour le corriger à plusieurs ou pour que l’élève lise vos annotations.

## Pages
Le menu **Page** (ou le clic droit sur une miniature) fait pivoter une page à gauche ou à droite (\`Ctrl+[\` / \`Ctrl+]\`), la monte ou la descend, ajoute des pages blanches et supprime des pages. Faites glisser les miniatures pour les réordonner (ou \`Alt+↑\` / \`Alt+↓\` sur une miniature). Les annotations suivent leur page et Annuler rétablit chaque modification. Le PDF téléchargé respecte le nouvel ordre et la rotation.

## Fichiers
Fichier ▸ Télécharger au format enregistre le **PDF avec annotations**${NB}: «${NB}modifiable${NB}» les conserve comme annotations que d’autres lecteurs PDF peuvent modifier, «${NB}aplati${NB}» les dessine dans les pages. Le rendu inclut les deux. Les zones de texte et les tampons conservent des symboles comme π, √, ≈, → et ✓.

Un **PDF protégé par mot de passe** le demande à l’ouverture. Le document garde le fichier protégé d’origine${NB}; le mot de passe n’y est pas enregistré ni envoyé à personne, donc chaque personne qui l’ouvre (et vous, dans un nouvel onglet) le saisit à nouveau. Si vous annulez, rien n’est ajouté.`,
  },
}

export default articles
