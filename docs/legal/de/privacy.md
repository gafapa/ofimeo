# Datenschutzerklärung

{{siteName}} ist so gestaltet, dass der Inhaber weder Ihre Dokumente noch Ihre Daten erhält: Alles wird auf Ihrem Gerät gespeichert und verschlüsselt direkt mit den Personen ausgetauscht, mit denen Sie teilen. Diese Erklärung beschreibt, welche Daten es gibt, wo sie sich befinden und wer sie verarbeiten kann, gemäß Artikel 13 und 14 der Verordnung (EU) 2016/679 (DSGVO) und dem spanischen Organgesetz 3/2018 (LOPDGDD).

## 1. Das Wichtigste in Kürze

| Punkt | Information |
| --- | --- |
| Verantwortlicher | {{owner.name}} (Angaben in Abschnitt 2) |
| Zweck | Bereitstellung der Webanwendung und Schutz der Sicherheit der Website. Der Inhaber verarbeitet keine Dokumentinhalte. |
| Rechtsgrundlage | Berechtigtes Interesse an der Sicherheit der Website oder, wenn der Inhaber eine Behörde ist, Wahrnehmung einer Aufgabe im öffentlichen Interesse (Art. 6 Abs. 1 lit. f bzw. lit. e DSGVO). |
| Empfänger | Hosting-Anbieter ({{hosting.provider}}). Die Zusammenarbeit stützt sich auf Dienste Dritter, die in eigener Verantwortung handeln (Abschnitt 6). |
| Übermittlungen | Mögliche Übermittlungen in die USA und andere Länder (Abschnitt 9). |
| Rechte | Auskunft, Berichtigung, Löschung, Widerspruch, Einschränkung und Datenübertragbarkeit sowie Beschwerde bei der spanischen Datenschutzbehörde (Abschnitt 10). |
| Minderjährige | Siehe Abschnitte 11 und 12 sowie die [Informationen für Schulen](schools.md). |

## 2. Verantwortlicher

