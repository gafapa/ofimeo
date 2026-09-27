# Privacy policy

{{siteName}} is designed so that its owner does not receive your documents or your data: everything is stored on your device and exchanged, encrypted, directly with the people you share with. This policy explains what data exist, where they are and who may process them, in accordance with Articles 13 and 14 of Regulation (EU) 2016/679 (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD).

## 1. Key information

| Heading | Information |
| --- | --- |
| Controller | {{owner.name}} (details in section 2) |
| Purpose | Making the web application available and protecting the security of the site. The owner does not process the content of documents. |
| Legal basis | Legitimate interest in the security of the site or, if the owner is a public administration, performance of a task carried out in the public interest (Art. 6(1)(f) or 6(1)(e) GDPR). |
| Recipients | Hosting provider ({{hosting.provider}}). Collaboration relies on third-party services acting under their own responsibility (section 6). |
| Transfers | Possible transfers to the United States and other countries (section 9). |
| Rights | Access, rectification, erasure, objection, restriction and portability, and the right to lodge a complaint with the Spanish Data Protection Agency (section 10). |
| Minors | See sections 11 and 12 and the [Information for schools](schools.md). |

## 2. Controller

- Owner: {{owner.name}}
- Tax ID (NIF/CIF): {{owner.nif}}
- Address: {{owner.address}}
- Email for privacy matters: {{privacyEmail}}
- Data Protection Officer: {{#if dpo.email}}{{dpo.name}}, {{dpo.email}}{{else}}none has been appointed, as it is not mandatory for the owner (Art. 37 GDPR and Art. 34 LOPDGDD); data protection enquiries are handled at {{privacyEmail}}{{/if}}

When a school, an education authority or another organisation publishes its own installation of {{siteName}}, that organisation is the controller for its installation and must adapt this policy with its own details.

## 3. How {{siteName}} works and what data the owner receives

{{siteName}} is a static website: the server only delivers the application files, which then run in your browser, even offline. There are no user accounts and no application server of its own.

- **The owner does not receive** the content of documents, comments, version history, the names users type, the keys in links or the credentials of external services.
- **The only thing that reaches a server engaged by the owner** is the technical data any browser sends when downloading a page: IP address, date and time, requested address, browser and operating system (user agent) and referring page. The hosting provider logs them to serve the site and protect it against abuse.
- {{siteName}} does not use cookies, analytics, advertising, profiling or automated decision-making.

## 4. Data stored on your device

The application stores the information it needs to work in your browser's storage (IndexedDB, localStorage and the service worker cache). This information is not sent to the owner. Details are given in the [Cookies and local storage policy](cookies.md).

| Information | Content | Who can see it |
| --- | --- | --- |
| Documents | Text, tables, drawings, images, comments, suggestions, version history and authorship (name and colour of whoever wrote each part) | You and the people you share the document with |
| Document index | Titles, dates, access keys of each document and, if you link it, the path of the file in Nextcloud | Only you |
| Your identity in the application | The name you type and a colour | You and your collaborators |
| Preferences | Language, accessibility, spelling, personal dictionary, zoom | Only you |
| Nextcloud credentials (optional) | Server address, user name and app password | Only you; sent only to that server |
| Backups (optional) | `.ofimeo-backup` files you download, optionally encrypted with a password, or saved to your Nextcloud if you turn on automatic backup | Whoever has the file (and, if encrypted, the password) |
| Application cache | Program files for offline use | Contains no personal data |

In personal or household use, this processing is carried out by you on your own device. In school use, it is the responsibility of the school or education authority (section 12).

## 5. Collaboration: what other people see

- **Sharing links.** Each link contains the document's keys after the `#` sign. Browsers never send that part of the link to any server, but anyone who has the link can access the document with the permission it grants (edit, comment, view or make a copy). Treat it like a password.
- **Data your collaborators receive:** the content of the document, its comments, versions and authorship, the name and colour you chose, your presence (cursor, selection, page or slide you are viewing) and, by the very nature of direct connections, the IP address of your connection.
- **Transmission.** Data travel directly between browsers over WebRTC, encrypted with DTLS; the messages used to set up the connection are encrypted with the document key. Changes are digitally signed, so only people with edit permission can modify the document.
- **Copies.** Each participant keeps a full copy of the document in their browser. Deleting your copy does not delete the others'.
- Recommendation: use your first name, initials or a pseudonym and do not include particularly sensitive data (health, third-party data, etc.) in shared documents.

## 6. Third parties involved

| Service | Data accessed | Role | Location |
| --- | --- | --- | --- |
| Web hosting: {{hosting.provider}} | Technical download data (IP, date, address, browser) | Processor for the owner or independent controller, according to its terms: {{hosting.privacyUrl}} | {{hosting.country}} |
| Public Nostr relays (signalling) | IP address, connection time, encrypted signalling messages, a room identifier derived from the document and ephemeral public keys. They cannot read documents | Independent third parties with no contractual relationship with the owner | Various countries, inside and outside the European Economic Area |
| STUN servers (by default, Google LLC and Cloudflare, Inc.) | IP address and port, to find out the public address of your connection | Independent third parties | United States and other countries |
| Your collaborators' browsers | As described in section 5, including your IP address | Users | Wherever they are |
| School relay and TURN server (optional) | IP address, connection time, encrypted traffic | The school or authority operating it, as controller | Depending on its installation |
| Nextcloud (optional) | The files you open or save and your credentials | The organisation operating that server | Depending on the server |
| LanguageTool server (optional, off by default) | The text of the paragraphs being checked | The organisation operating the server you specify | Depending on the server |
| Browser dictation and read aloud | Depending on the browser, dictation audio or the text read may be sent to the browser maker | The browser maker, according to its terms | Depending on the maker |
| AI assistants via WebMCP (optional, off by default) | The content of the open document that the assistant reads or modifies | The provider of the assistant you choose, according to its terms. See the [Note on artificial intelligence](ai.md) | Depending on the provider |

Public relays and STUN servers are used because {{siteName}} has no server of its own. They can be replaced with your own servers by adding `?relays=wss://…` to the address, or by using the school relay.

## 7. Purposes and legal bases

| Processing | Purpose | Legal basis |
| --- | --- | --- |
| Hosting technical logs | Delivering the application and protecting the site against attacks and abuse | Legitimate interest of the owner (Art. 6(1)(f) GDPR; Recital 49) or, for a public administration, a task carried out in the public interest (Art. 6(1)(e)) |
| Storage on your device | Making the application work and keeping your documents and preferences | Carried out by you; in schools, decided by the school (section 12) |
| Collaboration with others | Editing documents together | Your decision to share the link and, in schools, the educational function (section 12) |
| Optional services (Nextcloud, LanguageTool, AI assistants) | Those you enable | Your decision to enable them; the processing is carried out by the service provider under its own responsibility |

## 8. Retention

- Hosting technical logs: for the period set by the provider for security purposes, according to its privacy policy.
- Data on your device: until you delete them (from the home screen or by clearing the site's data in your browser). Version history and authorship are part of each document and are kept for as long as the document is kept in any browser.
- Relays and STUN/TURN servers: according to each operator's configuration. Signalling messages are used only momentarily.

## 9. Recipients and international transfers

The owner does not disclose or sell data. The hosting provider may process technical data in {{hosting.country}}; the transfer is based on {{hosting.transfers}} or on the safeguards set out in its terms.

Public relays and STUN servers may be outside the European Economic Area. Your browser connects to them directly to find your collaborators; the owner has no contractual relationship with their operators. To avoid these connections, use your own relay and TURN server located in the European Union (recommended for schools).

## 10. Your rights

You can exercise your rights of access, rectification, erasure, objection, restriction of processing and portability (Arts. 15 to 22 GDPR) by writing to {{privacyEmail}}, stating which right you are exercising and proving your identity. We will reply within one month (Art. 12(3) GDPR).

Please note that the owner does not hold your documents or the data stored in your browser: you can view, download, correct or delete them directly in the application. For the data of other services (hosting, relays, Nextcloud, LanguageTool, AI assistants) you can also contact their controllers.

If you consider that your rights have not been respected, you can lodge a complaint with the Spanish Data Protection Agency (Agencia Española de Protección de Datos, C/ Jorge Juan, 6, 28001 Madrid, https://www.aepd.es). {{#if dpo.email}}Beforehand, if you wish, you can contact the Data Protection Officer ({{dpo.email}}).{{/if}}

## 11. Minors

{{siteName}} is used mainly in schools and by minors. Therefore:

- The application does not ask for registration or personal data, and the owner collects no data about users beyond the hosting technical logs.
- The rights of children under 14 can be exercised by their parents or legal guardians (Art. 12(6) LOPDGDD). Where an optional third-party service requires consent, children under 14 need the consent of their parents or guardians (Art. 7 LOPDGDD and Art. 8 GDPR).
- We recommend that minors use optional services (LanguageTool, AI assistants, dictation) only under the supervision of teachers or their family and as decided by their school.
- Images or personal data of other people must not be published in shared documents without their permission or that of their representatives (Art. 92 LOPDGDD).

## 12. Use in schools

When teachers or a school use {{siteName}} in their teaching, the controller of the pupils' data processed in that activity is the school or the education authority it depends on, in the exercise of the educational function (twenty-third additional provision of Spanish Organic Law 2/2006 on Education, and Art. 6(1)(e) GDPR). The owner of this site has no access to those data and therefore does not act as a processor with regard to the content of documents.

We recommend that schools include this activity in their record of processing activities (Art. 30 GDPR and Art. 31 LOPDGDD), inform families and apply the recommended configuration. Schools that publish their own installation are responsible for it. The [Information for schools](schools.md) includes a model record entry and a text for families.

## 13. Security

- **End-to-end encryption** of collaboration: connection messages are encrypted with the document key, which is only in the link, and data travel over encrypted WebRTC channels (DTLS).
- **Digital signatures (Ed25519)**: changes to the document and comments are signed, and other browsers reject those without a valid signature, so a view or comment link does not allow editing.
- **No central copy**: there is no server holding all users' documents that could suffer a breach.
- The application is served over HTTPS and its updates come from the same site over HTTPS.
- The security of your device is up to you: lock your device, do not share your browser profile and, on shared computers, remove your documents and sign out of Nextcloud when you finish.
- To report a vulnerability, see this site's `/.well-known/security.txt` file.

## 14. Changes to this policy

We may update this policy to reflect changes in the application or in the law. The version in force is the one published on this page, with its update date. If a change significantly affects the processing of data, we will point it out in the application.
