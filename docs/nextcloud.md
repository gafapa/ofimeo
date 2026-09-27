# Nextcloud

Ofimeo can open documents from a Nextcloud server and save them back,
and students can hand in their work to a teacher's Nextcloud upload link.
There is no Ofimeo server in between: the browser talks directly to
Nextcloud (WebDAV and a few OCS / login endpoints).

## For users

- **Connect**: home screen → **Nextcloud**, or *File → Nextcloud account…* in
  any app. Enter the address you open Nextcloud with (e.g.
  `https://cloud.school.org`), then either
  - **Log in with Nextcloud** (Login Flow v2): a Nextcloud tab opens, you log
    in and grant access, and Ofimeo receives an app password; or
  - **use an app password**: in Nextcloud, *your picture → Personal settings →
    Security → Devices & sessions*, type a name ("Ofimeo") and click
    *Create new app password*; copy the user name and the app password into the
    form. Never use your main password.
- **Open**: home screen → *Open from Nextcloud…* or *File → Open from
  Nextcloud…*. The file browser has breadcrumbs, search within the folder and
  sorting by name, size or date. Supported: `.docx .odt .html .txt .md .xlsx
  .ods .csv .excalidraw .drawio .xml .pptx`. The file is imported into a new
  document in this browser that stays **linked** to the file.
- **Save**: *File → Save to Nextcloud* (Ctrl+S) writes the linked file in its
  format; *File → Save to Nextcloud as…* picks a folder (and can create one),
  a name and a format (Document: .docx .odt .html .txt; Spreadsheet: .xlsx
  .ods .csv; Drawing: .excalidraw .png .svg; Diagram: .drawio .svg .png;
  Presentation: .pptx .odp). Files opened in a format the app cannot write
  (e.g. `.md`) ask where to save.
- The app bar shows *Saved to Nextcloud at hh:mm*, *Changes not saved to
  Nextcloud*, a conflict, or *Offline*. Click it for Save, Save as, *Show in
  Nextcloud* and *Stop saving to this file*.
- **Conflicts**: every save sends the ETag of the version you opened or last
  saved (`If-Match`). If someone changed the file in Nextcloud meanwhile, you
  choose **Overwrite**, **Save as a copy** or **Cancel** (Nextcloud keeps
  older versions in its own version history).
- **Autosave** (off by default): in the Nextcloud dialog, save linked
  documents every 2, 5, 10 or 15 minutes while they have unsaved changes.
  An automatic save never overwrites a changed file; it waits for you.
- Collaboration stays peer to peer: the link to the Nextcloud file lives only
  in the browser of the person who opened or saved it, and only that person
  saves to it.
- **Hand in to a share link**: after *Hand in* downloads the ZIP, *Upload to a
  Nextcloud share link…* sends the same ZIP to a link the teacher shared
  (`https://host/s/TOKEN`), with the share password if it has one. Students
  need no account. Existing names are never overwritten.
- **Offline**: Nextcloud actions are disabled and explain why; documents are
  still saved in the browser, and you can save to Nextcloud when back online.

### For teachers: collecting work with a "File drop" link

In Nextcloud, create a folder (e.g. *Hand-ins 3B*), share it → *Share link* →
*File drop (upload only)* (optionally with a password and an expiry date), and
give the link to the students. They paste it in *Hand in → Upload to a
Nextcloud share link…*. Students cannot see each other's files.

### Sync without being online together

Nextcloud can also carry **encrypted changes** between people who are never
online at the same time (connection test → *Sync without being online
together* → *In a Nextcloud folder*). Ofimeo keeps small encrypted files in a
folder (default `/Ofimeo/Sync`, one subfolder per document); use a folder
shared with the people you work with. Nextcloud only sees encrypted data. See
[store-forward.md](store-forward.md).

## For administrators: allowing the browser to connect (CORS)

