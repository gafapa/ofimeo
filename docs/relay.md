# Ofimeo Relay: collaboration on school networks

Ofimeo runs in the browser and has no server. To edit a document together,
browsers find each other through public *Nostr relays* (WebSocket servers on
the Internet) and then connect directly with *WebRTC*. Many school networks
break one of these steps:

- a **content filter** or firewall blocks the public relays, so browsers never
  find each other;
- a **strict firewall** blocks the UDP traffic WebRTC uses;
- **Wi-Fi client isolation** stops devices on the same Wi-Fi from reaching
  each other.

The result is the same everywhere: people see **"Only you"**. A web page cannot
discover other devices on the local network or accept incoming connections, so
the fix needs a small program on the school network: **Ofimeo Relay**.

## Do you need it? Run the connection test

In Ofimeo, open **Help → Connection test…** (or click the connection status next
to *Share*). It checks, on the device where it runs:

| Check | What it means |
| --- | --- |
| Internet access | The device reaches the Internet at all. |
| Servers to find each other (Nostr relays) | Each relay in use: works (time to answer) or blocked. |
| Local network address, public address (STUN), relay server (TURN) | Which kinds of WebRTC connections are possible. |
| Data through the relay (TURN) | A real message sent through the school relay's TURN server (only with a school relay). |
| People in this document | For each person connected: direct on the local network, direct over the Internet, or through the relay, with the round-trip time. |

It ends with a verdict:

- **Collaboration works directly on this network**: nothing to do. If people on
  the same Wi-Fi still see "Only you", the Wi-Fi probably isolates clients:
  install the relay.
- **Collaboration works only through the school relay**: the relay is doing its
  job.
