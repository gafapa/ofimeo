# Moodle and Ofimeo: guide for school administrators

Ofimeo can connect to a school's Moodle. Students then see their assignments on
the Ofimeo home screen (**Moodle tasks**) and hand in the document they are
working on straight to an assignment (**Hand in → Hand in to Moodle…**). It is
not a closed workflow: teachers keep using Moodle as usual (creating
assignments, grading, feedback), and nothing changes in how submissions look to
them.

Ofimeo uses the same web services as the official Moodle app. Browser access
also requires CORS or a configured school relay; native-app SSO callbacks are
not implemented in Ofimeo.

New connections and their task caches last for the browser tab's session by
default. Select **Remember this connection on this device** to persist the
token on a trusted personal device. Disconnect removes both persistent and
session credentials and the task cache; the password is never saved.

## 1. Turn on the Moodle app's web services

In Moodle, as an administrator:

1. **Site administration → General → Mobile app → Mobile settings**: turn on
   **Enable web services for mobile devices** (`enablemobilewebservice`). This
   also turns on web services and the REST protocol for the built-in
   *Moodle mobile web service* (`moodle_mobile_app`).
2. Check that authenticated users have the capability
   `moodle/webservice:createmobiletoken` (they do by default).
3. Optional: **Site administration → Plugins → Activity modules → Assignment →
   Submission plugins → File submissions**: the default maximum size and
   accepted types. Ofimeo shows and checks each assignment's own limits.

Ofimeo calls these functions only: `core_webservice_get_site_info`,
`core_enrol_get_users_courses`, `mod_assign_get_assignments`,
`mod_assign_get_submission_status`, `mod_assign_save_submission`,
`mod_assign_submit_for_grading`, plus `login/token.php`,
`webservice/upload.php`, `webservice/pluginfile.php` and the public
`tool_mobile_get_public_config`. All of them are part of the Moodle mobile web
service.

## 2. How the browser reaches Moodle

Ofimeo runs entirely in the student's browser. It first tries to call Moodle
**directly**. Moodle sends `Access-Control-Allow-Origin: *` on its web service
endpoints (`login/token.php`, `webservice/rest/server.php`,
`webservice/upload.php`, `webservice/pluginfile.php`) so that the Moodle app can
run in a browser. Ofimeo only sends "simple" requests (form data, no custom
headers), so no preflight is needed.

Check it from any computer:

```sh
curl -si -X POST https://moodle.school.example/login/token.php \
  -d 'username=x&password=x&service=moodle_mobile_app' | grep -i access-control
# Access-Control-Allow-Origin: *
```

If the header is missing (an old Moodle, or a reverse proxy, web application
firewall or content filter that removes it), or the school prefers it, use
**Ofimeo Relay** (below). Ofimeo falls back to it automatically when the
direct call fails.

`lib/ajax/service-nologin.php` (used only to detect single sign-on, see
section 5) usually has no CORS header. Detection then works through the relay,
or not at all, which only means the student gets the explanation after a
failed sign-in instead of before.

## 3. Ofimeo Relay: Moodle forwarding (optional)

[Ofimeo Relay](relay.md) can forward the calls to **one** Moodle, the one you
configure. It is off unless you give it an address:

```sh
ofimeo-relay --moodle-url https://moodle.school.example
```

or in `ofimeo-relay.json`:

```json
{
  "moodle": { "url": "https://moodle.school.example", "max_upload_mb": 50 }
}
```

or, in containers, `OFIMEO_MOODLE_URL` (and `OFIMEO_MOODLE_MAX_UPLOAD`).

When it is on, `/ofimeo/config` advertises it (`"moodle": {"url", "path",
"maxUploadMB"}`) and the app uses `POST /ofimeo/moodle/{public,login,rest,upload,file}`.

Safety rules of the forwarding (`relay/moodle.go`):

- It forwards **only to the configured Moodle**. Each request names the Moodle
  the browser is connected to (`?site=`); anything else is refused with
  `403 {"error":"site"}`. It cannot be used to reach other servers.
- Only the web service functions listed above are forwarded; files only from
  that Moodle's `pluginfile.php`.
- Nothing is stored. The log has only the endpoint, the status and the size:
  never bodies, user names, passwords or tokens.
- Size limits (`max_upload_mb`, default 50 MB, for hand-ins and downloaded
  files; 10 MB for other answers), timeouts, a few requests at a time;
  redirects are not followed.
- The usual relay rule applies: only devices on the local network, unless the
  relay runs with `--public`.

**The relay sees Moodle traffic in transit** (sign-in, token, files): it must
be the **school's own relay**, run by the school. The app uses a relay for
Moodle without asking only when the school set it (`relay.url` in
`ofimeo.config.json`) or the relay serves the app itself. For any other relay
(for example one that came in a link), it asks the student first and names the
relay.

## 4. Settings in ofimeo.config.json

```json
{
  "moodle": { "url": "https://moodle.school.example", "viaRelay": false },
  "locked": ["moodle"]
}
```

- `moodle.url`: filled in in **Connect to Moodle**; the home screen shows the
  **Moodle tasks** panel (with a Connect button) even before anyone connects.
- `moodle.viaRelay`: `true` always goes through the school relay (which must
  run with `--moodle-url`), never directly.
- `locked: ["moodle"]`: only this Moodle can be used.

Help ▸ For administrators… writes these settings too. Schema:
[ofimeo.config.schema.json](ofimeo.config.schema.json).

## 5. Limitation: single sign-on

Ofimeo signs in with the Moodle username and password (like the Moodle app's
"log in in the app" mode). Sites where people sign in **on a web page** (SAML,
CAS, OAuth 2 with Google or Microsoft, Shibboleth…; the Moodle app's
*typeoflogin* "browser" or "embedded browser") are not supported yet. Ofimeo
detects this from `tool_mobile_get_public_config` when it can read it and
explains it to the student, who can still hand in with the usual **Hand in**
download and upload the file in Moodle.

Accounts with a Moodle password (manual accounts) on such a site can still
connect.

## 6. Privacy

- The password goes only to Moodle (or through the school relay), once, to get
  a token. It is never stored.
- The token, the Moodle site name, the student's name and user id, and the last
  task list are stored in that browser (localStorage). **Disconnect** removes
  them. Anyone using the same browser profile can use the token until then:
  on shared computers, students should disconnect (or use a private window).
  Moodle administrators can revoke tokens in **Site administration → Server →
  Web services → Manage tokens**, and users in their preferences (**Security
  keys**).
- Nothing Moodle-related is sent to the other people in a shared document,
  nor to public relays or any other server: only to the school's Moodle,
  directly or through the school's own relay.

## 7. Troubleshooting

| What the student sees | Cause and fix |
| --- | --- |
| "Could not reach Moodle from this browser" | The address is wrong, or Moodle's CORS header is missing and no relay forwards to it. Check with the `curl` above; set up the relay (section 3). |
| "This Moodle does not allow the Moodle app" | Mobile web services are off (section 1). |
| "Wrong username or password" (+ single sign-on note) | Wrong credentials, or the site uses single sign-on (section 5). |
| "Your school relay forwards to another Moodle" | The relay's `--moodle-url` is not the Moodle the student connected to (check `https://moodle…` vs `http://`, `/moodle` path). |
| "The file is too large for this assignment" | The assignment's maximum size, the student's upload limit, PHP's `upload_max_filesize`/`post_max_size`, or the relay's `max_upload_mb`. |
| "Moodle says: …" | Moodle's own message (for example "too many files", or the teacher must allow changes after a submission for grading). |
