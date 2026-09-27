# Mentions légales

Les présentes mentions légales régissent l’accès au site web et à l’application {{siteName}} ainsi que leur utilisation, conformément à l’article 10 de la loi espagnole 34/2002 du 11 juillet sur les services de la société de l’information et le commerce électronique (LSSI-CE).

## 1. Identification du titulaire

| Donnée | Valeur |
| --- | --- |
| Titulaire | {{owner.name}} |
| N° d’identification fiscale (NIF/CIF) | {{owner.nif}} |
| Adresse | {{owner.address}} |
| E-mail | {{owner.email}} |
{{#if owner.phone}}| Téléphone | {{owner.phone}} |
{{/if}}{{#if owner.registry}}| Immatriculation | {{owner.registry}} |
{{/if}}| Site web | {{siteUrl}} |

{{#if dpo.email}}Délégué à la protection des données : {{dpo.name}} ({{dpo.email}}).{{else}}Le titulaire n’a pas désigné de délégué à la protection des données, n’y étant pas tenu (art. 37 RGPD et art. 34 LOPDGDD). Pour toute question relative à la protection des données, vous pouvez écrire à {{privacyEmail}}.{{/if}}

## 2. Objet

{{siteName}} est un ensemble d’applications bureautiques collaboratives (traitement de texte, tableur, dessin, diagrammes et présentations) qui s’exécute entièrement dans le navigateur de l’utilisateur. Le titulaire met le programme à disposition sous la forme d’un site web statique : il ne dispose d’aucun serveur d’application propre, ne crée aucun compte utilisateur et n’héberge ni ne reçoit les documents, qui sont enregistrés sur l’appareil de chaque personne et échangés directement entre les navigateurs des personnes qui collaborent.

## 3. Conditions d’accès et d’utilisation

L’accès est libre et gratuit et ne nécessite aucune inscription. L’utilisation de {{siteName}} implique l’acceptation des présentes mentions légales et des [Conditions d’utilisation](terms.md). L’utilisateur s’engage à utiliser le site et l’application conformément à la loi, à la bonne foi, à l’ordre public et, en milieu scolaire, au règlement de l’établissement, et à ne pas les employer à des fins illicites ou portant atteinte aux droits ou aux intérêts de tiers.

## 4. Propriété intellectuelle et industrielle

- Le code propre de {{siteName}}, sa conception et ses textes appartiennent au titulaire ou à ses contributeurs et sont proposés sous la licence indiquée dans le dépôt du projet ; à défaut d’indication expresse, tous droits réservés.
- {{siteName}} comprend des composants de tiers (bibliothèques open source, polices, dictionnaires orthographiques et bibliothèques de formes de draw.io) soumis à leurs propres licences, reproduites dans [Licences des logiciels tiers](../../THIRD_PARTY_NOTICES.md). Rien dans les présentes mentions ne limite les droits accordés par ces licences.
- Le nom {{siteName}} et son logo sont des signes distinctifs du titulaire et ne peuvent pas être utilisés de manière à créer une confusion sur l’origine d’autres produits ou services.
- Les documents créés par les utilisateurs appartiennent à leurs auteurs. Le titulaire n’acquiert aucun droit sur ceux-ci et n’a pas accès à leur contenu.

## 5. Exclusion de garanties et responsabilité

- {{siteName}} est proposé gratuitement et « en l’état ». Le titulaire ne garantit ni la disponibilité ni la continuité du site, ni l’absence d’erreurs, ni la compatibilité avec tous les navigateurs, appareils ou formats de fichier.
- Les documents sont enregistrés uniquement dans le navigateur de chaque personne et dans celui de ses collaborateurs. Le titulaire n’en conserve aucune copie et n’est pas responsable de leur perte, par exemple lors de l’effacement des données du navigateur, d’un changement d’appareil ou d’une panne du matériel. Il appartient à chaque utilisateur de faire des sauvegardes.
- Le titulaire n’héberge, ne transmet ni ne contrôle les contenus que les utilisateurs créent ou échangent entre eux ; il n’en est donc pas responsable au sens des articles 14 à 17 de la LSSI-CE. S’il a effectivement connaissance d’une utilisation illicite du site, il coopérera avec les autorités compétentes.
- La collaboration utilise des services de tiers que le titulaire ne contrôle pas (serveurs de signalisation Nostr, serveurs STUN/TURN) et, si l’utilisateur les active, d’autres services facultatifs (Nextcloud, LanguageTool, assistants d’intelligence artificielle, reconnaissance vocale du navigateur). Le titulaire n’est pas responsable de leur disponibilité, de leur contenu ni du traitement des données qu’ils effectuent.
- Les liens vers des sites de tiers sont fournis à titre indicatif ; le titulaire n’est pas responsable de leur contenu.
- Les limitations ci-dessus ne s’appliquent pas lorsque la loi ne permet pas d’exclure ou de limiter la responsabilité, notamment en cas de dol ou de faute lourde, et n’affectent pas les droits reconnus par le droit de la consommation.

## 6. Protection des données et stockage local

Les informations relatives au traitement des données personnelles figurent dans la [Politique de confidentialité](privacy.md). {{siteName}} n’utilise pas de cookies ; le stockage local qu’il emploie est décrit dans la [Politique relative aux cookies et au stockage local](cookies.md).

## 7. Modifications

Le titulaire peut modifier à tout moment les présentes mentions légales ainsi que la configuration, la présentation ou le contenu du site. La version en vigueur est celle publiée sur cette page, avec la date de sa dernière mise à jour.

## 8. Droit applicable et juridiction

Les présentes mentions sont régies par le droit espagnol. Tout litige relève de la compétence {{#if jurisdiction}}de {{jurisdiction}}, sauf si la réglementation applicable prévoit une autre juridiction{{else}}des juridictions compétentes selon la législation applicable{{/if}} ; en particulier, lorsque l’utilisateur a la qualité de consommateur, le tribunal de son domicile est compétent. Si le titulaire est une administration publique, les dispositions du droit administratif applicable s’appliquent.
