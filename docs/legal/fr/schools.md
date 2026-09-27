# Informations pour les établissements scolaires

Guide destiné aux équipes de direction, aux référents numériques et aux délégués à la protection des données (DPD) des établissements et administrations de l’éducation qui souhaitent utiliser {{siteName}} : quelles données sont traitées, où elles se trouvent, qui en est responsable, quels sont les risques et comment le configurer. Il comprend un modèle de fiche pour le registre des activités de traitement et un texte d’information pour les familles.

## 1. Résumé pour la direction

- {{siteName}} est une application web statique : pas de comptes, pas de serveur d’application, pas de base de données centrale. Le titulaire du site ne reçoit ni les documents ni les données des élèves.
- Les documents sont enregistrés dans le navigateur de chaque appareil et synchronisés directement entre les navigateurs des personnes qui collaborent, avec un chiffrement de bout en bout.
- Pour que les navigateurs se trouvent, des relais Nostr publics et des serveurs STUN de tiers sont utilisés par défaut ; ils voient les adresses IP et des messages de connexion chiffrés, mais pas le contenu. L’établissement peut les remplacer par son propre relais.
- Les fonctions qui envoient des données à des tiers (LanguageTool, assistants d’IA via WebMCP) sont désactivées par défaut. La dictée dépend du navigateur.
- Dans l’activité pédagogique, le responsable du traitement est l’établissement ou l’administration de l’éducation (vingt-troisième disposition additionnelle de la loi organique espagnole 2/2006 sur l’éducation et art. 6.1.e RGPD).

## 2. Flux de données

```text
 Navigateur de l’élève ◄── WebRTC chiffré (DTLS), direct ──► Navigateur de l’enseignant
        │                                                           │
        ├── Signalisation chiffrée ──► relais Nostr (publics ou de l’établissement)
        ├── Détection de l’adresse IP ──► serveurs STUN/TURN (publics ou de l’établissement)
        ├── Téléchargement de l’application ──► serveur web (GitHub Pages ou de l’établissement)
        └── Facultatif : Nextcloud de l’établissement · LanguageTool · assistant d’IA
```

| Donnée | Lieu de stockage | Qui y a accès | Remarques |
| --- | --- | --- | --- |
| Contenu des documents, commentaires, versions et paternité | Navigateur de chaque participant (IndexedDB) | Participants disposant du lien | Ne transite par aucun serveur du titulaire |
| Nom ou pseudonyme et couleur | Navigateur ; envoyés aux collaborateurs | Participants | Prénom, initiales ou pseudonyme recommandés |
| Adresse IP | Non enregistrée par l’application | Autres participants, relais, serveurs STUN/TURN, serveur web | Inhérente aux connexions directes |
| Clés d’accès | Dans les liens (après `#`) et dans le navigateur | Toute personne disposant du lien | Les liens équivalent à des mots de passe |
| Identifiants Nextcloud | Navigateur (localStorage) | Uniquement le navigateur et le serveur Nextcloud | Utiliser des mots de passe d’application, jamais le mot de passe principal |
| Texte vérifié par LanguageTool | Serveur LanguageTool configuré | Opérateur du serveur | Désactivé par défaut |
| Contenu lu par un assistant d’IA | Fournisseur de l’assistant | Fournisseur | Désactivé par défaut |

## 3. Rôle de chaque partie

| Partie | Rôle en matière de protection des données |
| --- | --- |
| Établissement ou administration de l’éducation | Responsable du traitement des données des élèves et des enseignants dans l’activité pédagogique. Décide de l’usage, de la configuration et des règles. |
| Enseignants | Agissent pour le compte de l’établissement, selon ses instructions. |
| Titulaire de ce site ({{owner.name}}) | Met le programme à disposition. N’a pas accès au contenu des documents et n’est donc pas sous-traitant à leur égard. Responsable uniquement des journaux techniques de l’hébergement web. |
| Établissement qui publie sa propre installation | Également responsable du serveur web, de ses journaux et des textes juridiques de son installation. |
| Opérateur du relais et du TURN de l’établissement | L’établissement ou l’administration, en tant que responsable (ou son prestataire, en tant que sous-traitant). |
| Relais publics et serveurs STUN | Tiers indépendants, sans contrat avec le titulaire ni avec l’établissement. Il est recommandé de les remplacer. |
| Nextcloud, LanguageTool, assistants d’IA | L’organisme qui fournit chaque service, selon le contrat ou les conditions qui le lient à l’établissement. |

