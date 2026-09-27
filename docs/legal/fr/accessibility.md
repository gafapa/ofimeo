# Déclaration d’accessibilité

{{owner.name}} s’engage à rendre {{siteName}} accessible conformément au décret royal espagnol 1112/2018 du 7 septembre relatif à l’accessibilité des sites web et des applications mobiles du secteur public, qui transpose la directive (UE) 2016/2102.

La présente déclaration s’applique au site web et à l’application {{siteName}} ({{siteUrl}}) ainsi qu’aux installations publiées sans modification. {{#if accessibility.complaintBody}}{{else}}Le titulaire ne fait pas partie du secteur public ; le décret royal 1112/2018 ne lui est donc pas obligatoirement applicable : cette déclaration est fournie volontairement et suit son modèle. Lorsqu’un établissement scolaire ou une administration publique publie sa propre installation, il doit établir sa propre déclaration à partir de celle-ci.{{/if}}

## État de conformité

{{#if accessibility.status=full}}Ce site web est **entièrement conforme** au décret royal 1112/2018.{{/if}}{{#if accessibility.status=partial}}Ce site web est **partiellement conforme** au décret royal 1112/2018 et à la norme EN 301 549 (UNE-EN 301 549:2022, qui reprend le niveau AA des WCAG 2.1) en raison des non-conformités énumérées ci-dessous.{{/if}}{{#if accessibility.status=none}}Ce site web **n’est pas conforme** au décret royal 1112/2018. Les aspects non accessibles sont énumérés ci-dessous.{{/if}}

La liste ci-dessous résulte d’un examen préliminaire et doit être confirmée par un audit complet selon la méthodologie de la norme EN 301 549.

## Contenus non accessibles

### Non-conformités au décret royal 1112/2018

- **Tableur.** La grille est dessinée sur un canevas (canvas) : les lecteurs d’écran ne peuvent pas parcourir les cellules comme un tableau, et le correcteur orthographique du navigateur n’est pas disponible dans l’éditeur de cellule (WCAG 1.3.1, 4.1.2).
- **Dessin.** L’éditeur de dessin fonctionne sur un canevas : les formes ne sont pas exposées aux technologies d’assistance, n’ont pas d’alternative textuelle et leur création et modification nécessitent un dispositif de pointage (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Diagrammes et présentations.** Les formes et connecteurs sont des graphiques SVG sans nom accessible complet ; déplacer, connecter et redimensionner des formes repose principalement sur la souris ou l’écran tactile (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Traitement de texte.** Les marques d’orthographe et de grammaire, la paternité par couleurs et les curseurs des autres personnes sont uniquement visuels et ne sont pas annoncés aux lecteurs d’écran (WCAG 1.3.1, 1.4.1, 4.1.3).
- **Collaboration.** L’arrivée de collaborateurs, leurs sélections et les modifications qu’ils apportent en temps réel ne sont pas communiquées par des messages d’état accessibles (WCAG 4.1.3).
- **Éditeur d’équations et clavier virtuel** (composant tiers) : certaines commandes n’ont pas de nom accessible dans toutes les langues (WCAG 4.1.2).
- **Fichiers générés.** Les PDF créés avec la fonction d’impression du navigateur peuvent ne pas être balisés, et les images exportées ne comportent pas d’alternative textuelle (WCAG 1.1.1, 1.3.1).
- **Dictée et lecture à voix haute.** Elles dépendent des fonctions vocales du navigateur et ne sont pas disponibles dans tous les navigateurs ni toutes les langues.

### Charge disproportionnée

Non invoquée.

### Contenus non soumis à la législation applicable

- Les documents créés par les utilisateurs et les fichiers qu’ils ouvrent, qui sont des contenus de tiers ne relevant pas du contrôle du titulaire.
- Les services et sites de tiers liés ou utilisés de manière facultative (Nextcloud, LanguageTool, assistants d’intelligence artificielle).

## Établissement de la présente déclaration

- Date d’établissement : {{accessibility.preparedOn}}.
- Méthode : {{#if accessibility.method=audit}}audit externe{{else}}auto-évaluation réalisée par le titulaire{{/if}}.
{{#if accessibility.reviewedOn}}- Dernier réexamen : {{accessibility.reviewedOn}}.
{{/if}}
## Fonctions d’accessibilité disponibles

Le bouton *Accessibilité* (ou `Alt+Maj+A`) permet de choisir des polices de lecture (OpenDyslexic, Atkinson Hyperlegible), la taille du texte, l’interlignage et l’espacement, des thèmes sombres et à contraste élevé, la réduction des animations, un grand pointeur, un contour de focus épais, une règle et un masque de lecture, la lecture à voix haute et la dictée. L’interface est utilisable au clavier (`F10` pour la barre de menus) et comporte un lien d’accès direct au contenu.

## Retour d’information et contact

Vous pouvez adresser des communications relatives aux exigences d’accessibilité (article 10.2.a du décret royal 1112/2018), par exemple pour :

- signaler tout éventuel manquement de ce site web ;
- faire part d’autres difficultés d’accès au contenu ;
- poser toute autre question ou suggérer une amélioration ;
- demander des informations accessibles sur des contenus exclus du champ d’application ou déclarés non accessibles,

en écrivant à {{accessibility.contactEmail}}. Il sera répondu aux communications dans un délai maximal de vingt jours ouvrables.

## Procédure de mise en œuvre

{{#if accessibility.complaintBody}}Si, après une demande d’information accessible ou une réclamation, celle-ci a été rejetée, si vous êtes en désaccord avec la décision prise ou si la réponse ne satisfait pas aux exigences de l’article 12.5 du décret royal 1112/2018, vous pouvez introduire un recours auprès de {{accessibility.complaintBody}}, conformément à l’article 13 du décret royal 1112/2018 et à la loi espagnole 39/2015 du 1er octobre relative à la procédure administrative commune des administrations publiques.{{else}}Le titulaire ne faisant pas partie du secteur public, il n’existe pas de procédure administrative de réclamation à son encontre. Si la réponse ne vous satisfait pas, vous pouvez vous adresser de nouveau au titulaire. Si vous utilisez {{siteName}} par l’intermédiaire d’un établissement scolaire public ou d’une administration publique qui publie sa propre installation, vous pouvez adresser votre plainte ou votre réclamation à son unité responsable de l’accessibilité (en Galice, celle du département régional chargé de l’éducation), conformément aux articles 12 et 13 du décret royal 1112/2018.{{/if}} L’Observatoire de l’accessibilité web de l’Administration générale de l’État espagnol fournit des informations sur l’accessibilité du secteur public.