Browsers only let a page talk to another site when that site allows it
(CORS). Nextcloud does not allow other sites by default, so unless Words
Online is served from the same address as Nextcloud, connecting fails and the
connection test shows *"Your Nextcloud does not allow this site to connect to
it (CORS)"* with these options. (The test tells this apart from a wrong
address, a server that cannot be reached, a page on https talking to plain
http, maintenance mode and wrong credentials: `status.php` answers every
origin, so when it works but WebDAV does not, CORS is the cause.)

What Ofimeo calls:

| Endpoint | Used for |
| --- | --- |
| `GET /status.php` | connection test (already open to every origin) |
| `PROPFIND/GET/PUT/MKCOL /remote.php/dav/files/<user>/…` and `PROPFIND /remote.php/dav/` | browsing, opening, saving (`If-Match` / `If-None-Match`), folders, user id |
| `POST /index.php/login/v2`, `POST /index.php/login/v2/poll` | Login Flow v2 |
| `DELETE /ocs/v2.php/core/apppassword` (`OCS-APIRequest: true`) | revoking the app password on sign out |
| `PUT /public.php/dav/files/<token>/<name>` (Nextcloud 29+), `PUT /public.php/webdav/<name>` (older) | hand in to a share link |

Requests carry `Authorization: Basic` (app password) and never cookies
(`credentials: 'omit'`), so `Access-Control-Allow-Credentials` is not needed
and must not be set to `true` with a wildcard.

### A. Serve Ofimeo from the Nextcloud address (recommended)

Build Ofimeo (`npm run build`) and copy `dist/` into a folder served by
the same web server and host name as Nextcloud, e.g.
`https://cloud.school.org/office/`. Same origin means no CORS at all, and the
Login Flow works. The build uses relative paths, so any subfolder works.

