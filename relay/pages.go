package main

// HTML pages served by the relay (no external resources: they must work on a
// network without Internet).

const pageStyle = `<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--text:#1f2328;--muted:#59636e;--line:#d8dee4;--accent:#1a73e8;--ok:#1a7f37;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#15181c;--card:#1f2328;--text:#e6edf3;--muted:#9198a1;--line:#3d444d;--accent:#6ea8fe;--ok:#3fb950;--warn:#d29922}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:0 0 12px}
.muted{color:var(--muted)}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.stat b{display:block;font-size:1.6rem}
code,.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
.addr{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.addr code{font-size:1.15rem;padding:6px 10px;border:1px solid var(--line);border-radius:8px}
button,.btn{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer;text-decoration:none;display:inline-block}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.qr{display:flex;gap:20px;align-items:center;flex-wrap:wrap}.qr img{width:200px;height:200px;background:#fff;padding:8px;border-radius:8px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}dd{margin:0}
.ok{color:var(--ok)}.warn{color:var(--warn)}details{margin:8px 0}summary{cursor:pointer;font-weight:600}li{margin:4px 0}
</style>`

var statusPage = mustTemplate("status", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Name}}</title>`+pageStyle+`</head><body><main>
<h1>{{.Name}}</h1>
<p class="muted">Ofimeo Relay {{.Version}} · running for <span id="uptime">{{.Uptime}}</span>{{if .Public}} · <span class="warn">public mode: accepts any address</span>{{else}} · local network only{{end}}</p>

<section class="card">
  <h2>Relay address</h2>
  <p>Paste it in Ofimeo: <b>Help → Connection test… → School relay</b>.</p>
  <div class="addr"><code id="addr">{{.RelayAddress}}</code><button type="button" data-copy="addr">Copy</button></div>
</section>

<section class="card">
  <h2>Link for students</h2>
  <div class="qr">
    <img src="/ofimeo/qr.png" alt="QR code of the link for students">
    <div>
      <p>{{if .ServingApp}}Ofimeo is served by this relay: open this address on any device of the network.{{else}}Opens Ofimeo with this relay already configured (documents shared from there carry it too).{{end}}</p>
      <div class="addr"><code id="link">{{.StudentLink}}</code><button type="button" data-copy="link">Copy</button></div>
      <p><a class="btn primary" href="{{.StudentLink}}">Open Ofimeo</a></p>
    </div>
  </div>
</section>

<section class="card">
  <h2>Activity</h2>
  <div class="grid">
    <div class="stat"><b id="clients">{{.Nostr.Clients}}</b><span class="muted">connected browsers</span></div>
    <div class="stat"><b id="subs">{{.Nostr.Subscriptions}}</b><span class="muted">subscriptions</span></div>
    <div class="stat"><b id="alloc">{{.Allocations}}</b><span class="muted">relayed connections (TURN)</span></div>
    <div class="stat"><b id="events">{{.Nostr.Received}}</b><span class="muted">signaling messages</span></div>
  </div>
</section>

<section class="card">
  <h2>Certificate</h2>
  <dl>
    <dt>Type</dt><dd>{{modeLabel .Cert.Mode}}</dd>
    <dt>Valid for</dt><dd class="mono">{{join .Cert.Names}}</dd>
    <dt>Issued by</dt><dd>{{.Cert.Issuer}}</dd>
    <dt>Expires</dt><dd>{{date .Cert.NotAfter}}</dd>
    {{if .Cert.Error}}<dt>Problem</dt><dd class="warn">{{.Cert.Error}}</dd>{{end}}
  </dl>
  {{if eq .Cert.Mode "local-ca"}}<p>Devices must trust this relay's certificate authority once: <a href="/ofimeo/ca">installation instructions</a>.</p>{{end}}
</section>

<section class="card">
  <h2>Ports</h2>
  <dl>
    <dt>HTTPS, WebSocket, TURN over TLS</dt><dd>TCP {{.Ports.HTTPS}}</dd>
    <dt>STUN / TURN</dt><dd>UDP and TCP {{.Ports.TURN}}</dd>
    {{if .Ports.TURNTLS}}{{if ne .Ports.TURNTLS .Ports.HTTPS}}<dt>TURN over TLS</dt><dd>TCP {{.Ports.TURNTLS}}</dd>{{end}}{{end}}
    {{if .Ports.HTTP}}<dt>Certificate download (http)</dt><dd>TCP {{.Ports.HTTP}}</dd>{{end}}
    <dt>Relayed media</dt><dd>UDP (allocation port range)</dd>
  </dl>
