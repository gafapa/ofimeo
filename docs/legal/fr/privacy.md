# Politique de confidentialité

{{siteName}} est conçu pour que son titulaire ne reçoive ni vos documents ni vos données : tout est enregistré sur votre appareil et échangé, chiffré, directement avec les personnes avec qui vous partagez. Cette politique explique quelles données existent, où elles se trouvent et qui peut les traiter, conformément aux articles 13 et 14 du règlement (UE) 2016/679 (RGPD) et à la loi organique espagnole 3/2018 (LOPDGDD).

## 1. Informations essentielles

| Rubrique | Information |
| --- | --- |
| Responsable du traitement | {{owner.name}} (coordonnées à la section 2) |
| Finalité | Mettre l’application web à disposition et protéger la sécurité du site. Le titulaire ne traite pas le contenu des documents. |
| Base juridique | Intérêt légitime à la sécurité du site ou, si le titulaire est une administration publique, exécution d’une mission d’intérêt public (art. 6.1.f ou 6.1.e RGPD). |
| Destinataires | Hébergeur ({{hosting.provider}}). La collaboration repose sur des services de tiers qui agissent sous leur propre responsabilité (section 6). |
| Transferts | Transferts possibles vers les États-Unis et d’autres pays (section 9). |
| Droits | Accès, rectification, effacement, opposition, limitation et portabilité, et réclamation auprès de l’Agence espagnole de protection des données (section 10). |
| Mineurs | Voir les sections 11 et 12 et les [Informations pour les établissements scolaires](schools.md). |

## 2. Responsable du traitement

