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

[Die Einführung erneut anzeigen](action:tour)`,
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
- Dokumente, die vor den Berechtigungslinks entstanden sind, lassen sich nur mit Bearbeitungslinks teilen. Mit Datei ▸ Kopie erstellen erhalten Sie alle Linkarten.`,
  },
  offline: {
    title: 'Offline arbeiten und wo Ihre Daten liegen',
    keywords: 'offline internet verbindung installieren app pwa speicher indexeddb browserdaten löschen verloren gerät computer',
    body: `Ihre Dokumente werden **in diesem Browser auf diesem Gerät** gespeichert (in seinem IndexedDB-Speicher). Sie werden auf keinen Server hochgeladen. Der Speicherstatus in der Statusleiste zeigt **In diesem Browser gespeichert**.

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

**Für Lehrkräfte.**
- Geben Sie allen ein eigenes Arbeitsblatt mit einem Link **Erstellt eine Kopie** (siehe [Teilen](help:sharing)).
- Erstellen Sie in Ihrer Nextcloud einen Upload-Link („Dateiablage“) und geben Sie ihn der Klasse.
- Öffnen Sie die PDFs der Klasse oder die abgegebenen ZIP-Dateien in [Ofimeo PDF](help:pdf), um sie zu korrigieren.
- Für Quizze verwenden Sie [Ofimeo Formulare](help:forms).`,
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

Die IT-Abteilung findet die Installationsanleitung in der Projektdokumentation (docs/relay.md).`,
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

## Dateien
Öffnet und speichert Word (.docx) und OpenDocument (.odt); öffnet auch .html, .txt und .md. Drucken oder als PDF speichern mit Datei ▸ Drucken.`,
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
- Teilen Sie das PDF, um gemeinsam zu korrigieren oder damit die Person Ihre Anmerkungen lesen kann.

## Dateien
Datei ▸ Herunterladen als speichert das **PDF mit Anmerkungen**: „bearbeitbar“ behält sie als Anmerkungen, die andere PDF-Programme ändern können, „reduziert“ zeichnet sie in die Seiten. Die Abgabe enthält beide.`,
  },
}

export default articles