Nginx (inside Nextcloud's `server { }`, before the other `location` blocks):

```nginx
location ^~ /office/ {
    alias /var/www/words-online/;
}
```

Apache: `Alias /office /var/www/words-online` (and a `<Directory>` granting access).

### B. The Nextcloud app "WebAppPassword"

Install [WebAppPassword](https://apps.nextcloud.com/apps/webapppassword) and
add the origin of Ofimeo (scheme, host and port, e.g.
`https://office.example.org`) to its allowed WebDAV origins (*Administration
settings → WebAppPassword*, or `'webapppassword.origins' => ['https://office.example.org']`
in `config.php`). It answers the preflight and adds CORS headers to WebDAV
(`remote.php/dav`), so browsing, opening and saving work with an **app
password**. It does not cover the Login Flow, app password revocation or
public share uploads (use A or C for those); Ofimeo detects this and
suggests the app password.

### C. CORS headers in the web server

Allow only the origin(s) where Ofimeo runs, only on the endpoints
above, and answer the browser's `OPTIONS` preflight in the web server (a
preflight never carries credentials, and Nextcloud would answer it with 401).
Replace `https://office.example.org` and reload the web server.

**Nginx** (the maps go in `http { }`; the rest in Nextcloud's `server { }`,
next to its other `add_header` lines: `add_header` in a `location` would
stop the server-level ones from being inherited):

```nginx
# 1) In the http { } block (e.g. /etc/nginx/conf.d/words-online-cors.conf)
map $http_origin $wo_origin {
    default "";
    "https://office.example.org" $http_origin;   # where Ofimeo runs (one line per site)
}
map $request_uri $wo_cors_path {
    default 0;
    "~^[^?]*/remote\.php/dav/" 1;
    "~^[^?]*/public\.php/(dav|webdav)/" 1;
    "~^[^?]*/ocs/v2\.php/core/apppassword" 1;
    "~^[^?]*/login/v2" 1;
}
map "$wo_cors_path:$wo_origin" $wo_cors_origin {
    default "";
    "~^1:(?<o>.+)$" $o;
}
map $wo_cors_origin $wo_cors_methods {
    "" "";
    default "GET, HEAD, POST, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND, OPTIONS";
}
map $wo_cors_origin $wo_cors_headers {
    "" "";
    default "Authorization, Content-Type, Depth, Destination, Overwrite, If-Match, If-None-Match, OCS-APIRequest, X-Requested-With";
}
map $wo_cors_origin $wo_cors_expose {
    "" "";
    default "ETag, OC-ETag, OC-FileId, Content-Length";
}
map $wo_cors_origin $wo_cors_max_age {
    "" "";
    default 3600;
}
map "$request_method:$wo_cors_origin" $wo_preflight {
    default 0;
    "~^OPTIONS:." 1;
}

# 2) In Nextcloud's server { } block, next to its other add_header lines
add_header Access-Control-Allow-Origin $wo_cors_origin always;
add_header Access-Control-Allow-Methods $wo_cors_methods always;
add_header Access-Control-Allow-Headers $wo_cors_headers always;
add_header Access-Control-Expose-Headers $wo_cors_expose always;
add_header Access-Control-Max-Age $wo_cors_max_age always;
add_header Vary Origin always;
if ($wo_preflight) {
    return 204;
}
```

**Apache** (in Nextcloud's `<VirtualHost>`; `a2enmod headers rewrite`):

```apache
# In Nextcloud's <VirtualHost> (needs mod_headers and mod_rewrite)
<IfModule mod_headers.c>
    SetEnvIfExpr "req('Origin') in { 'https://office.example.org' } && %{REQUEST_URI} =~ m#/(remote\.php/dav/|public\.php/(dav|webdav)/|ocs/v2\.php/core/apppassword|login/v2)#" WO_CORS=1
    Header always set Access-Control-Allow-Origin "expr=%{req:Origin}" env=WO_CORS
    Header always set Access-Control-Allow-Methods "GET, HEAD, POST, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND, OPTIONS" env=WO_CORS
    Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Depth, Destination, Overwrite, If-Match, If-None-Match, OCS-APIRequest, X-Requested-With" env=WO_CORS
    Header always set Access-Control-Expose-Headers "ETag, OC-ETag, OC-FileId, Content-Length" env=WO_CORS
    Header always set Access-Control-Max-Age "3600" env=WO_CORS
    Header always merge Vary "Origin" env=WO_CORS
    # Answer the browser's preflight (OPTIONS) here: it never carries a login.
    RewriteEngine On
    RewriteCond %{ENV:WO_CORS} =1
    RewriteCond %{REQUEST_METHOD} =OPTIONS
    RewriteRule ^ - [R=204,L]
</IfModule>
```

If Nextcloud lives in a subfolder (`https://school.org/nextcloud`), both
snippets still match, since the paths are matched anywhere in the URL.

Check from a shell (expect `204` and the `Access-Control-*` headers):

```bash
curl -i -X OPTIONS https://cloud.school.org/remote.php/dav/files/alice/ \
  -H 'Origin: https://office.example.org' -H 'Access-Control-Request-Method: PROPFIND'
```

## Security notes

- Credentials: the Nextcloud address, user id, login name and **app password**
  are stored in this browser's `localStorage` (`words-online:nextcloud`),
  like the rest of the local data; they are sent only to that Nextcloud, in the
  `Authorization` header. Anyone with access to this browser profile (or a
  script running on the same origin) could read them. That is why only app
  passwords are accepted: they can be revoked individually (*Personal settings
  → Security → Devices & sessions*) and cannot change the account's password
  or settings. **Sign out** deletes them, and revokes the app password when it
  came from the Login Flow.
- The link between a document and its Nextcloud file (path, format, ETag) is
  stored in the local document index only; it is never shared with
  collaborators.
- The share link and its password (for hand-ins) are sent only to that
  server; the last link is remembered in this browser (not the password).
- Login Flow v2 lists the app password in Nextcloud under the browser's name
  (browsers do not let pages set the `User-Agent`).

## Tested with

Nextcloud 31.0.9 (SQLite, `php -S`) behind the nginx and Apache snippets
above, with WebAppPassword 26.2.0, and without CORS (diagnostics): connection
test, Login Flow v2 and revocation, browsing, opening .docx/.xlsx/.drawio/.pptx/
.excalidraw, Ctrl+S, conflicts (`412`), save as with a new folder, File drop
uploads (with and without password) and offline behaviour.