- Titulaire : {{owner.name}}
- N° d’identification fiscale (NIF/CIF) : {{owner.nif}}
- Adresse : {{owner.address}}
- E-mail pour les questions de confidentialité : {{privacyEmail}}
- Délégué à la protection des données : {{#if dpo.email}}{{dpo.name}}, {{dpo.email}}{{else}}aucun n’a été désigné, cette désignation n’étant pas obligatoire pour le titulaire (art. 37 RGPD et art. 34 LOPDGDD) ; les demandes relatives à la protection des données sont traitées à l’adresse {{privacyEmail}}{{/if}}

Lorsqu’un établissement scolaire, une administration de l’éducation ou un autre organisme publie sa propre installation de {{siteName}}, cet organisme est le responsable du traitement pour son installation et doit adapter la présente politique avec ses propres coordonnées.

## 3. Fonctionnement de {{siteName}} et données reçues par le titulaire

{{siteName}} est un site web statique : le serveur livre uniquement les fichiers de l’application, qui fonctionne ensuite dans votre navigateur, même hors ligne. Il n’y a ni comptes utilisateurs ni serveur d’application propre.

- **Le titulaire ne reçoit pas** le contenu des documents, les commentaires, l’historique des versions, les noms saisis par les utilisateurs, les clés contenues dans les liens ni les identifiants de services externes.
- **Seules parviennent à un serveur choisi par le titulaire** les données techniques que tout navigateur envoie lors du téléchargement d’une page : adresse IP, date et heure, adresse demandée, navigateur et système d’exploitation (user agent) et page de provenance. L’hébergeur les enregistre pour servir le site et le protéger contre les abus.
- {{siteName}} n’utilise ni cookies, ni mesure d’audience, ni publicité, ni profilage, ni décision automatisée.

## 4. Données enregistrées sur votre appareil

L’application enregistre dans le stockage de votre navigateur (IndexedDB, localStorage et cache du service worker) les informations nécessaires à son fonctionnement. Ces informations ne sont pas envoyées au titulaire. Le détail figure dans la [Politique relative aux cookies et au stockage local](cookies.md).

| Information | Contenu | Qui peut la voir |
| --- | --- | --- |
| Documents | Texte, tableaux, dessins, images, commentaires, suggestions, historique des versions et paternité (nom et couleur de l’auteur de chaque partie) | Vous et les personnes avec qui vous partagez le document |
| Index des documents | Titres, dates, clés d’accès de chaque document et, si vous le liez, chemin du fichier dans Nextcloud | Vous seul |
| Votre identité dans l’application | Le nom que vous saisissez et une couleur | Vous et vos collaborateurs |
| Préférences | Langue, accessibilité, orthographe, dictionnaire personnel, zoom | Vous seul |
| Identifiants Nextcloud (facultatif) | Adresse du serveur, nom d’utilisateur et mot de passe d’application | Vous seul ; envoyés uniquement à ce serveur |
| Sauvegardes (facultatif) | Fichiers `.ofimeo-backup` que vous téléchargez, éventuellement chiffrés par mot de passe, ou enregistrés dans votre Nextcloud si vous activez la sauvegarde automatique | Toute personne disposant du fichier (et, s’il est chiffré, du mot de passe) |
| Cache de l’application | Fichiers du programme pour l’utiliser hors ligne | Aucune donnée personnelle |

Dans le cadre d’un usage personnel ou domestique, ce traitement est effectué par vous sur votre propre appareil. En milieu scolaire, il relève de l’établissement ou de l’administration de l’éducation (section 12).

## 5. Collaboration : ce que voient les autres personnes

- **Liens de partage.** Chaque lien contient, après le signe `#`, les clés du document. Les navigateurs n’envoient jamais cette partie du lien à un serveur, mais toute personne disposant du lien peut accéder au document avec l’autorisation qu’il confère (modifier, commenter, afficher ou faire une copie). Traitez-le comme un mot de passe.
- **Données reçues par vos collaborateurs :** le contenu du document, ses commentaires, versions et paternité, le nom et la couleur que vous avez choisis, votre présence (curseur, sélection, page ou diapositive consultée) et, du fait même des connexions directes, l’adresse IP de votre connexion.
- **Transmission.** Les données circulent directement entre navigateurs via WebRTC, chiffrées par DTLS ; les messages d’établissement de la connexion sont chiffrés avec la clé du document. Les modifications sont signées numériquement, de sorte que seules les personnes disposant de l’autorisation de modification peuvent modifier le document.
- **Copies.** Chaque participant conserve une copie complète du document dans son navigateur. Supprimer votre copie ne supprime pas celles des autres.
- Recommandation : utilisez votre prénom, vos initiales ou un pseudonyme et n’incluez pas de données particulièrement sensibles (santé, données de tiers, etc.) dans des documents partagés.

## 6. Tiers intervenants

| Service | Données consultées | Rôle | Localisation |
| --- | --- | --- | --- |
| Hébergement web : {{hosting.provider}} | Données techniques du téléchargement (IP, date, adresse, navigateur) | Sous-traitant du titulaire ou responsable de traitement indépendant, selon ses conditions : {{hosting.privacyUrl}} | {{hosting.country}} |
| Relais Nostr publics (signalisation) | Adresse IP, heure de connexion, messages de signalisation chiffrés, un identifiant de salle dérivé du document et des clés publiques éphémères. Ils ne peuvent pas lire les documents | Tiers indépendants, sans relation contractuelle avec le titulaire | Divers pays, dans et hors de l’Espace économique européen |
| Serveurs STUN (par défaut, Google LLC et Cloudflare, Inc.) | Adresse IP et port, pour déterminer l’adresse publique de votre connexion | Tiers indépendants | États-Unis et autres pays |
| Navigateurs de vos collaborateurs | Ce qui est indiqué à la section 5, y compris votre adresse IP | Utilisateurs | Où qu’ils se trouvent |
| Relais et serveur TURN de l’établissement (facultatif) | Adresse IP, heure de connexion, trafic chiffré | L’établissement ou l’administration qui le gère, en tant que responsable | Selon son installation |
| Nextcloud (facultatif) | Les fichiers que vous ouvrez ou enregistrez et vos identifiants | L’organisme qui gère ce serveur | Selon le serveur |
| Serveur LanguageTool (facultatif, désactivé par défaut) | Le texte des paragraphes vérifiés | L’organisme qui gère le serveur que vous indiquez | Selon le serveur |
| Dictée et lecture à voix haute du navigateur | Selon le navigateur, l’audio de la dictée ou le texte lu peuvent être envoyés à l’éditeur du navigateur | L’éditeur du navigateur, selon ses conditions | Selon l’éditeur |
| Assistants d’IA via WebMCP (facultatif, désactivé par défaut) | Le contenu du document ouvert que l’assistant lit ou modifie | Le fournisseur de l’assistant que vous choisissez, selon ses conditions. Voir la [Note sur l’intelligence artificielle](ai.md) | Selon le fournisseur |

Les relais publics et les serveurs STUN sont utilisés parce que {{siteName}} n’a pas de serveur propre. Ils peuvent être remplacés par vos propres serveurs en ajoutant `?relays=wss://…` à l’adresse, ou en utilisant le relais de l’établissement.

## 7. Finalités et bases juridiques

| Traitement | Finalité | Base juridique |
| --- | --- | --- |
| Journaux techniques de l’hébergement | Livrer l’application et protéger le site contre les attaques et les abus | Intérêt légitime du titulaire (art. 6.1.f RGPD ; considérant 49) ou, pour une administration publique, mission d’intérêt public (art. 6.1.e) |
| Stockage sur votre appareil | Faire fonctionner l’application et conserver vos documents et préférences | Effectué par vous ; en milieu scolaire, décidé par l’établissement (section 12) |
| Collaboration avec d’autres personnes | Modifier des documents ensemble | Votre décision de partager le lien et, en milieu scolaire, la mission éducative (section 12) |
| Services facultatifs (Nextcloud, LanguageTool, assistants d’IA) | Ceux que vous activez | Votre décision de les activer ; le traitement est effectué par le fournisseur du service sous sa propre responsabilité |

## 8. Durée de conservation

- Journaux techniques de l’hébergement : pendant la durée fixée par l’hébergeur à des fins de sécurité, conformément à sa politique de confidentialité.
- Données sur votre appareil : jusqu’à ce que vous les supprimiez (depuis l’écran d’accueil ou en effaçant les données du site dans le navigateur). L’historique des versions et la paternité font partie de chaque document et sont conservés tant que le document est conservé dans un navigateur.
- Relais et serveurs STUN/TURN : selon la configuration de chaque opérateur. Les messages de signalisation ne sont utilisés que momentanément.

## 9. Destinataires et transferts internationaux

Le titulaire ne cède ni ne vend aucune donnée. L’hébergeur peut traiter les données techniques aux {{hosting.country}} ; le transfert repose sur {{hosting.transfers}} ou sur les garanties prévues par ses conditions.

Les relais publics et les serveurs STUN peuvent se trouver hors de l’Espace économique européen. Votre navigateur s’y connecte directement pour trouver vos collaborateurs ; le titulaire n’a aucune relation contractuelle avec leurs opérateurs. Pour éviter ces connexions, utilisez vos propres relais et serveur TURN, situés dans l’Union européenne (recommandé pour les établissements scolaires).

## 10. Vos droits

Vous pouvez exercer vos droits d’accès, de rectification, d’effacement, d’opposition, de limitation du traitement et de portabilité (art. 15 à 22 RGPD) en écrivant à {{privacyEmail}}, en précisant le droit exercé et en justifiant de votre identité. Nous répondrons dans un délai d’un mois (art. 12.3 RGPD).

Notez que le titulaire ne détient ni vos documents ni les données enregistrées dans votre navigateur : vous pouvez les consulter, les télécharger, les corriger ou les supprimer directement dans l’application. Pour les données d’autres services (hébergement, relais, Nextcloud, LanguageTool, assistants d’IA), vous pouvez également vous adresser à leurs responsables.

Si vous estimez que vos droits n’ont pas été respectés, vous pouvez introduire une réclamation auprès de l’Agence espagnole de protection des données (Agencia Española de Protección de Datos, C/ Jorge Juan, 6, 28001 Madrid, https://www.aepd.es). {{#if dpo.email}}Au préalable, si vous le souhaitez, vous pouvez contacter le délégué à la protection des données ({{dpo.email}}).{{/if}}

## 11. Mineurs

{{siteName}} est utilisé principalement dans les établissements scolaires et par des mineurs. C’est pourquoi :

- L’application ne demande ni inscription ni données personnelles, et le titulaire ne collecte aucune donnée sur les utilisateurs au-delà des journaux techniques de l’hébergement.
- Les droits des mineurs de moins de 14 ans peuvent être exercés par leurs parents ou tuteurs légaux (art. 12.6 LOPDGDD). Lorsqu’un service facultatif de tiers requiert un consentement, les mineurs de moins de 14 ans ont besoin de celui de leurs parents ou tuteurs (art. 7 LOPDGDD et art. 8 RGPD).
- Nous recommandons que les mineurs n’utilisent les services facultatifs (LanguageTool, assistants d’IA, dictée) que sous la supervision des enseignants ou de leur famille et conformément aux décisions de leur établissement.
- Aucune image ni donnée personnelle d’autres personnes ne doit être publiée dans des documents partagés sans leur autorisation ou celle de leurs représentants (art. 92 LOPDGDD).

## 12. Utilisation dans les établissements scolaires

Lorsque des enseignants ou un établissement utilisent {{siteName}} dans leur activité pédagogique, le responsable des données des élèves traitées dans ce cadre est l’établissement ou l’administration de l’éducation dont il dépend, dans l’exercice de la mission éducative (vingt-troisième disposition additionnelle de la loi organique espagnole 2/2006 sur l’éducation et art. 6.1.e RGPD). Le titulaire de ce site n’a pas accès à ces données et n’agit donc pas en tant que sous-traitant à l’égard du contenu des documents.

Nous recommandons aux établissements d’inscrire cette activité dans leur registre des activités de traitement (art. 30 RGPD et art. 31 LOPDGDD), d’informer les familles et d’appliquer la configuration recommandée. Les établissements qui publient leur propre installation en sont responsables. Les [Informations pour les établissements scolaires](schools.md) comprennent un modèle de fiche de registre et un texte pour les familles.

## 13. Sécurité

- **Chiffrement de bout en bout** de la collaboration : les messages de connexion sont chiffrés avec la clé du document, qui ne figure que dans le lien, et les données circulent par des canaux WebRTC chiffrés (DTLS).
- **Signatures numériques (Ed25519)** : les modifications du document et des commentaires sont signées et les autres navigateurs rejettent celles qui ne portent pas de signature valide ; un lien de lecture ou de commentaire ne permet donc pas de modifier.
- **Aucune copie centrale** : il n’existe pas de serveur contenant les documents de tous les utilisateurs susceptible de subir une violation.
- L’application est servie en HTTPS et ses mises à jour proviennent du même site en HTTPS.
- La sécurité de votre appareil dépend de vous : verrouillez-le, ne partagez pas votre profil de navigateur et, sur les ordinateurs partagés, supprimez vos documents et déconnectez-vous de Nextcloud à la fin.
- Pour signaler une vulnérabilité, consultez le fichier `/.well-known/security.txt` de ce site.

## 14. Modifications de cette politique

Nous pouvons mettre à jour cette politique pour tenir compte de l’évolution de l’application ou de la réglementation. La version en vigueur est celle publiée sur cette page, avec sa date de mise à jour. Si une modification affecte de manière significative le traitement des données, nous le signalerons dans l’application.