## 4. Modèle de fiche pour le registre des activités de traitement

Modèle indicatif pour le registre prévu à l’article 30 du RGPD et à l’article 31 de la LOPDGDD. Il doit être adapté par le DPD de l’établissement ou de l’administration.

| Champ | Contenu proposé |
| --- | --- |
| Activité de traitement | Création et modification collaboratives de documents pédagogiques avec {{siteName}} |
| Responsable | [Établissement / département régional ou autorité compétente], avec ses coordonnées |
| Délégué à la protection des données | [Coordonnées du DPD de l’établissement ou de l’administration de l’éducation] |
| Finalité | Activités d’enseignement et d’apprentissage : rédaction, correction, commentaire et remise de travaux ; travail en groupe |
| Base juridique | Art. 6.1.e RGPD (mission d’intérêt public), en lien avec la vingt-troisième disposition additionnelle de la loi organique espagnole 2/2006 sur l’éducation |
| Catégories de personnes concernées | Élèves, enseignants |
| Catégories de données | Nom ou pseudonyme ; contenu des travaux et commentaires ; corrections et évaluations ; historique des versions et paternité ; adresse IP de connexion. Aucune catégorie particulière de données ne doit être incluse |
| Destinataires | Autres participants au document ; opérateurs des relais et serveurs STUN/TURN (publics ou de l’établissement) ; serveur Nextcloud de l’établissement, le cas échéant. Aucune communication à des tiers n’est prévue |
| Transferts internationaux | Aucun si l’on utilise un relais, un TURN et un serveur web propres dans l’UE ; sinon, transferts possibles vers des relais publics et des serveurs STUN hors de l’EEE |
| Délai d’effacement | Celui fixé par l’établissement (par exemple, à la fin de l’année scolaire ou du délai de contestation des notes) ; les documents sont supprimés de chaque appareil |
| Mesures de sécurité | Chiffrement de bout en bout ; signature numérique des modifications ; liens avec autorisations (modifier, commenter, afficher) ; appareils avec comptes individuels ; mesures du Schéma national de sécurité espagnol (décret royal 311/2022) sur les serveurs propres |

## 5. Risques et mesures

| Risque | Mesures recommandées |
| --- | --- |
| Des tiers voient les adresses IP et les heures de connexion | Utiliser le relais et le serveur TURN de l’établissement ainsi que le paramètre `?relay=` dans les liens |
| Un lien parvient à des personnes non autorisées | Partager les liens par les canaux officiels (ENT) ; donner aux élèves des liens de lecture ou de commentaire lorsque cela suffit ; en cas de fuite, *Fichier → Faire une copie* et cesser d’utiliser l’original |
| Perte de travaux enregistrés uniquement dans le navigateur | Utiliser le Nextcloud de l’établissement, la fonction *Rendre* et des téléchargements réguliers ; installer l’application |
| Appareils partagés (salles informatiques, chariots d’ordinateurs portables) | Comptes ou profils de navigateur individuels ; retirer les documents et se déconnecter de Nextcloud à la fin |
| Exposition des données personnelles des élèves | Utiliser prénoms, initiales ou pseudonymes ; ne pas traiter de données de santé, de bilans psychologiques ou de besoins éducatifs particuliers dans des documents partagés, mais dans les systèmes officiels |
| Services facultatifs envoyant du contenu à des tiers | Laisser LanguageTool et les assistants d’IA désactivés, ou utiliser des serveurs de l’établissement ; évaluer la dictée du navigateur |
| Mineurs de moins de 14 ans et services de tiers | Ne pas activer de services exigeant leur consentement sans celui de leur famille (art. 7 LOPDGDD) |

Le DPD doit évaluer si une analyse d’impact relative à la protection des données est nécessaire (art. 35 RGPD et liste de l’Agence espagnole de protection des données), en particulier si des services de tiers sont activés ou si l’outil est utilisé de manière généralisée avec des mineurs.

## 6. Configuration recommandée

