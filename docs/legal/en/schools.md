# Information for schools

A guide for school leadership teams, ICT coordinators and data protection officers (DPOs) of schools and education authorities that want to use {{siteName}}: what data are processed, where they are, who is responsible, what the risks are and how to configure it. It includes a model entry for the record of processing activities and an information text for families.

## 1. Summary for school leaders

- {{siteName}} is a static web application: it has no accounts, no application server and no central database. The owner of the site does not receive documents or pupils' data.
- Documents are stored in the browser of each device and synchronised directly between the browsers of the people collaborating, with end-to-end encryption.
- To let browsers find each other, public Nostr relays and third-party STUN servers are used by default; they see IP addresses and encrypted connection messages, but not the content. The school can replace them with its own relay.
- Features that send data to third parties (LanguageTool, AI assistants via WebMCP) are off by default. Dictation depends on the browser.
- In teaching, the controller is the school or education authority (twenty-third additional provision of Spanish Organic Law 2/2006 on Education, and Art. 6(1)(e) GDPR).

## 2. Data flows

```text
 Pupil's browser ◄── encrypted WebRTC (DTLS), direct ──► Teacher's browser
        │                                                     │
        ├── Encrypted signalling ──► Nostr relays (public or the school's)
        ├── IP address lookup ──► STUN/TURN servers (public or the school's)
        ├── Application download ──► web server (GitHub Pages or the school's)
        └── Optional: school Nextcloud · LanguageTool · AI assistant
```

| Data | Where it is stored | Who has access | Notes |
| --- | --- | --- | --- |
| Document content, comments, versions and authorship | Each participant's browser (IndexedDB) | Participants with the link | Never passes through any server of the owner |
| Name or pseudonym and colour | Browser; sent to collaborators | Participants | First names, initials or pseudonyms recommended |
| IP address | Not stored by the application | Other participants, relays, STUN/TURN servers, web server | Inherent to direct connections |
| Access keys | In links (after `#`) and in the browser | Whoever has the link | Links are equivalent to passwords |
| Nextcloud credentials | Browser (localStorage) | Only the browser and the Nextcloud server | Use app passwords, never the main password |
| Text checked by LanguageTool | The configured LanguageTool server | Server operator | Off by default |
| Content read by an AI assistant | The assistant's provider | Provider | Off by default |

## 3. Role of each party

| Party | Data protection role |
| --- | --- |
| School or education authority | Controller of pupils' and teachers' data in teaching. Decides on use, configuration and rules. |
| Teachers | Act on behalf of the school, following its instructions. |
| Owner of this site ({{owner.name}}) | Makes the program available. Has no access to the content of documents, so it is not a processor with regard to them. Only responsible for the web hosting technical logs. |
| School that publishes its own installation | Also responsible for the web server, its logs and the legal texts of its installation. |
| Operator of the school relay and TURN | The school or authority, as controller (or its supplier, as processor). |
| Public relays and STUN servers | Independent third parties, with no contract with the owner or the school. Replacing them is recommended. |
| Nextcloud, LanguageTool, AI assistants | The organisation providing each service, according to the contract or terms the school has with it. |

## 4. Model entry for the record of processing activities

An indicative model for the record required by Article 30 GDPR and Article 31 LOPDGDD. It must be adapted by the DPO of the school or education authority.