- **Collaboration may not work on this network**: something is partly blocked
  (for example STUN, or the relay's TURN port); the text says what.
- **Blocked: ask your IT department to install Ofimeo Relay**.

**Copy report** puts a plain-text summary on the clipboard to send to the IT
department.

## How it works

```
 Browser A ──── wss://relay/nostr (find each other) ──── Browser B
     │                                                      │
     └── WebRTC direct, or relayed by TURN (UDP/TCP 3478) ──┘
                         Ofimeo Relay
```

One program provides:

- a **Nostr relay** (the subset Trystero needs: `EVENT`, `REQ`, `CLOSE`, `EOSE`),
  in memory only, at `wss://<relay>/nostr`;
- a **STUN/TURN server** ([pion/turn](https://github.com/pion/turn)) on UDP and
  TCP 3478, and TURN over TLS on the HTTPS port, that relays WebRTC traffic
  when devices cannot reach each other;
- `https://<relay>/ofimeo/config`: the relay's Nostr address and ICE servers
  with **time-limited TURN credentials** (valid 24 hours by default; the app
  renews them before they expire), so no password is stored in the web app;
- a **status page** at `https://<relay>/ofimeo/`: the relay address to paste in
  Ofimeo, a link and QR code for students, connected browsers, TURN
  connections, certificate status and ports;
- optionally, the **Ofimeo web app itself** (`--serve-app`), for networks
  without Internet.

Documents stay end-to-end encrypted: signaling messages are encrypted with the
document key, and WebRTC data (also when relayed by TURN) is encrypted with
DTLS. The relay never sees document contents.

## Quick start

1. Download the file for your system from the
   [releases](https://github.com/gafapa/words-online/releases) (tags
   `relay-v…`):

   | System | File |
   | --- | --- |
   | Windows | `ofimeo-relay-windows-amd64.exe` (ARM: `…-windows-arm64.exe`) |
   | macOS, Apple Silicon | `ofimeo-relay-darwin-arm64` |
   | macOS, Intel | `ofimeo-relay-darwin-amd64` |
   | Linux, PC | `ofimeo-relay-linux-amd64` |
   | Raspberry Pi (64-bit OS) | `ofimeo-relay-linux-arm64` |
   | Raspberry Pi (32-bit OS) | `ofimeo-relay-linux-armv7` |

   `ofimeo-relay-full-…` files are the same program with the Ofimeo web app
   inside (see [Serving the app](#serving-the-app-from-the-relay)).
2. Run it on a computer that stays on and is connected to the school network
   (by cable if possible). It prints the **relay address**, e.g.
   `https://192.168.1.20` (or `https://192.168.1.20:8443` when port 443 is not
   available).
3. Make devices trust its certificate (see [Certificates](#certificates)).
4. Give the address to people. Either:
   - share the **link for students** from the status page
     (`https://<app>/?relay=https://192.168.1.20`) or its QR code: opening it
     configures the relay, and every document shared from there carries it; or
   - in Ofimeo, **Help → Connection test… → School relay**, paste the address
     and choose **Use this relay**.
5. Run the connection test on a student device.

The app uses the school relay **together with** the public relays, so the same
links keep working at home. Tick **Use only the school relay** (or add
`&relaymode=only` to the link) to stop using public servers on that device.

## Installing

The program has no dependencies. Before installing it as a service, put it in
its final place (e.g. `C:\Program Files\Ofimeo Relay\` or
`/usr/local/bin/`): the service runs it from there. Its data (settings, certificates, the TURN
secret) is kept in a *data folder*: `%AppData%\ofimeo-relay` (Windows),
`~/Library/Application Support/ofimeo-relay` (macOS) or
`~/.config/ofimeo-relay` (Linux) when run by a user, and
`C:\ProgramData\Ofimeo Relay`, `/Library/Application Support/Ofimeo Relay` or
`/var/lib/ofimeo-relay` when installed as a service. `--data <folder>` chooses
another one.

### Windows

1. Double-click `ofimeo-relay-windows-amd64.exe`. If SmartScreen warns, choose
   **More info → Run anyway**. Allow it in the Windows Firewall prompt
   (**Private networks**).
2. A window shows the relay address; keep it open.
3. To run it as a service (starts with Windows, no window), open a Command
   Prompt **as administrator** in the download folder:

   ```bat
   ofimeo-relay-windows-amd64.exe install-service
   ```

   Remove it with `uninstall-service`. Options given after `install-service`
   (for example `--https-port 8443`) are kept for the service.

### macOS

```sh
chmod +x ofimeo-relay-darwin-arm64
xattr -d com.apple.quarantine ofimeo-relay-darwin-arm64   # the binary is not notarized
./ofimeo-relay-darwin-arm64
```

As a service (launchd, starts at boot): `sudo ./ofimeo-relay-darwin-arm64 install-service`.
Allow incoming connections if the macOS firewall asks.

### Linux and Raspberry Pi

```sh
chmod +x ofimeo-relay-linux-arm64
./ofimeo-relay-linux-arm64                       # try it (ports 8443 and 8080 as a user)
sudo ./ofimeo-relay-linux-arm64 install-service  # systemd service, uses port 443
```

On a Raspberry Pi, `uname -m` says `aarch64` (use `linux-arm64`) or `armv7l`
(use `linux-armv7`). A Raspberry Pi 4 or 5 is enough for a whole school.
Check the service with `systemctl status ofimeo-relay` and
`journalctl -u ofimeo-relay`. To install it by hand instead, copy the binary to
`/usr/local/bin/ofimeo-relay` and use a unit like:

```ini
[Unit]
Description=Ofimeo Relay
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/ofimeo-relay run --data /var/lib/ofimeo-relay
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Ports to open

| Port | Protocol | Used for |
| --- | --- | --- |
| 443 (or `--https-port`, 8443 when 443 is not available) | TCP | Status page, `/ofimeo/config`, Nostr relay (wss), TURN over TLS |
| 3478 (`--turn-port`) | UDP and TCP | STUN and TURN |
| 49152–65535 (`--relay-ports`) | UDP | Relayed WebRTC traffic (one port per relayed connection) |
| 80 (or 8080; `--http-port -1` turns it off) | TCP | Certificate download page, Let's Encrypt HTTP-01, redirect to https |

Devices must reach these ports **on the relay** (open them in the relay
computer's firewall, and between VLANs if students and the relay are on
different ones). The relay itself needs no Internet access. With Wi-Fi client
isolation, devices can usually still reach wired servers or the gateway; if the
isolation also blocks the relay, add an exception for its address.

A narrower range for relayed traffic, e.g. `--relay-ports 50000-50999`, is
enough for about a thousand simultaneous relayed connections.

## Certificates

Ofimeo is served over https (for example from GitHub Pages), and a secure page
can only open `wss://` and `https://` connections to servers with a trusted
certificate. So the relay needs one of:

1. **Let's Encrypt** (automatic): `--domain relay.myschool.org`. The name must
   point to the relay and Let's Encrypt must reach it on port 443 or 80 from
   the Internet. Certificates are renewed automatically.
2. **A certificate from the school** (for example a wildcard certificate of the
   school's domain, whose DNS name points to the relay's local address):
   `--cert fullchain.pem --key privkey.pem`. The files are reloaded when they
   change, so they can be renewed by certbot or lego (DNS-01 works for
   addresses that are only reachable inside the school).
3. **The relay's own certificate authority** (the default, local network
   only): on first run the relay creates a small certificate authority and a
   certificate for its names and local addresses. Each device must trust that
   authority once:
   - by hand: open `http://<relay>/ofimeo/ca` (or `https://<relay>/ofimeo/ca`,
     accepting the warning once) and follow the instructions for Windows,
     macOS, Linux, ChromeOS, Android or iPhone/iPad;
   - by policy (recommended): push `ca-cert.pem` from the data folder to all
     managed devices (Google Admin console for Chromebooks, Intune or Group
     Policy for Windows, an MDM profile for Apple devices).

   The authority is **name-constrained**: it can only issue certificates for
   private addresses and local names (`.local`, `.lan`, `.internal`, the
   machine's name…), so trusting it cannot be abused to impersonate Internet
   sites. Its SHA-256 fingerprint is shown on the certificate page. If the
   relay's name or network changes to one outside those limits, delete
   `ca-cert.pem` and `ca-key.pem` in the data folder and install the new one.

TURN over UDP and TCP (`turn:` addresses) does not need a trusted certificate;
TURN over TLS (`turns:`) does.

**Chrome and "local network access"**: when Ofimeo is opened from the Internet
(e.g. GitHub Pages) and the relay has a private address, recent versions of
Chrome may ask whether the site may **access other devices on your local
network**: choose *Allow*. Administrators can allow it for all users with the
Chrome policy `LocalNetworkAccessAllowedForUrls` (the app's address). The relay
answers Private Network Access preflights. Serving the app from the relay
avoids the question altogether.

## Serving the app from the relay

With `--serve-app`, the relay also serves the Ofimeo web app, so a school can
work entirely on its own network, even without Internet:

```sh
ofimeo-relay-full-linux-arm64 --serve-app embedded     # the full build has the app inside
ofimeo-relay-linux-arm64 --serve-app ofimeo-app.zip    # or the app zip from the release
ofimeo-relay-linux-arm64 --serve-app /path/to/dist     # or a folder (npm run build)
```

Students open `https://<relay>/` (the status page shows the link and a QR
code). With `--school-config ofimeo.config.json`, the school's settings
(language, locked settings, logo…) apply to everyone; see
[docs/deploy-school.md](deploy-school.md), which also has a Docker image with
the app and the relay. The app detects that it is served by the relay and uses it
automatically; nothing needs to be pasted. It installs as an app and works
offline as usual.

## Configuration

Settings are read from `ofimeo-relay.json` in the data folder (created with
the defaults on first run); command-line options override them. `ofimeo-relay
--help` lists the options (`ofimeo-relay ayuda` in Spanish).

| Option | File key | Default | Meaning |
| --- | --- | --- | --- |
| `--data` | | see above | Data folder |
| `--name` | `name` | Ofimeo Relay | Name on the status page |
| `--host` | `host` | detected LAN address | Name or IP devices use to reach the relay (put in links and TURN addresses) |
| `--https-port` | `https_port` | 443, else 8443 | HTTPS, wss and TURN over TLS |
| `--http-port` | `http_port` | 80, else 8080 | Plain http helper (`-1`: off) |
| `--turn-port` | `turn_port` | 3478 | STUN/TURN, UDP and TCP |
| `--turn-tls-port` | `turn_tls_port` | same as HTTPS | Separate TURN over TLS port (`-1`: off) |
| `--relay-ports` | `relay_port_min`, `relay_port_max` | 49152-65535 | UDP ports for relayed traffic |
| `--domain`, `--acme-email` | `domain`, `acme_email` | | Let's Encrypt |
| `--cert`, `--key` | `cert_file`, `key_file` | | Certificate files (PEM) |
| `--serve-app` | `serve_app` | | `embedded`, a folder or a .zip of the web app |
| `--app-url` | `app_url` | the public Ofimeo | App address used in the link for students |
| `--public` | `public` | false | Accept devices from any address |
| `--allow-networks` | `allow_networks` | | Extra address ranges treated as local (CIDR list) |
| `--credential-ttl` | `credential_ttl` | 24h | Validity of TURN credentials |
| `--log-file` | `log_file` | | Also log to this file |
| `--school-config` | `school_config` | | The school's `ofimeo.config.json`, served at `/ofimeo.config.json` and inside `/ofimeo/config` (see [docs/deploy-school.md](deploy-school.md)); images in a `school` folder next to it are served at `/school/` |
| | `import_proxy` | off | Optional import proxy for Google/Microsoft share links (see [Import proxy](#import-proxy-optional)) |
| `--moodle-url`, `--moodle-max-upload` | `moodle` (`url`, `max_upload_mb`) | off, 50 | Forward the app's Moodle calls to this Moodle only (see [Moodle forwarding](#moodle-forwarding-optional)); also `OFIMEO_MOODLE_URL`, `OFIMEO_MOODLE_MAX_UPLOAD` |
| `--store`, `--store-default-on`, `--store-max-doc`, `--store-max-total`, `--store-ttl` | `store` | on, browsers opt in, 32MB, 4GB, 180 days | Encrypted store-and-forward mailboxes (see [Store-and-forward](#store-and-forward-mailboxes)); also `OFIMEO_STORE*` environment variables |
| | `max_clients`, `max_subscriptions`, `max_event_bytes`, `events_per_minute`, `max_allocations`, `max_allocations_per_ip` | 2000, 64, 65536, 600, 16000, 600 | Limits |

In containers, the main options can also be given as environment variables
(`OFIMEO_NAME`, `OFIMEO_HOST`, `OFIMEO_DOMAIN`, `OFIMEO_ACME_EMAIL`,
`OFIMEO_CERT`, `OFIMEO_KEY`, `OFIMEO_HTTPS_PORT`, `OFIMEO_HTTP_PORT`,
`OFIMEO_TURN_PORT`, `OFIMEO_TURN_TLS_PORT`, `OFIMEO_RELAY_PORT_MIN`,
`OFIMEO_RELAY_PORT_MAX`, `OFIMEO_SERVE_APP`, `OFIMEO_APP_URL`, `OFIMEO_PUBLIC`,
`OFIMEO_ALLOW_NETWORKS`, `OFIMEO_CREDENTIAL_TTL`, `OFIMEO_SCHOOL_CONFIG`,
`OFIMEO_LOG_FILE`): they override the file, and command-line options override
both. `ofimeo-relay healthcheck [port]` exits with 0 when the local HTTPS server
answers (used by the Docker image, see [docs/deploy-school.md](deploy-school.md)).

The TURN shared secret is generated on first run and kept in `turn-secret` in
the data folder; it never leaves the relay.

## Store-and-forward mailboxes

The relay also keeps **encrypted mailboxes** so that devices sync even when
they are never online at the same time (a student edits in class and
continues at home; the teacher corrects at night). Browsers encrypt everything
with the key in the document link before uploading; the relay only sees opaque
mailbox ids, sizes and times, and accepts writes only when they are signed with
the document's edit key (view links can read, never write). Blobs are kept in
`store/` in the data folder, with limits per document and in total, and are
deleted 180 days after the last change.

It is on by default, but each browser opts in (connection test → *Sync without
being online together*) unless the relay says otherwise:

```json
"store": { "enabled": true, "default_on": true, "max_total_bytes": 4294967296, "ttl": "4320h" }
```

or `--store-default-on` / `OFIMEO_STORE_DEFAULT_ON=on`; `--store=false` /
`OFIMEO_STORE=off` turns it off. Students at home can only reach it if the relay
is public (`--public`). Details, API and threat model:
[store-forward.md](store-forward.md).

## Import proxy (optional)

Ofimeo can import files from Google Docs/Sheets/Slides/Drive and OneDrive or
SharePoint share links (**Import from link…**). Browsers cannot download those
files for a web app (no CORS), so by default people download the file and drop
it on the dialog. A school can let the relay do that download in one click:

```json
"import_proxy": { "enabled": true, "max_mb": 30 }
```

in `ofimeo-relay.json` (off by default; `max_mb` defaults to 30). The relay then
advertises `"importProxy": "/ofimeo/fetch"` in `/ofimeo/config`, and the app
shows *Import directly through the school relay*. `GET /ofimeo/fetch?url=…`:

- only fetches `https` URLs on `docs.google.com`, `drive.google.com`,
  `drive.usercontent.google.com`, `*.googleusercontent.com`,
  `onedrive.live.com`, `1drv.ms`, `api.onedrive.com`, `*.files.1drv.com`,
  `*.sharepoint.com` and `*.microsoftpersonalcontent.com`, checking every
  redirect again, and only on public Internet addresses (never the school
  network or the relay itself);
- sends no cookies, credentials or headers from the browser, so only files
  shared as "anyone with the link" work (sign-in pages are reported as
  "not shared publicly");
- refuses files larger than `max_mb`, runs at most four downloads at a time,
  and always answers with `application/octet-stream` as an attachment;
- follows the relay's usual rule: local network only unless `public`;
- logs only the host name, never the full link.

## Moodle forwarding (optional)

When the school's Moodle does not let browsers call it directly (no CORS
header), the relay can forward Ofimeo's Moodle calls to **that one Moodle**:
`--moodle-url https://moodle.school.example` (or `"moodle": {"url": …,
"max_upload_mb": 50}` in `ofimeo-relay.json`, or `OFIMEO_MOODLE_URL`). Off by
default. Only the configured Moodle and the Moodle app's assignment functions
are forwarded, nothing is stored or logged but the endpoint, status and size.
See [moodle.md](moodle.md).

## Security notes

- **Local network only by default**: the relay refuses devices whose address is
  not private (10.x, 172.16–31.x, 192.168.x, 100.64.x, IPv6 unique-local,
  loopback) for every service, including TURN. `--allow-networks` adds ranges
  (for schools that use public addresses internally); `--public` accepts
  everyone, for example for students at home, and should come with a real
  certificate and a firewall in front.
- **Time-limited credentials**: TURN credentials follow the TURN REST
  convention (username `<expiry>:ofimeo`, password HMAC-SHA1 with the secret),
  expire after `credential_ttl`, and are handed out only by `/ofimeo/config`,
  to devices allowed to use the relay.
- **What TURN may reach**: relayed traffic may only go to devices on the local
  network (or anywhere with `--public`), never to the relay machine's loopback
  addresses.
- **Limits**: maximum browsers, subscriptions per browser, event size, events
  per minute per browser, and TURN allocations in total and per device.
- **Nothing readable is stored**: signaling messages are checked (id and
  signature), kept in memory for two minutes and then dropped. The optional
  store-and-forward mailboxes hold only data encrypted in the browsers, under
  opaque ids, and accept only signed writes. Document contents never reach the
  relay unencrypted.
- The status page shows only counts, no addresses or document information.

## Troubleshooting

- **The connection test says the school relay cannot be reached**: open its
  address in the browser. A certificate warning means the device does not trust
  the relay's certificate authority yet (see [Certificates](#certificates)); a
  timeout means a firewall blocks the HTTPS port or the address is wrong.
- **"Data through the relay (TURN)" fails** while the relay is reachable: UDP
  and TCP 3478 (and the relayed UDP range) are blocked between the device and
  the relay.
- **Everyone connects but only through TURN**: normal with Wi-Fi client
  isolation; the relay forwards the traffic. A Raspberry Pi handles a school.
- **Port 443 is in use**: the relay falls back to 8443; the relay address then
  includes `:8443`.
- **After changing the relay setting in the app**, reload open documents.

## Building from source

```sh
cd relay
go test ./...
go build -o ofimeo-relay .                 # this machine
VERSION=1.0.0 ./build.sh                   # every platform, into relay/dist/
FULL=1 ./build.sh                          # also the -full builds (needs npm run build first)
```

Pushing a tag like `relay-v1.0.0` runs `.github/workflows/relay-release.yml`,
which builds every platform and attaches the files to a GitHub Release.