1. **Serveur propre.** Publier {{siteName}} sur un serveur de l’établissement ou de l’administration (idéalement à la même adresse que Nextcloud) et adapter les textes juridiques de cette installation (fichier `legal.config.json`).
2. **Relais de l’établissement.** Installer le relais de {{siteName}} (Nostr + STUN/TURN) sur le réseau de l’établissement et utiliser des liens avec `?relay=https://relay.etablissement.example`, pour ne pas dépendre de relais publics.
3. **Le Nextcloud de l’établissement** pour ouvrir, enregistrer et rendre les travaux.
4. **LanguageTool désactivé**, ou pointant vers un serveur de l’établissement ou de l’administration.
5. **Assistants d’IA (WebMCP) désactivés.** S’ils sont utilisés, uniquement avec des fournisseurs sous contrat avec l’administration, sans données personnelles des élèves et avec les précautions de la [Note sur l’intelligence artificielle](ai.md).
6. **Dictée.** Expliquer que, dans certains navigateurs, l’audio est traité par l’éditeur du navigateur ; ne l’utiliser qu’en cas de besoin.
7. **Registre et information.** Inscrire le traitement au registre des activités et informer les familles (section 7).
8. **Formation** des enseignants et des élèves à l’utilisation sûre des liens et aux compétences numériques (art. 83 LOPDGDD).

## 7. Modèle de texte d’information pour les familles

> **Information sur l’utilisation de l’application {{siteName}}**
>
> L’établissement [nom de l’établissement] utilise dans ses activités d’enseignement l’application {{siteName}}, qui permet aux élèves et aux enseignants de créer et de modifier des documents ensemble depuis le navigateur.
>
> **Responsable du traitement :** [établissement / administration], [adresse et e-mail]. **Délégué à la protection des données :** [contact].
>
> **Finalité et base juridique :** réalisation d’activités éducatives, dans l’exercice de la mission éducative (art. 6.1.e RGPD et vingt-troisième disposition additionnelle de la loi organique espagnole 2/2006 sur l’éducation).
>
> **Données :** nom ou pseudonyme de l’élève, travaux et commentaires, historique des modifications et adresse IP de connexion.
>
> **Lieu de stockage :** sur les appareils utilisés en classe et sur le Nextcloud de l’établissement, le cas échéant. L’application n’a pas de serveur central et son titulaire ne reçoit pas les documents. Pour connecter les appareils, on utilise [le serveur de l’établissement / des serveurs publics de tiers, qui connaissent l’adresse IP mais pas le contenu].
>
> **Destinataires :** les enseignants et les camarades avec qui chaque document est partagé. Aucune donnée n’est communiquée à des tiers.
>
> **Durée de conservation :** [jusqu’à la fin de l’année scolaire / délai fixé par l’établissement].
>
> **Droits :** vous pouvez exercer vos droits d’accès, de rectification, d’effacement, d’opposition et de limitation auprès de l’établissement ([e-mail]) et introduire une réclamation auprès de l’Agence espagnole de protection des données (www.aepd.es).
>
> **Utilisation à la maison :** les documents sont enregistrés dans le navigateur de l’appareil. Nous recommandons de ne pas utiliser le nom complet dans les documents partagés, de ne pas partager les liens en dehors du groupe et de ne pas activer de services externes (correcteur en ligne, assistants d’intelligence artificielle) sans supervision.

## 8. Textes de référence

- Règlement (UE) 2016/679, règlement général sur la protection des données (RGPD).
- Loi organique espagnole 3/2018 sur la protection des données personnelles et la garantie des droits numériques (LOPDGDD) : art. 7 (mineurs), 12.6, 31, 34, 83 (éducation numérique), 84 (protection des mineurs sur Internet) et 92.
- Loi organique espagnole 2/2006 sur l’éducation, modifiée par la loi organique 3/2020 (LOMLOE) : vingt-troisième disposition additionnelle.
- Décret royal 311/2022, Schéma national de sécurité.
- Décret royal 1112/2018 relatif à l’accessibilité des sites web et des applications mobiles du secteur public.
- Règlement (UE) 2024/1689 sur l’intelligence artificielle.
- Agence espagnole de protection des données : guides pour les établissements scolaires (https://www.aepd.es).
