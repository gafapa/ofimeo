// Artikel der Hilfe auf Deutsch (Übersetzung von en.ts).
import type { Articles } from './types'

const articles: Articles = {
  'getting-started': {
    title: 'Erste Schritte',
    keywords: 'anfangen start beginnen willkommen startseite neu dokument öffnen vorlage konto anmelden',
    body: `Ofimeo ist eine Office-Suite, die vollständig in Ihrem Browser läuft: Dokumente, Tabellen, Zeichnungen, Diagramme, Präsentationen, Formulare und PDF-Korrektur. Sie brauchen kein Konto, und auf keinem Server wird etwas installiert.

## Die Startseite
- **Etwas Neues beginnen**: Klicken Sie auf eine Karte, um ein Dokument dieser Art zu erstellen.
- **Vorlagen**: Arbeitsblätter, Bewertungsraster, Notenbücher, Stundenpläne, Concept-Maps und mehr. Ein Klick erstellt Ihre eigene Kopie.
- **Datei öffnen…**: öffnet Word-, OpenDocument-, Excel-, CSV-, PowerPoint-, draw.io-, Excalidraw- und PDF-Dateien von Ihrem Computer.
- **Ihre Dokumente**: alles, was Sie in diesem Browser erstellt oder geöffnet haben, mit Suche, Ordnern, Schlagwörtern und Papierkorb (gelöschte Dokumente werden 30 Tage aufbewahrt).

## Ihr Name
Geben Sie Ihren Namen oben rechts ein (auf dem Handy oder in einem schmalen Fenster tippen Sie oben rechts auf die Personen-Schaltfläche). Andere sehen ihn neben Ihrem Cursor und in Kommentaren, und er wird beim Abgeben für den Dateinamen verwendet. Ein Vorname oder Initialen genügen.

## Wichtig
- Dokumente werden **nur in diesem Browser** gespeichert. Lesen Sie [Offline arbeiten und wo Ihre Daten liegen](help:offline) und erstellen Sie [Sicherungen](help:backup).
- Um mit anderen zu arbeiten, senden Sie einen [Freigabelink](help:sharing).
- Schülerinnen und Schüler geben Arbeiten mit der Schaltfläche [Abgeben](help:handin) ab.

[Die Einführung erneut anzeigen](action:tour)

## Aus Google Drive oder Microsoft 365 importieren
**Aus Link importieren…** (Startseite und Menü Datei in jeder App) öffnet Dateien, die aus Google Docs, Tabellen, Präsentationen und Drive, OneDrive oder SharePoint geteilt wurden:
1. Fügen Sie den Freigabelink ein. Die Datei muss für **Jeder mit dem Link** freigegeben sein, oder Sie müssen sie mit Ihrem eigenen Konto öffnen können.
2. Klicken Sie auf die Download-Schaltfläche: Ihr Browser lädt die Datei als Word, Excel oder PowerPoint herunter.
3. Legen Sie die heruntergeladene Datei im Dialog ab (oder wählen Sie sie aus). Sie öffnet sich als neues Ofimeo-Dokument.

Browser erlauben Web-Apps nicht, diese Dateien direkt herunterzuladen. Die Datei geht daher über Ihren Download-Ordner; Ofimeo sieht Ihr Google- oder Microsoft-Konto nie. Wenn das Relay Ihrer Schule es anbietet, erledigt **Direkt über das Schul-Relay importieren** das für öffentliche Dateien mit einem Klick.`,
  },
  sharing: {
    title: 'Teilen und Berechtigungen',
    keywords: 'teilen freigeben link einladen zusammenarbeiten gemeinsam berechtigung bearbeiten kommentieren ansehen nur lesen kopie arbeitsblatt qr-code schüler',
    body: `Klicken Sie auf **Teilen** (oben rechts in jeder App), um einen Link zu erhalten. Wer den Link öffnet, tritt dem Dokument bei, und Änderungen erscheinen für alle in Echtzeit.

## Arten von Links
- **Kann bearbeiten**: Andere können das Dokument mit Ihnen ändern.
- **Kommentieren erlaubt**: Andere können lesen und kommentieren, aber den Text nicht ändern.
- **Kann ansehen**: Andere können das Dokument lesen und Änderungen live verfolgen.
- **Erstellt eine Kopie**: Jede Person, die ihn öffnet, erhält eine eigene private Kopie. Damit bekommt jede Schülerin und jeder Schüler ein eigenes Arbeitsblatt.

Der Dialog zeigt auch einen **QR-Code**, praktisch für Tablets und Handys im Unterricht.

## Gut zu wissen
- Ein Link ist wie ein Schlüssel: Wer ihn hat, erhält seinen Zugriff. Teilen Sie ihn nur mit den Personen, die ihn brauchen.
- Ansichts- und Kommentarlinks lassen sich nicht in Bearbeitungslinks verwandeln: Änderungen werden nur angenommen, wenn sie mit dem Bearbeitungsschlüssel signiert sind.
- Es gibt keine zentrale Kopie auf einem Server. Um die neuesten Änderungen zu erhalten, muss gleichzeitig jemand online sein, der das Dokument hat. Offline gemachte Änderungen werden beim nächsten Zusammentreffen automatisch zusammengeführt.
- Der Status neben Teilen zeigt **Nur Sie** oder wie viele Personen da sind. Erscheint nie jemand, führen Sie den [Verbindungstest](help:network) aus.
- Dokumente, die vor den Berechtigungslinks entstanden sind, lassen sich nur mit Bearbeitungslinks teilen. Mit Datei ▸ Kopie erstellen erhalten Sie alle Linkarten.

## Chat
- Die Sprechblasen-Schaltfläche neben den Personen im Dokument (oder \`Alt+Shift+C\`) öffnet den Chat. Eine Zahl zeigt ungelesene Nachrichten; sie wird rot, wenn Sie jemand erwähnt.
- Tippen Sie \`@\`, um eine anwesende Person zu erwähnen. Links öffnen sich in einem neuen Tab; die Smiley-Schaltfläche fügt Emojis ein. \`Eingabe\` sendet, \`Umschalt+Eingabe\` beginnt eine neue Zeile, \`Escape\` schließt den Chat.
- Wer einen Bearbeitungs- oder Kommentarlink hat, kann schreiben; wer einen Leselink hat, kann nur lesen.
- Lehrkräfte (Bearbeitungslink): Die Schaltfläche ⋯ im Chat schaltet den Chat für dieses Dokument aus oder löscht den Verlauf für alle.
- Nachrichten werden mit dem Dokument in diesem Browser und in Sicherungen gespeichert, aber nicht in Versionen, Kopien oder heruntergeladenen Dateien.`,
  },
  offline: {
    title: 'Offline arbeiten und wo Ihre Daten liegen',
    keywords: 'offline internet verbindung installieren app pwa speicher indexeddb browserdaten löschen verloren gerät computer',
    body: `Ihre Dokumente werden **in diesem Browser auf diesem Gerät** gespeichert (in seinem IndexedDB-Speicher). Sie werden auf keinen Server hochgeladen (außer Sie aktivieren [Synchronisieren, ohne gleichzeitig online zu sein](help:network), das eine verschlüsselte Kopie aufbewahrt). Der Speicherstatus in der Statusleiste zeigt **In diesem Browser gespeichert**.

## Was das bedeutet
- Wenn Sie die Browserdaten löschen (Verlauf, Cookies und Websitedaten), **werden Ihre Dokumente gelöscht**. Erstellen Sie [Sicherungen](help:backup) oder speichern Sie in [Nextcloud](help:nextcloud).
- Ein anderer Browser oder ein anderer Computer sieht Ihre Dokumente nicht. Um auf einem anderen Gerät weiterzuarbeiten, öffnen Sie dort Ihren Bearbeitungslink, während dieses Gerät online ist, oder stellen Sie eine Sicherung wieder her.
- Ofimeo bittet den Browser, seinen Speicher zu schützen, damit er die Dokumente bei Platzmangel nicht löscht. [Speicher und Sicherung](action:storage) zeigt, ob er geschützt ist und wie viel Platz belegt ist.

## Ohne Verbindung arbeiten
- Nach dem ersten Besuch funktioniert die ganze Suite offline. Die Startseite zeigt **✓ Offline verfügbar**, sobald sie bereit ist.
- Sie können Ofimeo als App installieren (Browsermenü oder Adressleiste ▸ Installieren). Installiert öffnet sie Word-, Excel-, PowerPoint- und andere Dateien von Ihrem Computer.
- Erstellen, Bearbeiten, Öffnen und Herunterladen brauchen keine Verbindung. Offline gemachte Änderungen werden an andere gesendet, sobald Sie wieder verbunden sind.
- Nextcloud und das Diktieren brauchen eine Verbindung.`,
  },
  backup: {
    title: 'Sicherungen und Wiederherstellung',
    keywords: 'sicherung backup wiederherstellen kopie passwort verschlüsselt ofimeo-backup erinnerung verlorene dokumente computer wechseln',
    body: `Da die Dokumente nur in diesem Browser liegen, sollten Sie eine Sicherung aufbewahren. Öffnen Sie [Speicher und Sicherung](action:storage) (Laufwerkssymbol auf der Startseite oder Datei ▸ Speicher und Sicherung… in jeder App).

## Sichern
- **Alle Dokumente sichern** lädt eine einzige **.ofimeo-backup**-Datei mit allen Dokumenten, ihrem Versionsverlauf, den Kommentaren und Ihren eigenen Vorlagen herunter.
- Sie können sie mit einem **Passwort** schützen (starke Verschlüsselung). Tun Sie das: Die Datei enthält die Schlüssel zum Bearbeiten Ihrer Dokumente. Ohne das Passwort lässt sie sich nicht wiederherstellen.
- Auf der Startseite können Sie auch nur die ausgewählten Dokumente sichern.

## Wiederherstellen
**Sicherung wiederherstellen** liest die Datei und führt sie zusammen: Vorhandene Dokumente werden ohne Verluste aktualisiert, fehlende hinzugefügt. Ein Bericht zeigt, was hinzugefügt und zusammengeführt wurde. So bringen Sie Ihre Dokumente auf einen neuen Computer oder Browser.

## Erinnerungen und automatische Sicherung
- Die Startseite erinnert Sie, wenn Dokumente nur in diesem Browser existieren und seit 7 Tagen keine Sicherung erstellt wurde (die Anzahl der Tage ist einstellbar, die Erinnerung abschaltbar).
- Mit einem [Nextcloud](help:nextcloud)-Konto lädt die automatische Sicherung alle paar Tage eine Sicherung in einen Ordner Ihrer Nextcloud hoch (standardmäßig aus).`,
  },
  nextcloud: {
    title: 'Nextcloud',
    keywords: 'cloud server webdav speichern öffnen synchronisieren app-passwort anmelden konto schule datei',
    body: `Wenn Ihre Schule einen Nextcloud-Server hat, können Sie Dateien daraus öffnen und wieder dort speichern. Ihr Browser spricht direkt mit Nextcloud.

## Konto verbinden
Öffnen Sie [Nextcloud-Konto](action:nextcloud) (Nextcloud-Schaltfläche auf der Startseite oder Datei ▸ Nextcloud-Konto…). Geben Sie die Serveradresse ein und wählen Sie **Mit Nextcloud anmelden** oder verwenden Sie ein **App-Passwort** (Nextcloud ▸ Persönliche Einstellungen ▸ Sicherheit ▸ Neues App-Passwort erstellen). Geben Sie nie Ihr Hauptpasswort ein. **Verbindung testen** erklärt, was nicht stimmt, wenn es nicht klappt.

## Öffnen und speichern
- **Aus Nextcloud öffnen…** (Startseite und Menü Datei) öffnet eine Datei als neues Dokument, das mit ihr **verknüpft** ist.
- **In Nextcloud speichern** (\`Strg+S\`) aktualisiert die verknüpfte Datei. **In Nextcloud speichern unter…** wählt Ordner, Namen und Format.
- Wurde die Datei inzwischen in Nextcloud geändert, wählen Sie: überschreiben, als Kopie speichern oder abbrechen.
- Optional automatisches Speichern alle paar Minuten.

## Gut zu wissen
- Nur die Person, die ein Dokument verknüpft hat, speichert es in Nextcloud; die Zusammenarbeit läuft weiter direkt zwischen den Browsern.
- Offline sind die Nextcloud-Aktionen deaktiviert.
- Wenn keine Verbindung möglich ist, weil der Server diese Website blockiert, muss Ihre IT-Abteilung sie zulassen (CORS). Der Kontodialog zeigt, was sie dafür braucht.`,
  },
  handin: {
    title: 'Arbeiten abgeben',
    keywords: 'abgeben einreichen hausaufgabe aufgabe lehrer schüler zip pdf hochladen dateiablage abgabe',
    body: `**Für Schülerinnen und Schüler.** Klicken Sie auf **Abgeben** (neben Teilen). Ofimeo lädt eine ZIP-Datei mit Ihrem Namen und dem Titel herunter, die das Dokument in seinen ursprünglichen Formaten enthält (zum Beispiel .odt und .docx oder .pptx und Bilder der Folien).

- Wenn Sie Ihren Namen noch nicht eingegeben haben, werden Sie danach gefragt: Er kommt in den Dateinamen.
- Laden Sie die ZIP-Datei hoch oder senden Sie sie Ihrer Lehrkraft, wie vereinbart (Lernplattform, E-Mail…).
- **Drucken / Als PDF speichern** erstellt bei Bedarf ein PDF: Wählen Sie „Als PDF speichern“ als Drucker.
- **In einen Nextcloud-Freigabelink hochladen…**: Wenn Ihre Lehrkraft Ihnen einen Upload-Link gegeben hat, geht die Datei direkt dorthin. Sie brauchen kein Nextcloud-Konto.
- **In Moodle abgeben…**: Wenn Ihre Schule Moodle nutzt, geben Sie direkt in einer Aufgabe ab. Siehe [Moodle](help:moodle).

**Für Lehrkräfte.**
- Geben Sie allen ein eigenes Arbeitsblatt mit einem Link **Erstellt eine Kopie** (siehe [Teilen](help:sharing)).
- Erstellen Sie in Ihrer Nextcloud einen Upload-Link („Dateiablage“) und geben Sie ihn der Klasse.
- Öffnen Sie die PDFs der Klasse oder die abgegebenen ZIP-Dateien in [Ofimeo PDF](help:pdf), um sie zu korrigieren.
- Für Quizze verwenden Sie [Ofimeo Formulare](help:forms).`,
  },
  moodle: {
    title: 'Moodle',
    keywords: 'moodle virtuelles klassenzimmer lernplattform aufgabe hausaufgabe abgabetermin frist note bewertung feedback abgeben kurs',
    body: `Verbinden Sie Ofimeo mit dem Moodle Ihrer Schule, um Ihre Aufgaben auf dem Startbildschirm zu sehen und Ihre Arbeit abzugeben, ohne Dateien herunter- und wieder hochzuladen.

## Verbinden
Öffnen Sie [Moodle](action:moodle) (Moodle-Schaltfläche auf dem Startbildschirm oder Datei ▸ Moodle-Konto…). Geben Sie die Moodle-Adresse (vielleicht hat Ihre Schule sie schon eingetragen), Ihren Benutzernamen und Ihr Passwort ein und wählen Sie **Verbinden**.
- Ihr Passwort geht nur an Moodle, einmal. Ofimeo speichert in diesem Browser nur einen Moodle-Schlüssel und Ihren Namen. **Trennen** entfernt beides.
- Wenn Ihre Schule sich über eine Webseite bei Moodle anmeldet (Google, Microsoft oder ein Schulzugang, „Single Sign-on“), funktioniert diese Anmeldung in Ofimeo noch nicht. Ofimeo weist darauf hin, wenn es das erkennt. Geben Sie dann wie gewohnt mit [Abgeben](help:handin) ab und laden Sie die Datei in Moodle hoch.

## Moodle-Aufgaben
Der Bereich **Moodle-Aufgaben** auf dem Startbildschirm zeigt die Aufgaben Ihrer Kurse. Zuerst die offenen, nach Abgabetermin sortiert, danach die abgegebenen und bewerteten.
- Öffnen Sie eine Aufgabe, um die Beschreibung zu lesen, ihre Dateien herunterzuladen (**In Ofimeo öffnen** erstellt Ihre eigene Kopie) und Abgabetermin, letzten Abgabetag, Ihren Status, Ihre Note und das Feedback der Lehrkraft zu sehen, sobald sie freigegeben sind.
- **Aktualisieren** lädt die Liste neu. Ohne Verbindung sehen Sie die letzte Liste mit dem Zeitpunkt der Aktualisierung.
- Die Liste dient nur der Information. Bearbeiten Sie Aufgaben, die nicht als Datei abgegeben werden, in Moodle selbst.

## In Moodle abgeben
Wählen Sie in jeder App **Abgeben** (oder Datei ▸ In Moodle abgeben…):
1. Wählen Sie die Aufgabe. Nur offene Aufgaben, die Dateien annehmen, werden angezeigt.
2. Wählen Sie das Format. Ofimeo schlägt eines vor, das die Aufgabe annimmt. PDF wird in den Apps angeboten, die es exportieren; sonst nutzen Sie **Eine Datei von diesem Gerät…**.
3. Hat die Aufgabe eine Abgabeerklärung, lesen und bestätigen Sie sie.
4. Wählen Sie **Abgeben**. Ofimeo lädt die Datei hoch und speichert sie als Ihre Abgabe. Hat die Aufgabe eine Schaltfläche zum Einreichen, wird sie auch zur Bewertung eingereicht.

Erneutes Abgeben, solange die Aufgabe offen ist, ersetzt Ihre Datei. Lehnt Moodle die Datei ab (zu groß, falscher Typ, zu viele Dateien), sagt die Meldung warum.

## Datenschutz
Ihre Moodle-Arbeit geht nur an das Moodle Ihrer Schule, direkt aus diesem Browser oder über das schuleigene Relay. Sie wird nie an die Personen gesendet, mit denen Sie Dokumente teilen.`,
  },
  network: {
    title: 'Schulnetze: Verbindungstest und Relay',
    keywords: 'netzwerk wlan firewall filter blockiert nur sie keine verbindung relay turn stun nostr it-abteilung proxy',
    body: `Die Beteiligten verbinden sich direkt miteinander. Öffentliche Relays dienen nur dazu, einander zu finden. Manche Schulnetze blockieren das: Der Status bleibt dann bei **Nur Sie**.

## Verbindungstest
Öffnen Sie [Hilfe ▸ Verbindungstest…](action:connection) oder klicken Sie auf den Verbindungsstatus neben Teilen. Er prüft den Internetzugang, die Relays, ob direkte Verbindungen möglich sind und wie jede Person im Dokument verbunden ist. Am Ende steht eine verständliche Einschätzung. **Bericht kopieren** kopiert die Details für Ihre IT-Abteilung.

## Häufige Ursachen
- Ein Inhaltsfilter blockiert die öffentlichen Relays.
- Eine strenge Firewall blockiert direkte Verbindungen.
- Das WLAN isoliert die Geräte voneinander.

## Ofimeo Relay
Für solche Netze kann eine Schule **Ofimeo Relay** betreiben, ein kleines Programm für das eigene Netz (Windows, macOS, Linux oder Raspberry Pi). Es hilft Geräten, sich zu finden und zu erreichen.
- Fügen Sie seine Adresse im Verbindungstest ein oder öffnen Sie einen Link mit **?relay=** und seiner Adresse. Der Browser merkt sie sich.
- Freigabelinks enthalten das Relay, sodass Schülerinnen und Schüler es beim Öffnen des Links erhalten.
- Sie können festlegen, nur das Schul-Relay zu verwenden.

## Synchronisieren, ohne gleichzeitig online zu sein
Normalerweise werden Änderungen nur übertragen, während zwei Personen das Dokument gleichzeitig geöffnet haben. Mit **Synchronisieren, ohne gleichzeitig online zu sein** wartet eine verschlüsselte Kopie der Änderungen auf die anderen: Eine Schülerin bearbeitet im Unterricht und macht zu Hause weiter, die Lehrkraft korrigiert abends.
- Aktivieren Sie es im Verbindungstest unter **Synchronisieren, ohne gleichzeitig online zu sein**: auf dem Schul-Relay (wenn es Kopien speichert) und/oder in einem Nextcloud-Ordner. Ihre Schule kann es für alle aktivieren.
- Der Status neben dem Speicherstatus zeigt **Mit … synchronisiert**, sobald Ihre Änderungen gespeichert sind, oder **Wartet auf Synchronisierung**, solange Sie offline sind (sie werden später gesendet).
- Alles wird in Ihrem Browser mit dem Schlüssel aus dem Dokumentlink verschlüsselt. Das Relay oder Nextcloud sieht nur verschlüsselte Daten, ihre Größe und wann sie sich ändern.
- Links nur zum Ansehen laden Änderungen herunter, können aber nie welche hochladen. Verwenden Sie bei Nextcloud einen mit den anderen geteilten Ordner.
- Kopien auf dem Schul-Relay werden nach einer Zeit ohne Änderungen gelöscht (standardmäßig 180 Tage).

Die IT-Abteilung findet die Installationsanleitung in der Projektdokumentation (docs/relay.md).`,
  },
  'school-setup': {
    title: 'Für Administratoren: Ofimeo in einer Schule installieren',
    keywords: 'administrator it abteilung installieren bereitstellen server docker raspberry windows konfiguration ofimeo.config.json gesperrt von ihrer schule festgelegt logo sprache webmcp vorlagen apps ausblenden',
    body: `Eine Schule kann eine eigene Kopie von Ofimeo in ihrem Netz betreiben und sie mit einer einzigen Datei, **ofimeo.config.json**, für alle einrichten.

## Installationswege
- **Docker**: ein Container mit der App und Ofimeo Relay (Dockerfile und docker-compose.yml sind im Projekt).
- **Nur Ofimeo Relay** auf einem Windows-Server, einem Linux-Rechner oder einem Raspberry Pi: Es kann auch die App ausliefern.
- **Beliebiger Webserver** (nginx, Apache, IIS): Kopieren Sie die erstellten Dateien. Die App hat keinen Serverteil.

## Die Konfiguration der Schule
[Hilfe ▸ Für Administratoren…](action:admin) öffnet ein Formular, das ofimeo.config.json erstellt. Es legt fest:
- Name und Logo der Schule, angezeigt auf der Startseite;
- die Standardsprache der Oberfläche und die Sprache neuer Dokumente;
- das Schul-Relay, weitere Relays und ob öffentliche Server verwendet werden dürfen;
- wo verschlüsselte Änderungen auf Personen warten dürfen, die offline sind;
- die beim Verbinden angebotenen Nextcloud-Server;
- ob KI-Assistenten (WebMCP) erlaubt sind und welche Apps und Vorlagen angeboten werden;
- die Datenschutzkontakte der Schule, angezeigt über den rechtlichen Links.

Legen Sie die Datei neben index.html (oder übergeben Sie sie Ofimeo Relay mit **--school-config**). Jeder Browser wendet sie beim Öffnen von Ofimeo an und behält eine Kopie für die Offline-Arbeit.

## Gesperrte Einstellungen
Von der Schule gesperrte Einstellungen zeigen **Von Ihrer Schule festgelegt** und können im Browser nicht geändert werden: die Sprache der Oberfläche, der Schalter für KI-Assistenten, das Schul-Relay und die Nextcloud-Server.

Die Schritt-für-Schritt-Anleitung für die IT-Abteilung steht in der Projektdokumentation (docs/deploy-school.md).`,
  },
  privacy: {
    title: 'Datenschutz',
    keywords: 'datenschutz privatsphäre dsgvo personenbezogene daten schüler minderjährige cookies tracking sicher verschlüsselt',
    body: `Ofimeo ist so gebaut, dass niemand außer Ihnen und den Personen, mit denen Sie teilen, Ihre Dokumente erhält.

- **Keine Konten, keine Cookies, keine Statistik, keine Werbung.** Die Website liefert nur das Programm, das danach in Ihrem Browser läuft.
- **Ihre Dokumente bleiben auf Ihrem Gerät** (im Browser). Einstellungen, Ihr Name und Nextcloud-Zugangsdaten werden ebenfalls nur hier gespeichert.
- **Beim Teilen** erhalten die anderen das Dokument, seine Kommentare und Versionen, den eingegebenen Namen und, da die Verbindung direkt ist, Ihre IP-Adresse. Die Daten gehen verschlüsselt direkt von Browser zu Browser. Öffentliche Relays sehen nur verschlüsselte Verbindungsnachrichten.
- **Links sind Schlüssel**: Wer einen Link hat, erhält seinen Zugriff. Veröffentlichen Sie keine Bearbeitungslinks.
- **Nextcloud**: Ihr Passwort wird nur an Ihren Nextcloud-Server gesendet.
- **Diktieren** verwendet die Spracherkennung des Browsers, die den Ton an den Dienst des Browserherstellers senden kann.

## Tipps für den Unterricht
- Verwenden Sie einen Vornamen, Initialen oder einen Spitznamen.
- Keine sensiblen personenbezogenen Daten (Gesundheit, Familiäres) in geteilte Dokumente schreiben.

Lesen Sie die vollständige [Datenschutzerklärung](legal:privacy) und die [Informationen für Schulen](legal:schools).`,
  },
  shortcuts: {
    title: 'Tastenkombinationen',
    keywords: 'tastatur tastenkombinationen tastenkürzel shortcuts strg befehl mac f1 f10',
    body: `Diese Tasten funktionieren in jeder App (auf dem Mac ⌘ statt Strg):

- \`Strg+O\` Datei öffnen, \`Strg+P\` drucken, \`Strg+S\` in Nextcloud speichern (im Browser wird Ihre Arbeit ohnehin immer gespeichert)
- \`Strg+Z\` rückgängig, \`Strg+Y\` wiederholen
- \`Strg+X\` ausschneiden, \`Strg+C\` kopieren, \`Strg+V\` einfügen, \`Strg+A\` alles auswählen
- \`Strg+F\` suchen
- \`F10\` oder \`Alt+Umschalt+M\` zur Menüleiste; dann Pfeiltasten, \`Eingabe\` und \`Esc\`
- \`Strg+/\` oder \`F1\` alle Tastenkombinationen der aktuellen App anzeigen
- \`Alt+Umschalt+A\` Barrierefreiheit, \`Alt+Umschalt+R\` vorlesen, \`Alt+Umschalt+D\` diktieren

In Ofimeo Dokumente und Ofimeo Tabellen öffnet \`Strg+H\` Suchen und Ersetzen.

Die Menüs zeigen die Tastenkombination jedes Befehls daneben an.

[Tastenkombinationen dieser App anzeigen](action:shortcuts)`,
  },
  accessibility: {
    title: 'Barrierefreiheit',
    keywords: 'barrierefreiheit legasthenie schrift große schrift text zoom kontrast dunkles design bildschirmleser vorlesen diktieren sprache tastatur bewegung',
    body: `Öffnen Sie das [Barrierefreiheit-Panel](action:accessibility) mit der Barrierefreiheit-Schaltfläche oder \`Alt+Umschalt+A\`. Die Einstellungen werden in diesem Browser gespeichert und gelten für die ganze Suite; Ihre Dokumente ändern sich nicht.

- **Leseschriften**: OpenDyslexic oder Atkinson Hyperlegible für die Oberfläche und auf Wunsch für den Dokumenttext.
- **Textgröße** der Oberfläche sowie **Zeilen- und Zeichenabstand** zum Lesen.
- **Designs**: hell, dunkel, wie das System und zwei Designs mit hohem Kontrast.
- **Bewegung reduzieren**, **großer Mauszeiger**, **dicker Fokusrahmen**.
- **Leselineal** oder **Fokusmaske**, die dem Zeiger und dem Textcursor folgen.
- **Vorlesen** (\`Alt+Umschalt+R\`): liest die Auswahl, den Absatz oder das ganze Dokument mit den Stimmen des Browsers.
- **Diktieren** (\`Alt+Umschalt+D\`): schreibt, was Sie sagen. Braucht eine Verbindung und einen geeigneten Browser (Chrome, Edge).
- **Tastatur**: Alles lässt sich mit der Tastatur bedienen. \`F10\` führt zur Menüleiste, und mit \`Tab\` erscheint ein Link „Zum Inhalt springen“. Siehe [Tastenkombinationen](help:shortcuts).

Die Sprache der Oberfläche ändern Sie auf der Startseite oder im Panel.`,
  },
  spelling: {
    title: 'Rechtschreibung und Grammatik',
    keywords: 'rechtschreibung rechtschreibprüfung grammatik wörterbuch sprache tippfehler fehler unterstreichung f7 korrigieren',
    body: `Alle Apps prüfen beim Tippen Rechtschreibung (rote Wellenlinie) und Grammatik (blau) in der Sprache des Dokuments. Die Prüfung läuft in Ihrem Browser: Der Text wird nirgendwohin gesendet, außer Sie wählen in der Textverarbeitung einen LanguageTool-Server.

## Wo
- **Dokumente**: das ganze Dokument. Rechtsklick auf ein unterstrichenes Wort zeigt Vorschläge.
- **Tabellen**: die Zelle, die Sie bearbeiten. Formeln und Zahlen werden übersprungen.
- **Präsentationen und Diagramme**: Beschriftungen und Textfelder beim Tippen sowie Sprechernotizen.
- **Formulare**: Titel, Beschreibungen und Optionen. Schriftliche Antworten werden geprüft, wenn das Formular es erlaubt (**Einstellungen ▸ Rechtschreibprüfung für Antwortende erlauben**: bei Umfragen an, bei Quizzen aus, da es Antworten verraten könnte).
- **PDF**: Textfelder, Kommentare und Antworten.
- **Zeichnen**: der Text, den Sie tippen.

## Dialog Rechtschreibung und Grammatik
**Extras ▸ Rechtschreibung und Grammatik…** (\`F7\`) geht die Fehler einzeln durch: alle Zellen aller Blätter, alle Folien mit ihren Notizen, alle Seiten eines Diagramms, alle Fragen eines Formulars, alle Textfelder und Kommentare eines PDFs, alle Texte einer Zeichnung. Er zeigt, wo sich jeder befindet (zum Beispiel „Tabelle1 · B3“), und markiert ihn. **Ändern** oder **Alle ändern** korrigiert ihn, **Ignorieren** überspringt ihn und **Zum Wörterbuch hinzufügen** akzeptiert das Wort von da an.

## Sprache und Wörterbuch
- **Extras ▸ Sprache** legt die Sprache des Dokuments fest (Englisch USA oder UK, Spanisch mehrerer Länder, Galicisch, Französisch, Deutsch). Sie wird mit dem Dokument gespeichert, sodass alle es in derselben Sprache prüfen.
- **Extras ▸ Persönliches Wörterbuch…** listet die hinzugefügten Wörter. Sie gelten für alle Apps und Dokumente dieses Browsers.
- **Extras ▸ Rechtschreibung während der Eingabe prüfen** / **Grammatik während der Eingabe prüfen** schalten die Unterstreichungen in allen Apps aus.`,
  },
  'math-graph': {
    title: 'Mathematische Graphen und Geometrie',
    keywords: 'Grafikrechner, Funktion, zeichnen, Schieberegler, geogebra, desmos, Geometrie, Mittelpunkt, Konstruktion, Wertetabelle',
    body: `Fügen Sie mit **Einfügen ▸ Mathematischer Graph…** einen **Grafikrechner** in ein Dokument oder eine Folie ein. Der Graph wird im Dokument als bearbeitbares Bild gespeichert: Doppelklicken Sie darauf (oder wählen Sie ihn aus und drücken Sie \`Eingabe\`), um ihn zu ändern. Personen mit einem Leselink können ihn öffnen und erkunden, aber nicht ändern.

## Funktionen und Kurven
Geben Sie unter **Algebra** einen Ausdruck pro Zeile ein:
- Funktionen: \`y = a x^2 + b\`, \`f(x) = sin(x)\`, \`g(x) = f(x - 1)\`, \`f'(x)\` (Ableitung)
- Gleichungen und Ungleichungen: \`x^2 + y^2 = 9\`, \`y > x - 1\`, \`x = 3\`
- Kurven: \`(cos t, sin t)\` (Parameterdarstellung), \`r = 2cos(3θ)\` (Polarkoordinaten)
- Punkte: \`A = (1, 2)\`

Buchstaben ohne Wert (wie \`a\`) werden beim Drücken von \`Eingabe\` zu **Schiebereglern**. Mit ▶ wird ein Schieberegler animiert.

Die **Messwerte** nennen Nullstellen, Minimum und Maximum, den y-Achsenabschnitt und die Schnittpunkte zweier Funktionen als Text (auch für Screenreader). **Tabelle** zeigt eine Wertetabelle. **Einstellungen** enthält Fenster, Gitter, Achsen, Gradmaß und Bildgröße.

## Geometrie
Wählen Sie unter **Geometrie** ein Werkzeug und klicken Sie in den Graphen: Punkt, Strecke, Gerade, Strahl, Kreis, Vieleck, Mittelpunkt, Senkrechte, Parallele, Schnittpunkt und Winkel. Konstruktionen passen sich an, wenn Sie Punkte ziehen. Sie können auch Befehle wie \`M = Mittelpunkt(A, B)\` oder \`Fläche(poly1)\` eingeben und die Koordinaten freier Punkte in der Liste ändern.

## Tastatur
Im Graphen: Die Pfeiltasten verschieben den ausgewählten Punkt (über seine Zeile auswählen), verfolgen die ausgewählte Funktion oder verschieben die Ansicht; \`+\` und \`-\` zoomen; \`0\` setzt die Ansicht zurück.

## Dateien
Word- und OpenDocument-Dateien speichern den Graphen als Bild mit der Konstruktion im Titel. Öffnen Sie die Datei wieder in Ofimeo, ist der Graph weiter bearbeitbar. PDF und Druck verwenden das Bild. **Als SVG herunterladen** und **Als PNG herunterladen** speichern das Bild.`,
  },
  writer: {
    title: 'Ofimeo Dokumente (Textverarbeitung)',
    keywords: 'textverarbeitung dokument word docx odt seite inhaltsverzeichnis zitat literaturverzeichnis kommentar vorschlag änderungen nachverfolgen überprüfen korrigieren',
    body: `Eine Textverarbeitung mit echten Seiten, wie Sie sie kennen.

## Schreiben
- Verwenden Sie die Menüs (Datei, Bearbeiten, Ansicht, Einfügen, Format, Tabelle, Verweise, Extras, Überprüfen) und die Symbolleiste. Ein Rechtsklick bietet weitere Optionen.
- Absatzformate (Titel, Überschriften…) gliedern den Text und bilden das **Inhaltsverzeichnis** (Einfügen oder Verweise ▸ Inhaltsverzeichnis).
- **Verweise** bietet Zitate und ein Literaturverzeichnis im Stil APA, MLA oder Chicago.
- Papierformat, Ränder und Ausrichtung finden Sie unter Datei ▸ Seite einrichten…

## Überprüfen (Lehrkräfte korrigieren Arbeiten)
- **Kommentare**: Text markieren und \`Strg+Alt+M\` drücken (oder Überprüfen ▸ Kommentar). Personen mit Kommentarlink können ebenfalls kommentieren.
- **Vorschläge**: Wechseln Sie den Modus von **Bearbeiten** zu **Vorschlagen**. Ihre Änderungen werden markiert, und die Autorin oder der Autor nimmt sie an oder lehnt sie ab.
- Überprüfen ▸ Autorschaft anzeigen färbt den Text danach, wer ihn geschrieben hat.

## Diagramme
**Einfügen ▸ Diagramm…** fügt ein Säulen-, Balken-, Linien-, Flächen-, Kreis-, Ring- oder Punktdiagramm ein. Nehmen Sie die Daten aus einer Tabelle Ihrer Bibliothek (Blatt und Bereich wählen) oder geben Sie sie in die kleine Tabelle ein. Ein mit einer Tabelle **verknüpftes** Diagramm aktualisiert sich selbst, wenn sich diese Tabelle in diesem Browser ändert; **Aus der Quelle aktualisieren** (am Diagramm oder im Kontextmenü) tut es sofort. Das Dokument behält eine Kopie der Daten, sodass alle das Diagramm auch ohne die Tabelle sehen. Ziehen Sie die Ecke, um die Größe zu ändern; ein Doppelklick ändert es oder fügt eine Beschriftung hinzu. Word-Dateien behalten es als echtes Diagramm.

## Serienbrief
**Werkzeuge ▸ Serienbrief…** erstellt einen Brief, eine Urkunde oder ein Zeugnis pro Zeile einer Tabelle:
1. Wählen Sie die Daten: eine Tabelle Ihrer Bibliothek oder eine CSV-, Excel- oder OpenDocument-Datei, das Blatt und die Zeile mit den Feldnamen.
2. Klicken Sie auf ein Feld, um es an der Cursorposition einzufügen, zum Beispiel «Name». **Bedingter Text…** fügt Text nur ein, wenn ein Feld einen Wert hat (zum Beispiel „wenn Ergebnis gleich Bestanden“).
3. Behalten Sie bei Bedarf mit dem Filter nur einige Zeilen.
4. Aktivieren Sie **Daten eines Datensatzes anzeigen** und prüfen Sie mit den Pfeilen jeden einzelnen.
5. Erstellen Sie ein **Neues Dokument** mit allen (eines pro Seite), ein **PDF** oder ein **ZIP** mit Word- oder PDF-Dateien, benannt nach einem Feld.

Word-Dateien behalten die Felder (MERGEFIELD), sodass die Vorlage auch in Word funktioniert.

## Dateien
Öffnet und speichert Word (.docx) und OpenDocument (.odt); öffnet auch Word 97-2003 (.doc), RTF, .html, .txt und Markdown (.md, mit Überschriften, Listen, Links, Code und Tabellen) und speichert Markdown. Enthält eine Datei etwas, das Ofimeo nicht übernehmen kann (zum Beispiel Textfelder oder Endnoten einer .doc-Datei), nennt eine Meldung es einmal. Drucken oder als PDF speichern mit Datei ▸ Drucken. Ansicht ▸ Zoom (oder \`Strg++\`, \`Strg+-\`, \`Strg+0\`) ändert den Zoom.`,
  },
  sheet: {
    title: 'Ofimeo Tabellen (Tabellenkalkulation)',
    keywords: 'tabellenkalkulation tabelle excel xlsx ods csv formel funktion diagramm pivot zellen notenbuch',
    body: `Tabellen mit Formeln, Diagrammen und mehreren Blättern.

- Tippen Sie \`=\`, um eine Formel zu beginnen, zum Beispiel =SUM(B2:B30) oder =AVERAGE(C2:C30). Hunderte Funktionen stehen bereit.
- **Einfügen ▸ Diagramm…** erstellt aus den markierten Zellen ein Säulen-, Balken-, Linien-, Kreis- oder Punktdiagramm. Diagramme passen sich an, wenn sich die Werte ändern.
- **Daten** bietet Sortieren, Filter, Gültigkeitsprüfung und **Pivot-Tabelle…**.
- **Format** bietet Zahlenformate, verbundene Zellen und bedingte Formatierung; Rahmen finden Sie in der Symbolleiste.
- Die Statusleiste zeigt Summe, Mittelwert und Anzahl der markierten Zellen.
- Mehrere Personen können gleichzeitig bearbeiten; ihre Auswahl sehen Sie in ihren Farben.

## Screenreader und Tastatur
Das Raster wird als Bild gezeichnet. **Ansicht ▸ Barrierefreie Tabellenansicht** (\`Alt+Umschalt+T\` oder der Link „Zur barrierefreien Tabellenansicht wechseln“ oben auf der Seite) zeigt das aktuelle Tabellenblatt als echte Tabelle, die Screenreader lesen können. Die Pfeiltasten wechseln zwischen Zellen, und jede Zelle wird mit Adresse, Wert und Formel vorgelesen; \`Eingabe\` oder \`F2\` bearbeitet sie, \`Entf\` leert sie, \`Strg+Z\` macht rückgängig, \`Strg+Pos1\` / \`Strg+Ende\` springen zum Anfang und Ende der Daten und \`Strg+Bild auf\` / \`Strg+Bild ab\` wechseln das Tabellenblatt. Änderungen erreichen die anderen sofort. Diagramme stehen unter der Tabelle mit einer Zusammenfassung ihrer Werte und **Diagrammdaten als Tabelle** (auch im Rechtsklickmenü des Diagramms und unter Bearbeiten, wenn ein Diagramm ausgewählt ist). Im normalen Raster wird die ausgewählte Zelle beim Bewegen vorgelesen, und die Pfeiltasten wechseln zwischen den Blattregistern.

## Dateien
Öffnet und speichert Excel (.xlsx), OpenDocument (.ods) und CSV. Diagramme werden als echte Diagramme gespeichert, die Excel und LibreOffice bearbeiten können. Das aktuelle Blatt drucken oder als PDF speichern mit Datei ▸ Drucken.

Die Vorlagen für Notenbuch, Anwesenheit und Bewertungsraster auf der Startseite sind sofort einsetzbar.`,
  },
  draw: {
    title: 'Ofimeo Zeichnung (Whiteboard)',
    keywords: 'zeichnung whiteboard skizze zeichnen freihand excalidraw brainstorming tafel formen pfeile',
    body: `Ein Whiteboard zum Zeichnen von Hand oder mit Formen, Pfeilen und Text, allein oder mit der Klasse.

- Wählen Sie ein Werkzeug in der Werkzeugleiste auf der Zeichenfläche und ziehen Sie, um zu zeichnen. Pfeile bleiben an den Formen haften, die sie verbinden.
- Das Feld neben der Auswahl ändert Farben, Linien, Füllung und Schrift.
- Halten Sie die \`Leertaste\` gedrückt und ziehen Sie, um sich zu bewegen; \`Strg\` und das Mausrad zoomen.
- Alle in der Zeichnung sehen die Zeiger und Änderungen der anderen live.
- Bilder lassen sich einfügen oder auf die Zeichenfläche ziehen.

## Dateien
Datei ▸ Herunterladen als speichert PNG- oder SVG-Bilder oder eine .excalidraw-Datei, die Sie später wieder öffnen können. Datei ▸ Bild exportieren… bietet weitere Optionen (Hintergrund, dunkler Modus, Maßstab).`,
  },
  diagram: {
    title: 'Ofimeo Diagramme',
    keywords: 'diagramm flussdiagramm concept-map mindmap uml netzwerk drawio visio formen verbinder zeitleiste',
    body: `Diagramme, Flussdiagramme und Concept-Maps, kompatibel mit draw.io.

- Ziehen Sie Formen aus dem **Formenbereich** auf die Zeichenfläche oder klicken Sie auf eine, um sie einzufügen. Die Suche findet Formen nach Namen.
- Ziehen Sie von einem Verbindungspunkt einer Form zu einer anderen Form, um sie zu verbinden.
- Doppelklicken Sie auf eine Form, um ihre Beschriftung einzugeben.
- Der **Formatbereich** ändert Füllung, Linie, Text, Pfeile, Position und Größe.
- **Anordnen** bietet Ausrichten, Gruppieren und automatische Layouts (Baum, Kreis…).
- **Ansicht ▸ Weitere Formen…** fügt Bibliotheken wie UML, Netzwerke, Grundrisse, Elektrotechnik oder BPMN hinzu.
- Ein Diagramm kann mehrere Seiten haben (Registerkarten unten).

## Dateien
Öffnet und speichert draw.io-Dateien (.drawio); öffnet Visio-Zeichnungen (.vsdx). Laden Sie PNG- oder SVG-Bilder herunter oder drucken Sie und speichern Sie als PDF.

Die Startseite bietet Vorlagen für Concept-Maps, Zeitleisten, Flussdiagramme und grafische Organizer.`,
  },
  slides: {
    title: 'Ofimeo Präsentationen',
    keywords: 'präsentation folien powerpoint pptx odp präsentieren beamer referent notizen animation design layout folgen',
    body: `Präsentationen für den Unterricht.

- Der **Folienbereich** links zeigt die Folien. Klicken Sie mit der rechten Maustaste auf eine Miniatur, um eine Folie hinzuzufügen, zu duplizieren, zu verschieben oder zu löschen und ihr Layout oder ihren Hintergrund zu ändern.
- Wählen Sie für jede Folie ein **Design** und ein **Layout**. Klicken Sie auf die Platzhalter, um Titel und Text hinzuzufügen.
- Fügen Sie Bilder, Formen, Tabellen und Formeln ein. Schreiben Sie die **Notizen für den Referenten** unter die Folie.
- **Einfügen ▸ Diagramm…** fügt ein Diagramm aus einer Tabelle Ihrer Bibliothek (aktualisiert, wenn sie sich ändert) oder mit eingegebenen Daten ein. PowerPoint-Dateien behalten es als echtes Diagramm.
- **Animationen** und **Übergänge** lassen Objekte und Folien nacheinander erscheinen.
- **Präsentieren** zeigt die Folien im Vollbild: Pfeiltasten oder Klick zum Weitergehen, \`L\` für einen Laserpointer, \`B\` für einen schwarzen Bildschirm, \`Esc\` zum Beenden. Die **Referentenansicht** zeigt Notizen und einen Timer in einem zweiten Fenster.
- Während Sie präsentieren, können alle anderen in der Präsentation Ihnen **folgen** (Dem Präsentierenden folgen), auch mit einem Ansichtslink.

## Dateien
Öffnet PowerPoint (.pptx). Speichert PowerPoint (.pptx), OpenDocument (.odp), PDF und Bilder der Folien.`,
  },
  forms: {
    title: 'Ofimeo Formulare (Formulare und Quizze)',
    keywords: 'formular quiz test prüfung umfrage fragebogen fragen antworten bewerten note punkte selbsteinschätzung',
    body: `Formulare, Umfragen und Quizze, die sich selbst auswerten.

## Für Lehrkräfte
- **Frage** fügt eine Frage hinzu; wählen Sie ihren Typ: Kurzantwort, Absatz, Multiple Choice, Kontrollkästchen, Dropdown, Skala, Raster, Datum, Uhrzeit oder Zahl. **Abschnitt** erstellt eine neue Seite.
- Aktivieren Sie **Quiz**, um richtige Antworten, Punkte und Rückmeldungen festzulegen. Die Bewertung erfolgt automatisch; Absätze werden von Hand bewertet.
- **Senden** liefert den Link und einen QR-Code für die Klasse. Sie sehen nur das Formular, nicht die Antworten der anderen.
- Antworten kommen an, wenn Ihr Browser (oder der einer anderen bearbeitenden Person) online ist. Sie sehen sie unter **Antworten**, mit Diagrammen und Statistiken, und können sie in eine Tabelle exportieren.

## Für Schülerinnen und Schüler
- Namen eingeben, die Fragen beantworten und **Senden** drücken.
- Ohne Verbindung wird die Antwort gesendet, sobald die Verbindung wieder da ist.
- Ist keine Lehrkraft online, verwenden Sie **Meine Antwort herunterladen** und geben Sie die Datei Ihrer Lehrkraft.

Antworten werden im Browser der Schülerin oder des Schülers verschlüsselt: Nur die Bearbeitenden des Formulars können sie lesen.`,
  },
  pdf: {
    title: 'Ofimeo PDF (PDFs korrigieren)',
    keywords: 'pdf korrigieren bewerten kommentieren anmerken hervorheben stift stempel unterschrift notiz acrobat abgabe zip',
    body: `Korrigieren und kommentieren Sie PDF-Dateien, zum Beispiel die abgegebenen Arbeiten Ihrer Klasse.

- Öffnen Sie ein PDF auf der Startseite, über Datei ▸ Öffnen… oder öffnen Sie eine Abgabe-ZIP-Datei: Die enthaltenen PDFs werden aufgelistet.
- Werkzeuge: hervorheben, unterstreichen und durchstreichen (Text markieren), Stift und Radierer, Textfelder, Formen, **Stempel** (Haken, Kreuz, „Gut“, eine Note…), **Notizen** und Ihre **Unterschrift**.
- Tasten: \`H\` hervorheben, \`P\` Stift, \`T\` Textfeld, \`N\` Notiz, \`S\` Stempel, \`G\` Unterschrift, \`Esc\` zurück zu Auswählen.
- Tastatur: Wählen Sie ein Werkzeug (zum Beispiel \`T\`, \`N\`, \`R\` oder \`S\`) und drücken Sie die \`Eingabetaste\`, um es in der Mitte der angezeigten Seite zu platzieren. Im Kommentarbereich macht **Kommentar hinzufügen** dasselbe für Notizen.
- Teilen Sie das PDF, um gemeinsam zu korrigieren oder damit die Person Ihre Anmerkungen lesen kann.

## Seiten
Das Menü **Seite** (oder ein Rechtsklick auf eine Miniatur) dreht eine Seite nach links oder rechts (\`Strg+[\` / \`Strg+]\`), verschiebt sie nach oben oder unten, fügt leere Seiten ein und löscht Seiten. Ziehen Sie Miniaturen, um sie neu anzuordnen (oder \`Alt+↑\` / \`Alt+↓\` auf einer Miniatur). Anmerkungen bleiben bei ihrer Seite, und Rückgängig macht jede Änderung rückgängig. Das heruntergeladene PDF folgt der neuen Reihenfolge und Drehung.

## Dateien
Datei ▸ Herunterladen als speichert das **PDF mit Anmerkungen**: „bearbeitbar“ behält sie als Anmerkungen, die andere PDF-Programme ändern können, „reduziert“ zeichnet sie in die Seiten. Die Abgabe enthält beide. Textfelder und Stempel behalten Symbole wie π, √, ≈, → und ✓.

Ein **passwortgeschütztes PDF** fragt beim Öffnen nach dem Passwort. Das Dokument behält die ursprüngliche geschützte Datei; das Passwort wird darin weder gespeichert noch an jemanden gesendet, daher gibt es jede Person beim Öffnen (und Sie in einem neuen Tab) erneut ein. Wenn Sie abbrechen, wird nichts hinzugefügt.`,
  },
  notebook: {
    title: 'Ofimeo Notizbuch (Unterrichtsnotizen)',
    keywords: 'notizbuch onenote notizen mitschrift abschnitt seite unterseite tag aufgabe tinte stift eingabestift textmarker zeichnen labor lesetagebuch',
    body: `Unterrichtsnotizen wie in einem Ordner: **Abschnitte** (farbige Register) enthalten **Seiten**, und Seiten können **Unterseiten** haben.

## Abschnitte und Seiten
- **Abschnitt hinzufügen** und **Seite hinzufügen** findest du im linken Bereich. Ziehe Seiten und Abschnitte, um sie umzusortieren, oder lege eine Seite auf dem Register eines anderen Abschnitts ab, um sie dorthin zu verschieben. Mit der Tastatur: \`Alt+↑\` / \`Alt+↓\`.
- Die Schaltfläche **⋯** einer Seite (oder ein Rechtsklick) macht sie zur Unterseite, verschiebt sie in einen anderen Abschnitt, exportiert, druckt oder löscht sie.
- **Notizbuch durchsuchen** (\`Strg+F\`) sucht in den Titeln und im Text aller Seiten.
- Auf dem Handy öffnet die Schaltfläche **Abschnitte und Seiten** oben auf der Seite diese als Bereich.

## Schreiben
- Eine Seite hat einen Titel, ihr Erstellungsdatum und freien Text mit Überschriften, Listen, Checklisten, Tabellen, Bildern, Links, Formeln und Code.
- Füge Bilder und Dateien ein oder ziehe sie auf die Seite: Sie werden im Notizbuch gespeichert (große Bilder werden verkleinert; andere Dateien bis 5 MB).
- **Tags** markieren einen Absatz als **Aufgabe**, **Wichtig**, **Frage** oder **Merken** (Symbolleiste ▸ Tag oder \`Strg+Umschalt+1\` bis \`4\`). Klicke auf das Kästchen einer Aufgabe, um sie abzuhaken. **Tag-Übersicht** listet die markierten Absätze aller Seiten auf.

## Zeichnen
Wähle **Stift**, **Textmarker** oder **Radiergummi** in der Symbolleiste (\`Alt+2\`, \`Alt+3\`, \`Alt+4\`; \`Alt+1\` oder \`Esc\` zurück zum Schreiben). Mit einem Eingabestift wird der Strich dicker, je fester du drückst. Mit **Zeichnen ▸ Mit dem Eingabestift zeichnen** zeichnet der Eingabestift immer, während Finger oder Maus Text auswählen. Der Radiergummi entfernt ganze Striche; Rückgängig holt sie zurück.

## Gemeinsam
Teile das Notizbuch, um gemeinsam darin zu schreiben und zu sehen, wer auf welcher Seite ist. Kommentiere mit \`Strg+Alt+M\`, gib es ab und finde frühere Versionen unter Datei ▸ Versionsverlauf.

## Dateien
- Datei ▸ Herunterladen als: das ganze Notizbuch als Word, OpenDocument, PDF, Markdown oder als **ZIP mit Markdown** (ein Ordner pro Abschnitt, mit Bildern und Tinte). **Aktuelle Seite** und **Aktueller Abschnitt** exportieren nur diese.
- Drucken (\`Strg+P\`) druckt die geöffnete Seite; **Abschnitt drucken…** druckt alle Seiten des Abschnitts.
- Datei ▸ Öffnen… importiert Markdown-Dateien oder ein ZIP mit Markdown. Ein aus Ofimeo exportiertes ZIP bringt Abschnitte, Farben, Unterseiten und Tinte zurück. **Ordner mit Markdown-Dateien importieren…** übernimmt einen ganzen Ordner. OneNote-Dateien (.one) können nicht importiert werden: Exportiere sie zuerst in OneNote als Word oder PDF.`,
  },
}

export default articles