</section>
</main>
<script>
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  const text = document.getElementById(b.dataset.copy).textContent
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied' } catch { getSelection().selectAllChildren(document.getElementById(b.dataset.copy)) }
}))
setInterval(async () => {
  try {
    const s = await (await fetch('/ofimeo/status.json', { cache: 'no-store' })).json()
    uptime.textContent = s.uptime; clients.textContent = s.nostr.clients; subs.textContent = s.nostr.subscriptions
    alloc.textContent = s.turn_allocations; events.textContent = s.nostr.events_received
  } catch {}
}, 5000)
</script>
</body></html>`)

var caPage = mustTemplate("ca", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install the certificate · {{.Name}}</title>`+pageStyle+`</head><body><main>
<h1>Trust {{.Name}} on this device</h1>
<p>Ofimeo connects to the relay over an encrypted connection. This relay uses its own certificate authority, created when it was installed, so each device must trust it once. It is limited to local names and private network addresses: it cannot be used for Internet sites.</p>
<p>Fingerprint (SHA-256), to check it is the right one:<br><code>{{.Fingerprint}}</code></p>
<p><a class="btn primary" href="/ofimeo/ca.crt">Download the certificate (.crt)</a> <a class="btn" href="/ofimeo/ca.cer">Download (.cer, for Apple devices)</a></p>
<p class="muted">IT departments can push this certificate to all managed devices instead (Google Admin, Intune, Group Policy, Apple MDM), which is the recommended way for a school.</p>

<section class="card">
<details open><summary>Windows</summary><ol>
<li>Open the downloaded <b>ofimeo-relay-ca.crt</b> and choose <b>Install Certificate…</b></li>
<li>Choose <b>Local Machine</b> (or Current User), then <b>Place all certificates in the following store → Trusted Root Certification Authorities</b>.</li>
<li>Finish and confirm. Restart the browser. (Group Policy: Computer Configuration → Windows Settings → Security Settings → Public Key Policies → Trusted Root Certification Authorities.)</li>
</ol></details>
<details><summary>macOS</summary><ol>
<li>Open the downloaded file: Keychain Access adds it to the <b>System</b> (or login) keychain.</li>
<li>Double-click <b>Ofimeo Relay local CA</b>, open <b>Trust</b> and set <b>When using this certificate</b> to <b>Always Trust</b>. Close and enter your password.</li>
<li>Or in Terminal: <code>sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ofimeo-relay-ca.crt</code></li>
</ol></details>
<details><summary>Linux</summary><ol>
<li>Debian, Ubuntu, Raspberry Pi OS: <code>sudo cp ofimeo-relay-ca.crt /usr/local/share/ca-certificates/ &amp;&amp; sudo update-ca-certificates</code></li>
<li>Fedora: <code>sudo cp ofimeo-relay-ca.crt /etc/pki/ca-trust/source/anchors/ &amp;&amp; sudo update-ca-trust</code></li>
<li>Chrome and Firefox keep their own list: Chrome → Settings → Privacy and security → Security → Manage certificates → Authorities → Import (tick “Trust this certificate for identifying websites”); Firefox → Settings → Privacy &amp; Security → Certificates → View Certificates → Authorities → Import.</li>
</ol></details>
<details><summary>ChromeOS (Chromebooks)</summary><ol>
<li>Settings → Privacy and security → Security → Manage certificates → <b>Authorities</b> → <b>Import</b>, choose the file and tick <b>Trust this certificate for identifying websites</b>.</li>
<li>Managed Chromebooks: Google Admin console → Devices → Networks → Certificates → add it with <b>Chromebook: Use this certificate as an HTTPS certificate authority</b>.</li>
</ol></details>
<details><summary>Android</summary><ol>
<li>Settings → Security (or Security &amp; privacy) → More security settings → Encryption &amp; credentials → <b>Install a certificate → CA certificate</b>.</li>
<li>Confirm the warning and choose the downloaded file. Chrome on Android trusts user certificate authorities; some other apps do not.</li>
</ol></details>
<details><summary>iPhone and iPad</summary><ol>
<li>Open this page in Safari and tap <b>Download (.cer, for Apple devices)</b>, then <b>Allow</b>.</li>
<li>Settings → <b>Profile Downloaded</b> → Install.</li>
<li>Settings → General → About → <b>Certificate Trust Settings</b> → turn on full trust for <b>Ofimeo Relay local CA</b>.</li>
</ol></details>
</section>
<p>Then open <a href="{{.RelayAddress}}/ofimeo/">{{.RelayAddress}}/ofimeo/</a>: it must load without a warning.</p>
</main></body></html>`)
