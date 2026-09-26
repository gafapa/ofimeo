# Cookies and local storage policy

{{siteName}} does not use cookies or any tracking, analytics or advertising technology. It only stores in your browser the information strictly necessary for the application to work, and that information is not sent to the owner.

## 1. What cookies and local storage are

Cookies and other storage technologies (localStorage, IndexedDB, Cache Storage) allow a website to store information on the user's device. Article 22(2) of Spanish Law 34/2002 (LSSI-CE) requires information and consent to use them, except where they are strictly necessary to provide a service explicitly requested by the user.

## 2. What storage {{siteName}} uses

All storage is first-party (there is no third-party storage), is kept only in your browser and lasts until you delete it.

| Category | Technical name | Purpose |
| --- | --- | --- |
| Documents | IndexedDB `words-online:<id>` and `words-online:<id>:comments` | Content of each document, comments, version history and authorship |
| Signed change log | IndexedDB `words-online-kv` | Allows passing on to other participants the changes of documents opened with view or comment links |
| Document index | localStorage `words-online:docs` | List of your documents: title, date, access keys and linked Nextcloud file |
| Local organisation | localStorage `words-online:library`; IndexedDB `words-online-library` | Folders and tags of your documents, index for searching their text and your own templates |
| Backups | localStorage `words-online:backup` | Date of the last backup, reminder and automatic backup to Nextcloud, if you enable it |
| School relay | localStorage `words-online:school-relay` | Address of the school relay and the connection settings it provides |
| Identity | localStorage `words-online:user`, `words-online:writer-user-id` | Name and colour your collaborators see; technical identifier for authorship |
| Preferences | localStorage `words-online:language`, `words-online:a11y`, `words-online:spelling`, `words-online:spelling-dictionary:<language>`, `words-online:zoom`, `words-online:home-view`, `wo-template-lang`, `diagram-libraries` | Language, accessibility, spelling and personal dictionary, zoom, template language and chosen shape libraries |
| AI assistants (only if you turn it on) | localStorage `words-online:webmcp` | That you allowed AI assistants to use the documents open in this browser (WebMCP; off by default). See the [Note on artificial intelligence](ai.md) |
| Nextcloud (only if you set it up) | localStorage `words-online:nextcloud`, `words-online:nextcloud-server`, `words-online:nextcloud-folder`, `words-online:nextcloud-format`, `words-online:nextcloud-share` | Server, user name and app password, last folder and format used |
| Offline use | Service worker and Cache Storage `workbox-precache-*`, `excalidraw-fonts`, `spelling`, `diagram-libs-*` | Application files, fonts, dictionaries and shapes for offline use |

Technical names may change between versions; categories and purposes remain the same. The `words-online` keys come from the project's technical name.

## 3. Why there is no cookie banner

All of this storage is strictly necessary to provide the service you request (editing, saving and sharing your documents, remembering your preferences and using the application offline) and is exempt from consent under Article 22(2) LSSI-CE and the Spanish Data Protection Agency's Guide on the use of cookies. It is not used for analytics, advertising or profiling, and is not shared with the owner or with third parties.

The hosting server does not set cookies on this site. If any non-exempt storage were added in the future, your consent would be requested before using it.

## 4. How to view and delete the storage

- **One document:** on the home screen, open the document's ⋮ menu and choose *Remove from this browser*. It is deleted from this browser; your collaborators' copies are not affected.
- **Nextcloud credentials:** in the Nextcloud account, *Sign out*.
- **Everything:** in your browser settings, clear the site's data (in Chrome and Edge, *Settings → Privacy and security → Cookies and site data*; in Firefox, *Settings → Privacy & Security → Cookies and Site Data*; in Safari, *Settings → Privacy → Manage Website Data*).

Warning: clearing the site's data irreversibly deletes your documents from this device. Download them or save them to Nextcloud first.

In private or incognito browsing, the browser deletes all this storage when the window is closed.

## 5. More information

See the [Privacy policy](privacy.md) to find out what data exist and who may process them.