| Field | Proposed content |
| --- | --- |
| Processing activity | Collaborative creation and editing of teaching documents with {{siteName}} |
| Controller | [School / regional ministry or responsible body], with contact details |
| Data Protection Officer | [Details of the DPO of the school or education authority] |
| Purpose | Teaching and learning activities: writing, correcting, commenting and handing in work; group work |
| Legal basis | Art. 6(1)(e) GDPR (task in the public interest) in conjunction with the twenty-third additional provision of Spanish Organic Law 2/2006 on Education |
| Categories of data subjects | Pupils, teachers |
| Categories of data | Name or pseudonym; content of work and comments; corrections and assessments; version history and authorship; connection IP address. Special categories of data must not be included |
| Recipients | Other participants in the document; operators of relays and STUN/TURN servers (public or the school's); the school's Nextcloud server, if used. No disclosures are planned |
| International transfers | None if the school's own relay, TURN and web server in the EU are used; otherwise, possible transfers to public relays and STUN servers outside the EEA |
| Erasure period | As set by the school (for example, at the end of the school year or of the period for appealing marks); documents are deleted from each device |
| Security measures | End-to-end encryption; digital signature of changes; links with permissions (edit, comment, view); devices with individual accounts; Spanish National Security Framework measures (Royal Decree 311/2022) on the school's own servers |

## 5. Risks and measures

| Risk | Recommended measures |
| --- | --- |
| Third parties see IP addresses and connection times | Use the school relay and TURN server and the `?relay=` parameter in links |
| A link reaches unauthorised people | Share links through official channels (virtual classroom); give pupils view or comment links when sufficient; if one leaks, *File → Make a copy* and stop using the original |
| Loss of work stored only in the browser | Use the school's Nextcloud, the *Hand in* feature and regular downloads; install the application |
| Shared devices (computer rooms, laptop trolleys) | Individual accounts or browser profiles; remove documents and sign out of Nextcloud when finished |
| Exposure of pupils' personal data | Use first names, initials or pseudonyms; do not process health data, psychological or special educational needs reports in shared documents, but in the official systems |
| Optional services that send content to third parties | Keep LanguageTool and AI assistants off, or use the school's servers; assess the browser's dictation |
| Children under 14 and third-party services | Do not enable services requiring their consent without their families' consent (Art. 7 LOPDGDD) |

The DPO should assess whether a data protection impact assessment is needed (Art. 35 GDPR and the Spanish Data Protection Agency's list), especially if third-party services are enabled or the tool is used widely with minors.

## 6. Recommended configuration

1. **Own server.** Publish {{siteName}} on a server of the school or regional ministry (ideally at the same address as Nextcloud) and adapt the legal texts of that installation (`legal.config.json` file).
2. **School relay.** Install the {{siteName}} relay (Nostr + STUN/TURN) on the school network and use links with `?relay=https://relay.school.example`, so as not to depend on public relays.
3. **The school's Nextcloud** to open, save and hand in work.
4. **LanguageTool off**, or pointing to a server of the school or authority.
5. **AI assistants (WebMCP) off.** If used, only with providers contracted by the authority, without pupils' personal data and with the precautions in the [Note on artificial intelligence](ai.md).
6. **Dictation.** Explain that, in some browsers, the audio is processed by the browser maker; use it only when necessary.
7. **Record and information.** Include the processing in the record of processing activities and inform families (section 7).
8. **Training** for teachers and pupils on the safe use of links and digital competence (Art. 83 LOPDGDD).

## 7. Model information text for families

> **Information about the use of the {{siteName}} application**
>
> [School name] uses the {{siteName}} application in its teaching activities; it allows pupils and teachers to create and edit documents together from the browser.
>
> **Controller:** [school / regional ministry], [address and email]. **Data Protection Officer:** [contact].
>
> **Purpose and legal basis:** carrying out educational activities, in the exercise of the educational function (Art. 6(1)(e) GDPR and twenty-third additional provision of Spanish Organic Law 2/2006 on Education).
>
> **Data:** the pupil's name or pseudonym, work and comments, change history and connection IP address.
>
> **Where they are stored:** on the devices used in class and on the school's Nextcloud, if used. The application has no central server and its owner does not receive the documents. To connect devices, [the school's server / public third-party servers, which know the IP address but not the content] are used.
>
> **Recipients:** the teachers and classmates each document is shared with. No data are disclosed to third parties.
>
> **Retention:** [until the end of the school year / period set by the school].
>
> **Rights:** you can exercise your rights of access, rectification, erasure, objection and restriction with the school ([email]) and lodge a complaint with the Spanish Data Protection Agency (www.aepd.es).
>
> **Use at home:** documents are stored in the device's browser. We recommend not using full names in shared documents, not sharing links outside the group and not enabling external services (online spell checker, artificial intelligence assistants) without supervision.

## 8. Reference legislation

- Regulation (EU) 2016/679, General Data Protection Regulation (GDPR).
- Spanish Organic Law 3/2018 on the Protection of Personal Data and guarantee of digital rights (LOPDGDD): Arts. 7 (minors), 12(6), 31, 34, 83 (digital education), 84 (protection of minors on the Internet) and 92.
- Spanish Organic Law 2/2006 on Education, as amended by Organic Law 3/2020 (LOMLOE): twenty-third additional provision.
- Royal Decree 311/2022, National Security Framework.
- Royal Decree 1112/2018 on the accessibility of public sector websites and mobile applications.
- Regulation (EU) 2024/1689, Artificial Intelligence Act.
- Spanish Data Protection Agency: guides for schools (https://www.aepd.es).