- Inhaber: {{owner.name}}
- Steuer-ID (NIF/CIF): {{owner.nif}}
- Anschrift: {{owner.address}}
- E-Mail für Datenschutzfragen: {{privacyEmail}}
- Datenschutzbeauftragter: {{#if dpo.email}}{{dpo.name}}, {{dpo.email}}{{else}}nicht benannt, da für den Inhaber nicht vorgeschrieben (Art. 37 DSGVO und Art. 34 LOPDGDD); Datenschutzanfragen werden unter {{privacyEmail}} beantwortet{{/if}}

Wenn eine Schule, eine Bildungsbehörde oder eine andere Einrichtung eine eigene Installation von {{siteName}} veröffentlicht, ist diese Einrichtung für ihre Installation verantwortlich und muss diese Erklärung mit ihren eigenen Angaben anpassen.

## 3. Wie {{siteName}} funktioniert und welche Daten der Inhaber erhält

{{siteName}} ist eine statische Website: Der Server liefert nur die Dateien der Anwendung aus, die anschließend in Ihrem Browser läuft, auch offline. Es gibt keine Benutzerkonten und keinen eigenen Anwendungsserver.

- **Der Inhaber erhält nicht** den Inhalt der Dokumente, Kommentare, den Versionsverlauf, die von Nutzerinnen und Nutzern eingegebenen Namen, die Schlüssel in Links oder Zugangsdaten externer Dienste.
- **Einen vom Inhaber beauftragten Server erreichen nur** die technischen Daten, die jeder Browser beim Laden einer Seite sendet: IP-Adresse, Datum und Uhrzeit, angeforderte Adresse, Browser und Betriebssystem (User-Agent) und verweisende Seite. Der Hosting-Anbieter protokolliert sie, um die Website auszuliefern und vor Missbrauch zu schützen.
- {{siteName}} verwendet keine Cookies, keine Reichweitenmessung, keine Werbung, kein Profiling und keine automatisierten Entscheidungen.

## 4. Auf Ihrem Gerät gespeicherte Daten

Die Anwendung speichert die für ihren Betrieb nötigen Informationen im Speicher Ihres Browsers (IndexedDB, localStorage und Cache des Service Workers). Diese Informationen werden nicht an den Inhaber gesendet. Einzelheiten finden Sie in der [Richtlinie zu Cookies und lokaler Speicherung](cookies.md).

| Information | Inhalt | Wer sie sehen kann |
| --- | --- | --- |
| Dokumente | Text, Tabellen, Zeichnungen, Bilder, Kommentare, Vorschläge, Versionsverlauf und Urheberschaft (Name und Farbe der Person, die den jeweiligen Teil geschrieben hat) | Sie und die Personen, mit denen Sie das Dokument teilen |
| Dokumentenverzeichnis | Titel, Daten, Zugriffsschlüssel jedes Dokuments und, falls verknüpft, der Pfad der Datei in Nextcloud | Nur Sie |
| Ihre Identität in der Anwendung | Der Name, den Sie eingeben, und eine Farbe | Sie und Ihre Mitwirkenden |
| Einstellungen | Sprache, Barrierefreiheit, Rechtschreibung, persönliches Wörterbuch, Zoom | Nur Sie |
| Nextcloud-Zugangsdaten (optional) | Serveradresse, Benutzername und App-Passwort | Nur Sie; sie werden nur an diesen Server gesendet |
| Sicherungen (optional) | `.ofimeo-backup`-Dateien, die Sie herunterladen, optional mit Passwort verschlüsselt, oder bei aktivierter automatischer Sicherung in Ihrer Nextcloud | Wer die Datei (und bei Verschlüsselung das Passwort) hat |
| Anwendungs-Cache | Programmdateien für die Offline-Nutzung | Enthält keine personenbezogenen Daten |

Bei persönlicher oder familiärer Nutzung führen Sie diese Verarbeitung selbst auf Ihrem Gerät durch. Bei schulischer Nutzung liegt sie in der Verantwortung der Schule oder Bildungsbehörde (Abschnitt 12).

## 5. Zusammenarbeit: was andere sehen

- **Freigabelinks.** Jeder Link enthält nach dem Zeichen `#` die Schlüssel des Dokuments. Browser senden diesen Teil des Links an keinen Server, aber jede Person mit dem Link kann mit der darin gewährten Berechtigung (bearbeiten, kommentieren, ansehen oder eine Kopie erstellen) auf das Dokument zugreifen. Behandeln Sie ihn wie ein Passwort.
- **Daten, die Ihre Mitwirkenden erhalten:** den Inhalt des Dokuments, seine Kommentare, Versionen und Urheberschaft, den von Ihnen gewählten Namen und die Farbe, Ihre Anwesenheit (Cursor, Auswahl, angezeigte Seite oder Folie) und, bedingt durch direkte Verbindungen, die IP-Adresse Ihrer Verbindung.
- **Übertragung.** Die Daten werden direkt zwischen Browsern über WebRTC übertragen und mit DTLS verschlüsselt; die Nachrichten zum Verbindungsaufbau werden mit dem Dokumentschlüssel verschlüsselt. Änderungen werden digital signiert, sodass nur Personen mit Bearbeitungsrecht das Dokument ändern können.
- **Kopien.** Alle Beteiligten behalten eine vollständige Kopie des Dokuments in ihrem Browser. Wenn Sie Ihre Kopie löschen, bleiben die der anderen erhalten.
- Empfehlung: Verwenden Sie Ihren Vornamen, Initialen oder ein Pseudonym und nehmen Sie keine besonders sensiblen Daten (Gesundheit, Daten Dritter usw.) in geteilte Dokumente auf.

## 6. Beteiligte Dritte

| Dienst | Zugängliche Daten | Rolle | Standort |
| --- | --- | --- | --- |
| Webhosting: {{hosting.provider}} | Technische Abrufdaten (IP, Datum, Adresse, Browser) | Auftragsverarbeiter des Inhabers oder eigenständig Verantwortlicher, gemäß seinen Bedingungen: {{hosting.privacyUrl}} | {{hosting.country}} |
| Öffentliche Nostr-Relays (Signalisierung) | IP-Adresse, Verbindungszeitpunkt, verschlüsselte Signalisierungsnachrichten, eine aus dem Dokument abgeleitete Raumkennung und kurzlebige öffentliche Schlüssel. Sie können die Dokumente nicht lesen | Unabhängige Dritte ohne Vertragsbeziehung zum Inhaber | Verschiedene Länder innerhalb und außerhalb des Europäischen Wirtschaftsraums |
| STUN-Server (standardmäßig Google LLC und Cloudflare, Inc.) | IP-Adresse und Port, um die öffentliche Adresse Ihrer Verbindung zu ermitteln | Unabhängige Dritte | USA und andere Länder |
| Browser Ihrer Mitwirkenden | Wie in Abschnitt 5 beschrieben, einschließlich Ihrer IP-Adresse | Nutzerinnen und Nutzer | Wo auch immer sie sich befinden |
| Relay und TURN-Server der Schule (optional) | IP-Adresse, Verbindungszeitpunkt, verschlüsselter Datenverkehr | Die betreibende Schule oder Behörde als Verantwortliche | Je nach Installation |
| Nextcloud (optional) | Die Dateien, die Sie öffnen oder speichern, und Ihre Zugangsdaten | Die Einrichtung, die diesen Server betreibt | Je nach Server |
| LanguageTool-Server (optional, standardmäßig aus) | Der Text der geprüften Absätze | Die Einrichtung, die den von Ihnen angegebenen Server betreibt | Je nach Server |
| Diktieren und Vorlesen des Browsers | Je nach Browser können das Diktat-Audio oder der vorgelesene Text an den Browserhersteller gesendet werden | Der Browserhersteller gemäß seinen Bedingungen | Je nach Hersteller |
| KI-Assistenten über WebMCP (optional, standardmäßig aus) | Der Inhalt des geöffneten Dokuments, den der Assistent liest oder ändert | Der Anbieter des von Ihnen gewählten Assistenten gemäß seinen Bedingungen. Siehe den [Hinweis zu künstlicher Intelligenz](ai.md) | Je nach Anbieter |

Öffentliche Relays und STUN-Server werden verwendet, weil {{siteName}} keinen eigenen Server hat. Sie können durch eigene Server ersetzt werden, indem Sie `?relays=wss://…` an die Adresse anhängen oder das Relay der Schule nutzen.

## 7. Zwecke und Rechtsgrundlagen

| Verarbeitung | Zweck | Rechtsgrundlage |
| --- | --- | --- |
| Technische Protokolle des Hostings | Auslieferung der Anwendung und Schutz der Website vor Angriffen und Missbrauch | Berechtigtes Interesse des Inhabers (Art. 6 Abs. 1 lit. f DSGVO; Erwägungsgrund 49) oder, bei einer Behörde, Aufgabe im öffentlichen Interesse (Art. 6 Abs. 1 lit. e) |
| Speicherung auf Ihrem Gerät | Betrieb der Anwendung und Speicherung Ihrer Dokumente und Einstellungen | Durch Sie selbst; im schulischen Umfeld von der Schule festgelegt (Abschnitt 12) |
| Zusammenarbeit mit anderen | Gemeinsame Bearbeitung von Dokumenten | Ihre Entscheidung, den Link zu teilen, und im schulischen Umfeld der Bildungsauftrag (Abschnitt 12) |
| Optionale Dienste (Nextcloud, LanguageTool, KI-Assistenten) | Die von Ihnen aktivierten | Ihre Entscheidung, sie zu aktivieren; die Verarbeitung erfolgt durch den Diensteanbieter in eigener Verantwortung |

## 8. Speicherdauer

- Technische Protokolle des Hostings: für die vom Anbieter zu Sicherheitszwecken festgelegte Dauer gemäß seiner Datenschutzerklärung.
- Daten auf Ihrem Gerät: bis Sie sie löschen (auf dem Startbildschirm oder durch Löschen der Websitedaten im Browser). Versionsverlauf und Urheberschaft sind Teil jedes Dokuments und bleiben erhalten, solange das Dokument in irgendeinem Browser gespeichert ist.
- Relays und STUN/TURN-Server: gemäß der Konfiguration des jeweiligen Betreibers. Signalisierungsnachrichten werden nur kurzzeitig verwendet.

## 9. Empfänger und internationale Übermittlungen

Der Inhaber gibt keine Daten weiter und verkauft keine Daten. Der Hosting-Anbieter kann die technischen Daten in den {{hosting.country}} verarbeiten; die Übermittlung stützt sich auf {{hosting.transfers}} oder auf die in seinen Bedingungen vorgesehenen Garantien.

Öffentliche Relays und STUN-Server können sich außerhalb des Europäischen Wirtschaftsraums befinden. Ihr Browser verbindet sich direkt mit ihnen, um Ihre Mitwirkenden zu finden; der Inhaber steht in keiner Vertragsbeziehung zu deren Betreibern. Um diese Verbindungen zu vermeiden, nutzen Sie ein eigenes Relay und einen eigenen TURN-Server in der Europäischen Union (für Schulen empfohlen).

## 10. Ihre Rechte

Sie können Ihre Rechte auf Auskunft, Berichtigung, Löschung, Widerspruch, Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis 22 DSGVO) per E-Mail an {{privacyEmail}} ausüben; geben Sie dabei an, welches Recht Sie ausüben, und weisen Sie Ihre Identität nach. Wir antworten innerhalb eines Monats (Art. 12 Abs. 3 DSGVO).

Bitte beachten Sie, dass der Inhaber weder Ihre Dokumente noch die in Ihrem Browser gespeicherten Daten besitzt: Sie können sie direkt in der Anwendung einsehen, herunterladen, berichtigen oder löschen. Für die Daten anderer Dienste (Hosting, Relays, Nextcloud, LanguageTool, KI-Assistenten) können Sie sich auch an deren Verantwortliche wenden.

Wenn Sie der Ansicht sind, dass Ihre Rechte nicht gewahrt wurden, können Sie Beschwerde bei der spanischen Datenschutzbehörde einlegen (Agencia Española de Protección de Datos, C/ Jorge Juan, 6, 28001 Madrid, https://www.aepd.es). {{#if dpo.email}}Zuvor können Sie sich, wenn Sie möchten, an den Datenschutzbeauftragten wenden ({{dpo.email}}).{{/if}}

## 11. Minderjährige

{{siteName}} wird überwiegend an Schulen und von Minderjährigen genutzt. Deshalb gilt:

- Die Anwendung verlangt keine Registrierung und keine personenbezogenen Daten, und der Inhaber erhebt über die technischen Protokolle des Hostings hinaus keine Daten über Nutzerinnen und Nutzer.
- Die Rechte von Kindern unter 14 Jahren können ihre Eltern oder gesetzlichen Vertreter ausüben (Art. 12 Abs. 6 LOPDGDD). Erfordert ein optionaler Dienst Dritter eine Einwilligung, benötigen Kinder unter 14 Jahren die ihrer Eltern oder gesetzlichen Vertreter (Art. 7 LOPDGDD und Art. 8 DSGVO).
- Wir empfehlen, dass Minderjährige optionale Dienste (LanguageTool, KI-Assistenten, Diktieren) nur unter Aufsicht von Lehrkräften oder ihrer Familie und gemäß den Vorgaben ihrer Schule nutzen.
- Bilder oder personenbezogene Daten anderer Personen dürfen ohne deren Zustimmung oder die ihrer Vertreter nicht in geteilten Dokumenten veröffentlicht werden (Art. 92 LOPDGDD).

## 12. Nutzung an Schulen

Wenn Lehrkräfte oder eine Schule {{siteName}} im Unterricht einsetzen, ist Verantwortlicher für die dabei verarbeiteten Daten der Schülerinnen und Schüler die Schule oder die zuständige Bildungsbehörde in Wahrnehmung des Bildungsauftrags (dreiundzwanzigste Zusatzbestimmung des spanischen Organgesetzes 2/2006 über das Bildungswesen und Art. 6 Abs. 1 lit. e DSGVO). Der Inhaber dieser Website hat keinen Zugriff auf diese Daten und ist daher hinsichtlich der Dokumentinhalte nicht Auftragsverarbeiter.

Wir empfehlen Schulen, diese Tätigkeit in ihr Verzeichnis von Verarbeitungstätigkeiten aufzunehmen (Art. 30 DSGVO und Art. 31 LOPDGDD), die Familien zu informieren und die empfohlene Konfiguration anzuwenden. Schulen, die eine eigene Installation veröffentlichen, sind für diese verantwortlich. Die [Informationen für Schulen](schools.md) enthalten ein Muster für das Verzeichnis und einen Text für Familien.

## 13. Sicherheit

- **Ende-zu-Ende-Verschlüsselung** der Zusammenarbeit: Verbindungsnachrichten werden mit dem Dokumentschlüssel verschlüsselt, der sich nur im Link befindet, und die Daten werden über verschlüsselte WebRTC-Kanäle (DTLS) übertragen.
- **Digitale Signaturen (Ed25519)**: Änderungen am Dokument und an Kommentaren werden signiert, und andere Browser verwerfen Änderungen ohne gültige Signatur; ein Ansichts- oder Kommentarlink erlaubt daher kein Bearbeiten.
- **Keine zentrale Kopie**: Es gibt keinen Server mit den Dokumenten aller Nutzerinnen und Nutzer, der von einer Datenpanne betroffen sein könnte.
- Die Anwendung wird über HTTPS ausgeliefert, und ihre Aktualisierungen kommen über HTTPS von derselben Website.
- Für die Sicherheit Ihres Geräts sind Sie selbst verantwortlich: Sperren Sie Ihr Gerät, teilen Sie Ihr Browserprofil nicht und entfernen Sie auf gemeinsam genutzten Computern nach der Arbeit Ihre Dokumente und melden Sie sich von Nextcloud ab.
- Um eine Sicherheitslücke zu melden, lesen Sie die Datei `/.well-known/security.txt` dieser Website.

## 14. Änderungen dieser Erklärung

Wir können diese Erklärung aktualisieren, um Änderungen der Anwendung oder der Rechtslage Rechnung zu tragen. Maßgeblich ist die auf dieser Seite veröffentlichte Fassung mit ihrem Aktualisierungsdatum. Wenn eine Änderung die Datenverarbeitung wesentlich betrifft, weisen wir in der Anwendung darauf hin.
