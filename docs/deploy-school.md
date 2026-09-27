# Installing Ofimeo in a school

This guide is for the person who looks after the school's computers. It
explains how to run Ofimeo on the school's own server and how to set it up for
everyone with one file, `ofimeo.config.json`.

Ofimeo is a web app with **no server part**: documents live in each browser and
travel directly between browsers. A school installation therefore only needs
to serve some static files and, on networks that block direct connections,
run **Ofimeo Relay** ([docs/relay.md](relay.md)), a small program that helps
devices find and reach each other. Both fit in one program or one container.

| You have… | Use |
| --- | --- |
| A Linux server or NAS with Docker | [A. Docker](#a-docker) |
| A Raspberry Pi | [B. Raspberry Pi and other ARM computers](#b-raspberry-pi-and-other-arm-computers) |
| A Windows server | [C. Windows server with the relay program](#c-windows-server-with-the-relay-program) |
| A web server already (nginx, Apache, IIS, Moodle's server…) | [D. Static hosting](#d-static-hosting-nginx-apache-iis) (plus a relay if the network needs one) |

Whatever you choose, run the **connection test** (Help ▸ Connection test…) on a
student device afterwards.

## The school configuration: `ofimeo.config.json`

Every browser reads `ofimeo.config.json` from the same folder as `index.html`
when Ofimeo starts, **before** anything is shown, and keeps a copy so the
settings also apply offline. The service worker caches it too (network first).
Without the file nothing changes.

The easiest way to write it is the form in the app: **Help ▸ For
administrators…** (it works offline and nothing leaves the browser; it starts
from the configuration currently applied). The format is described by the JSON
schema [docs/ofimeo.config.schema.json](ofimeo.config.schema.json) (editors
such as VS Code validate the file through its `$schema` line), and
[deploy/config/ofimeo.config.example.json](../deploy/config/ofimeo.config.example.json)
is a complete example:

```json
{
  "$schema": "https://raw.githubusercontent.com/gafapa/ofimeo/main/docs/ofimeo.config.schema.json",
  "version": 1,
  "school": { "name": "IES Example", "logo": "school/logo.svg", "url": "https://www.school.example" },
  "defaults": { "language": "gl", "documentLanguage": "gl-ES" },
  "relay": { "url": "https://ofimeo.school.example:8443", "only": true },
  "store": { "relay": true, "nextcloud": { "enabled": true, "folder": "/Ofimeo" } },
  "nextcloud": { "servers": [{ "name": "Nube do centro", "url": "https://cloud.school.example" }] },
  "features": { "webmcp": false, "ai": true, "publicRelays": false, "templates": "all", "hiddenApps": [] },
  "legal": { "organization": "IES Example", "dpoEmail": "dpd@school.example" },
  "locked": ["language", "webmcp", "relay", "nextcloud"]
}
```

| Setting | Effect |
| --- | --- |
| `school.name`, `school.logo`, `school.url` | Shown next to the Ofimeo name on the home screen. Put the logo in a `school/` folder next to `index.html` (it is cached for offline use) or give an `https://` address. |
| `defaults.language` | Interface language (`es`, `gl`, `en`, `fr`, `de`) for people who have not chosen one. |
| `defaults.documentLanguage` | Language of new text for spelling and grammar (`gl`, `es-ES`, `es-MX`, `en-GB`…). |
| `relay.url`, `relay.only` | The school's Ofimeo Relay, used unless the person set another one; `only` stops using public servers. |
| `nostr.relays`, `iceServers` | Other Nostr relays (`wss://`) and STUN/TURN servers of the school. TURN passwords written here are visible to anyone who can load the file: prefer Ofimeo Relay, which hands out short-lived credentials. |
| `store.relay`, `store.nextcloud` | Where encrypted changes may wait for people who are offline ("sync without being online together"): on the school relay and/or in a Nextcloud folder (`folder`). Both are allowed by default. |
| `nextcloud.servers` | Servers offered in **Connect to Nextcloud**; the first is filled in. |
| `moodle.url`, `moodle.viaRelay` | The school's Moodle (see [docs/moodle.md](moodle.md)). |
| `features.webmcp` | `false`: AI assistants (WebMCP) cannot be turned on. |
| `features.ai` | `false`: no AI features at all (also forbids WebMCP). |
| `features.publicRelays` | `false`: only the school's servers are used (no public Nostr relays or STUN servers). Give `relay.url` or `nostr.relays`, or people will not find each other. |
| `features.templates` | `"all"` (default), `"none"` or a list of template ids (the form lists them). Own templates (File ▸ Save as template) stay available. |
| `features.hiddenApps` | Apps not offered for new documents (`writer`, `sheet`, `draw`, `diagram`, `slides`, `forms`, `pdf`, `notebook`). Documents of that kind that people receive still open. |
| `legal.*` | The school's organization, contact, privacy and data protection officer e-mails and pages, shown above the legal links (home screen and About). |
| `locked` | Settings people cannot change; they show **Set by your school**: `language` (needs `defaults.language`), `webmcp` (stays off), `relay` (needs `relay.url`; no other relay, and `relay.only` is fixed), `nextcloud` (only `nextcloud.servers`), `moodle`. |

Values that are not valid are ignored, so a mistake never stops the app. A
change reaches each browser the next time Ofimeo is opened.

**Where the file comes from.** The app looks for `ofimeo.config.json` next to
`index.html`. When the app is served by Ofimeo Relay, the relay answers that
address from the file given with `--school-config` (and serves the
`school/` folder next to it). The relay also puts the same configuration in
`/ofimeo/config` (member `school`); the app remembers it for its next start,
but only from the relay that serves the app itself or the relay named in the
app's own `ofimeo.config.json`. A relay that someone adds through a link
(`?relay=`) or by hand can never lock settings.

## A. Docker

The repository's `Dockerfile` builds the web app (Node), builds Ofimeo Relay
(Go) and puts both in a small image (`distroless`, no shell, unprivileged
user). The relay serves the app over HTTPS, the Nostr relay, TURN and the
school configuration. `docker-compose.yml` runs it.

1. Install Docker and the compose plugin on a Linux server that stays on,
   connected to the school network by cable if possible.
2. Get the project and, optionally, your configuration:

   ```sh
   git clone https://github.com/gafapa/ofimeo.git ofimeo && cd ofimeo
   cp deploy/config/ofimeo.config.example.json deploy/config/ofimeo.config.json
   nano deploy/config/ofimeo.config.json      # or use Help ▸ For administrators… and copy the file here
   mkdir -p deploy/config/school && cp /path/to/logo.svg deploy/config/school/
   ```

   The legal pages of the app are generated from `legal.config.json` at build
   time: fill in your school's data there (owner, data protection officer,
   hosting) before building (see [docs/legal/README.md](legal/README.md)).
3. Edit the `environment` section of `docker-compose.yml`: at least
   `OFIMEO_NAME`, and `OFIMEO_HOST` if devices must use a DNS name.
4. Build and start:

   ```sh
   docker compose up -d --build
   docker compose ps          # "healthy" after a few seconds
   docker compose logs -f     # the relay address, the status page and the link for students
   ```

5. Open `https://<server>:8443/ofimeo/`: the status page, the certificate to
   install on devices (see [TLS](#tls-certificates)) and the link and QR code for students.
   The app itself is at `https://<server>:8443/`.

The compose file uses **host networking** (Linux), so TURN sees the server's
real address and can use a range of UDP ports without mapping each one. The
container listens on 8443 (HTTPS), 8080 (plain HTTP helper) and 3478 (STUN/TURN),
plus UDP 50000–50100 for relayed traffic; open them in the server's firewall.
To use ports 443 and 80 instead (needed for Let's Encrypt), either set
`OFIMEO_HTTPS_PORT: "443"`, `OFIMEO_HTTP_PORT: "80"` and add `user: "0:0"` to
the service (binding ports below 1024 needs root), or remove
`network_mode: host`, set `OFIMEO_HOST` to the server's LAN IP and use the
commented `ports` list (`443:8443`, `80:8080`…). Docker Desktop (Windows,
macOS) has no host networking: use the `ports` list there.

Volumes: `ofimeo-data` (`/data`) keeps the relay's settings, certificates, TURN
secret and store-and-forward mailboxes; `deploy/config` is mounted read-only at
`/config`. Every relay option can be set with an `OFIMEO_*` variable (list in
[docs/relay.md](relay.md#configuration)); `OFIMEO_STORE: "true"` etc. control
the mailboxes.

## B. Raspberry Pi and other ARM computers

A Raspberry Pi 4 or 5 is enough for a whole school. Two options:

- **Docker** on Raspberry Pi OS (64-bit): the same steps as [A](#a-docker);
  `docker compose up -d --build` builds for the Pi's architecture (the build
  takes a while on the Pi). To build on a PC for the Pi:

  ```sh
  docker buildx build --platform linux/arm64 -t ofimeo:arm64 --load .   # linux/arm/v7 for a 32-bit OS
  docker save ofimeo:arm64 | ssh pi@raspberry docker load
  ```

- **The relay program** (no Docker): download `ofimeo-relay-full-linux-arm64`
  (64-bit OS; `…-armv7` for 32-bit) from the releases, which has the app
  inside, and install it as a service:

  ```sh
  sudo install -m 755 ofimeo-relay-full-linux-arm64 /usr/local/bin/ofimeo-relay
  sudo mkdir -p /etc/ofimeo && sudo cp ofimeo.config.json /etc/ofimeo/
  sudo ofimeo-relay install-service --serve-app embedded --school-config /etc/ofimeo/ofimeo.config.json
  systemctl status ofimeo-relay
  ```

## C. Windows server with the relay program

1. Download `ofimeo-relay-full-windows-amd64.exe` from the releases (the app is
   inside) and copy it to `C:\Program Files\Ofimeo Relay\`.
2. Put the configuration in `C:\ProgramData\Ofimeo Relay\ofimeo.config.json`
   (the logo in a `school` folder next to it).
3. In a Command Prompt **as administrator**:

   ```bat
   cd "C:\Program Files\Ofimeo Relay"
   ofimeo-relay-full-windows-amd64.exe install-service --serve-app embedded --school-config "C:\ProgramData\Ofimeo Relay\ofimeo.config.json"
   ```

4. Allow the program in Windows Defender Firewall (TCP 443 and 80, UDP and TCP
   3478, UDP 49152–65535 or the range given with `--relay-ports`).
5. Open `https://<server>/ofimeo/` from a student device.

With IIS already on port 443, add `--https-port 8443 --http-port 8080`, or
serve the app from IIS ([D](#d-static-hosting-nginx-apache-iis)) and run the
relay without `--serve-app`.

## D. Static hosting (nginx, Apache, IIS)

Build the app (`npm ci && npm run build`) and copy the `dist/` folder to the web
server, then put `ofimeo.config.json` (and `school/`) next to `index.html`.
Ofimeo works from any folder (`https://www.school.example/ofimeo/`).

- **nginx**: [deploy/nginx/ofimeo.conf](../deploy/nginx/ofimeo.conf) and
  [deploy/nginx/ofimeo-headers.inc](../deploy/nginx/ofimeo-headers.inc).
- **Apache**: [deploy/apache.conf](../deploy/apache.conf) (virtual host or `.htaccess`).
- **IIS**: add the MIME types below and the same headers in `web.config`.

What matters:

- **HTTPS** (browsers only allow the offline service worker, installing and
  the clipboard on secure pages).
- **MIME types**: `.wasm` `application/wasm`, `.webmanifest`
  `application/manifest+json`, `.woff2` `font/woff2`, `.woff` `font/woff`, `.js`
  and `.mjs` `text/javascript`, `.json` `application/json`, `.svg` `image/svg+xml`.
- **Caching**: `index.html`, `sw.js`, `manifest.webmanifest`,
  `ofimeo.config.json` and `school/` with `Cache-Control: no-cache`; `assets/`
  can be cached for a year (`immutable`, the names change with every build).
- **Service worker scope**: `sw.js` is next to `index.html` and controls that
  folder; no `Service-Worker-Allowed` header is needed. Do not rewrite unknown
  paths to `index.html` (routes are in the `#` part of the address); a missing
  `ofimeo.config.json` must be a real 404 (or the default file of the build).
- **Content-Security-Policy** (tested by the end-to-end tests):
  `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' data: blob: https: wss: ws:; worker-src 'self' blob:; media-src 'self' data: blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`.
  `connect-src` must allow the Nostr relays, the school relay and Nextcloud;
  narrow `https: wss:` to your own servers when `features.publicRelays` is false.
- **No COOP/COEP**: cross-origin isolation is not needed and would break
  images and files from Nextcloud.

If the network blocks public relays or direct connections, also run Ofimeo
Relay somewhere ([docs/relay.md](relay.md)) and name it in `relay.url`.

## TLS certificates

Browsers need a trusted certificate for the app and for `wss://`/`turns:`
connections. The relay (Docker or program) offers three ways:

1. **Let's Encrypt**: `OFIMEO_DOMAIN` / `--domain ofimeo.school.example` (the
   name must point to the server and ports 80 or 443 must be reachable from the
   Internet). Renewed automatically.
2. **The school's certificate** (e.g. a wildcard certificate, with DNS-01 for
   names only reachable inside): `OFIMEO_CERT`/`OFIMEO_KEY` or `--cert`/`--key`
   (PEM files; in Docker, put them in `deploy/config/tls/`). They are reloaded
   when they change.
3. **The relay's own certificate authority** (default): install it once on
   every device from `http://<server>:8080/ofimeo/ca`, or push `ca-cert.pem`
   (in the data volume) by policy (Google Admin, Intune/GPO, MDM). It can only
   issue certificates for local names and addresses.

A reverse proxy (Caddy, Traefik, nginx) in front of the relay is possible for
the HTTPS part, but TURN (UDP/TCP 3478 and the relay port range) must reach the
relay directly.

## Updates

- **Docker**: `git pull && docker compose up -d --build`. The data volume is kept.
- **Relay program**: stop the service (`stop-service`), replace the file, start it (`start-service`).
- **Static hosting**: replace the files of `dist/` (keep your `ofimeo.config.json` and `school/`).

Browsers pick up a new version by themselves: the service worker checks for
updates each time Ofimeo is opened and the next start uses it. Documents are
not affected by updates.

## Backups

- **Documents are not on the server**: they live in the browsers (and in
  Nextcloud when people save there). Remind people to make backups
  (home screen ▸ Storage and backup) or to use Nextcloud.
- **The relay's data folder** (Docker volume `ofimeo-data`, or the data folder
  of the program): back up at least `ca-cert.pem` and `ca-key.pem` (with the
  default certificates, a new authority means installing it again on every
  device), `turn-secret`, `ofimeo-relay.json` and, if store-and-forward is on,
  the `store` folder (encrypted mailboxes; losing it only delays syncing).

  ```sh
  docker run --rm -v ofimeo_ofimeo-data:/data -v "$PWD":/backup busybox tar czf /backup/ofimeo-data.tgz -C /data .
  ```

- **Your configuration**: `ofimeo.config.json`, `school/`, `legal.config.json`
  and `docker-compose.yml`.

## Checking that it works

- `https://<server>/ofimeo/` shows the status page (with Docker,
  `docker compose ps` shows `healthy`; `ofimeo-relay healthcheck` does the same
  check by hand).
- `https://<server>/ofimeo.config.json` returns your configuration.
- On a student device: the school's name on the home screen, **Set by your
  school** on locked settings (language menu, Tools ▸ Allow AI assistants,
  Help ▸ Connection test ▸ School relay, Connect to Nextcloud), and a
  connection test that ends with a good verdict.

The CI workflow builds the Docker image on every change (without publishing
it) and checks that the container serves the app, the school configuration
and a healthy status.
