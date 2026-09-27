# Informationen für Schulen

Ein Leitfaden für Schulleitungen, IT-Koordination und Datenschutzbeauftragte (DSB) von Schulen und Bildungsbehörden, die {{siteName}} nutzen möchten: welche Daten verarbeitet werden, wo sie liegen, wer verantwortlich ist, welche Risiken bestehen und wie die Konfiguration aussehen sollte. Enthalten sind ein Muster für das Verzeichnis von Verarbeitungstätigkeiten und ein Informationstext für Familien.

## 1. Zusammenfassung für die Schulleitung

- {{siteName}} ist eine statische Webanwendung: keine Konten, kein Anwendungsserver, keine zentrale Datenbank. Der Inhaber der Website erhält weder die Dokumente noch Daten der Schülerinnen und Schüler.
- Die Dokumente werden im Browser des jeweiligen Geräts gespeichert und Ende-zu-Ende-verschlüsselt direkt zwischen den Browsern der Mitwirkenden synchronisiert.
- Damit sich die Browser finden, werden standardmäßig öffentliche Nostr-Relays und STUN-Server Dritter genutzt; diese sehen IP-Adressen und verschlüsselte Verbindungsnachrichten, aber nicht den Inhalt. Die Schule kann sie durch ein eigenes Relay ersetzen.
- Funktionen, die Daten an Dritte senden (LanguageTool, KI-Assistenten über WebMCP), sind standardmäßig ausgeschaltet. Das Diktieren hängt vom Browser ab.
- Im Unterricht ist Verantwortlicher die Schule bzw. die Bildungsbehörde (dreiundzwanzigste Zusatzbestimmung des spanischen Organgesetzes 2/2006 über das Bildungswesen und Art. 6 Abs. 1 lit. e DSGVO).

## 2. Datenflüsse

```text
 Browser der Schülerin ◄── verschlüsseltes WebRTC (DTLS), direkt ──► Browser der Lehrkraft
        │                                                                  │
        ├── Verschlüsselte Signalisierung ──► Nostr-Relays (öffentlich oder der Schule)
        ├── Ermittlung der IP-Adresse ──► STUN/TURN-Server (öffentlich oder der Schule)
        ├── Laden der Anwendung ──► Webserver (GitHub Pages oder der Schule)
        └── Optional: Nextcloud der Schule · LanguageTool · KI-Assistent
```

| Daten | Speicherort | Zugriff | Hinweise |
| --- | --- | --- | --- |
| Dokumentinhalt, Kommentare, Versionen und Urheberschaft | Browser aller Beteiligten (IndexedDB) | Beteiligte mit dem Link | Läuft über keinen Server des Inhabers |
| Name oder Pseudonym und Farbe | Browser; wird an Mitwirkende gesendet | Beteiligte | Vorname, Initialen oder Pseudonym empfohlen |
| IP-Adresse | Wird von der Anwendung nicht gespeichert | Andere Beteiligte, Relays, STUN/TURN-Server, Webserver | Bei direkten Verbindungen unvermeidlich |
| Zugriffsschlüssel | In Links (nach `#`) und im Browser | Wer den Link hat | Links sind wie Passwörter zu behandeln |
| Nextcloud-Zugangsdaten | Browser (localStorage) | Nur Browser und Nextcloud-Server | App-Passwörter verwenden, nie das Hauptpasswort |
| Von LanguageTool geprüfter Text | Konfigurierter LanguageTool-Server | Serverbetreiber | Standardmäßig aus |
| Von einem KI-Assistenten gelesener Inhalt | Anbieter des Assistenten | Anbieter | Standardmäßig aus |

## 3. Rollen der Beteiligten

| Beteiligte | Datenschutzrechtliche Rolle |
| --- | --- |
| Schule oder Bildungsbehörde | Verantwortliche für die Daten von Schülerinnen, Schülern und Lehrkräften im Unterricht. Entscheidet über Nutzung, Konfiguration und Regeln. |
| Lehrkräfte | Handeln im Auftrag der Schule nach deren Weisungen. |
| Inhaber dieser Website ({{owner.name}}) | Stellt das Programm bereit. Hat keinen Zugriff auf Dokumentinhalte und ist insoweit kein Auftragsverarbeiter. Verantwortlich nur für die technischen Protokolle des Webhostings. |
| Schule mit eigener Installation | Zusätzlich verantwortlich für den Webserver, seine Protokolle und die Rechtstexte ihrer Installation. |
| Betreiber von Relay und TURN der Schule | Die Schule oder Behörde als Verantwortliche (oder ihr Dienstleister als Auftragsverarbeiter). |
| Öffentliche Relays und STUN-Server | Unabhängige Dritte ohne Vertrag mit dem Inhaber oder der Schule. Ersetzen wird empfohlen. |
| Nextcloud, LanguageTool, KI-Assistenten | Die jeweils anbietende Einrichtung, gemäß Vertrag oder Bedingungen mit der Schule. |

## 4. Muster für das Verzeichnis von Verarbeitungstätigkeiten

Unverbindliches Muster für das Verzeichnis nach Artikel 30 DSGVO und Artikel 31 LOPDGDD. Es ist vom DSB der Schule oder Behörde anzupassen.

| Feld | Vorgeschlagener Inhalt |
| --- | --- |
| Verarbeitungstätigkeit | Gemeinsames Erstellen und Bearbeiten von Unterrichtsdokumenten mit {{siteName}} |
| Verantwortlicher | [Schule / Regionalministerium oder zuständige Stelle] mit Kontaktdaten |
| Datenschutzbeauftragter | [Angaben zum DSB der Schule oder Bildungsbehörde] |
| Zweck | Lehr- und Lernaktivitäten: Verfassen, Korrigieren, Kommentieren und Abgeben von Arbeiten; Gruppenarbeit |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. e DSGVO (Aufgabe im öffentlichen Interesse) in Verbindung mit der dreiundzwanzigsten Zusatzbestimmung des spanischen Organgesetzes 2/2006 über das Bildungswesen |
| Kategorien betroffener Personen | Schülerinnen und Schüler, Lehrkräfte |
| Datenkategorien | Name oder Pseudonym; Inhalt von Arbeiten und Kommentaren; Korrekturen und Bewertungen; Versionsverlauf und Urheberschaft; IP-Adresse der Verbindung. Keine besonderen Kategorien personenbezogener Daten |
| Empfänger | Andere Beteiligte am Dokument; Betreiber von Relays und STUN/TURN-Servern (öffentlich oder der Schule); Nextcloud-Server der Schule, falls genutzt. Keine Weitergaben vorgesehen |
| Drittlandübermittlungen | Keine bei Nutzung eigener Relays, TURN- und Webserver in der EU; andernfalls mögliche Übermittlungen an öffentliche Relays und STUN-Server außerhalb des EWR |
| Löschfrist | Von der Schule festgelegt (z. B. zum Schuljahresende oder nach Ablauf der Widerspruchsfrist gegen Noten); Dokumente werden auf jedem Gerät gelöscht |
| Sicherheitsmaßnahmen | Ende-zu-Ende-Verschlüsselung; digitale Signatur der Änderungen; Links mit Berechtigungen (bearbeiten, kommentieren, ansehen); Geräte mit individuellen Konten; Maßnahmen des spanischen Nationalen Sicherheitsrahmens (Königliches Dekret 311/2022) auf eigenen Servern |

## 5. Risiken und Maßnahmen

| Risiko | Empfohlene Maßnahmen |
| --- | --- |
| Dritte sehen IP-Adressen und Verbindungszeiten | Relay und TURN-Server der Schule sowie den Parameter `?relay=` in Links verwenden |
| Ein Link gelangt an Unbefugte | Links über offizielle Kanäle (Lernplattform) teilen; Schülerinnen und Schülern Ansichts- oder Kommentarlinks geben, wenn das genügt; bei einem Leck *Datei → Kopie erstellen* und das Original nicht mehr verwenden |
| Verlust nur im Browser gespeicherter Arbeiten | Nextcloud der Schule, die Funktion *Abgeben* und regelmäßige Downloads nutzen; die Anwendung installieren |
| Gemeinsam genutzte Geräte (Computerräume, Laptopwagen) | Individuelle Konten oder Browserprofile; Dokumente entfernen und von Nextcloud abmelden, wenn die Arbeit beendet ist |
| Offenlegung personenbezogener Daten von Schülerinnen und Schülern | Vornamen, Initialen oder Pseudonyme verwenden; Gesundheitsdaten, psychologische Gutachten oder Angaben zu sonderpädagogischem Förderbedarf nicht in geteilten Dokumenten, sondern in den offiziellen Systemen verarbeiten |
| Optionale Dienste, die Inhalte an Dritte senden | LanguageTool und KI-Assistenten ausgeschaltet lassen oder Server der Schule nutzen; das Diktieren des Browsers bewerten |
| Kinder unter 14 Jahren und Dienste Dritter | Keine Dienste aktivieren, die ihre Einwilligung erfordern, ohne die ihrer Familien (Art. 7 LOPDGDD) |

Der DSB sollte prüfen, ob eine Datenschutz-Folgenabschätzung erforderlich ist (Art. 35 DSGVO und Liste der spanischen Datenschutzbehörde), insbesondere wenn Dienste Dritter aktiviert werden oder das Werkzeug breit mit Minderjährigen eingesetzt wird.

## 6. Empfohlene Konfiguration

1. **Eigener Server.** {{siteName}} auf einem Server der Schule oder Behörde veröffentlichen (idealerweise unter derselben Adresse wie Nextcloud) und die Rechtstexte dieser Installation anpassen (Datei `legal.config.json`).
2. **Relay der Schule.** Das Relay von {{siteName}} (Nostr + STUN/TURN) im Schulnetz installieren und Links mit `?relay=https://relay.schule.example` verwenden, um nicht von öffentlichen Relays abzuhängen.
3. **Nextcloud der Schule** zum Öffnen, Speichern und Abgeben von Arbeiten.
4. **LanguageTool ausgeschaltet** oder auf einen Server der Schule bzw. Behörde gerichtet.
5. **KI-Assistenten (WebMCP) ausgeschaltet.** Falls genutzt, nur mit von der Behörde beauftragten Anbietern, ohne personenbezogene Daten von Schülerinnen und Schülern und mit den Vorsichtsmaßnahmen aus dem [Hinweis zu künstlicher Intelligenz](ai.md).
6. **Diktieren.** Darauf hinweisen, dass in manchen Browsern der Browserhersteller das Audio verarbeitet; nur bei Bedarf verwenden.
7. **Verzeichnis und Information.** Die Verarbeitung ins Verzeichnis von Verarbeitungstätigkeiten aufnehmen und die Familien informieren (Abschnitt 7).
8. **Schulung** von Lehrkräften sowie Schülerinnen und Schülern zum sicheren Umgang mit Links und zur digitalen Kompetenz (Art. 83 LOPDGDD).

## 7. Mustertext zur Information der Familien

> **Information über die Nutzung der Anwendung {{siteName}}**
>
> Die Schule [Name der Schule] nutzt im Unterricht die Anwendung {{siteName}}, mit der Schülerinnen, Schüler und Lehrkräfte im Browser gemeinsam Dokumente erstellen und bearbeiten können.
>
> **Verantwortlicher:** [Schule / Behörde], [Anschrift und E-Mail]. **Datenschutzbeauftragter:** [Kontakt].
>
> **Zweck und Rechtsgrundlage:** Durchführung von Bildungsaktivitäten in Wahrnehmung des Bildungsauftrags (Art. 6 Abs. 1 lit. e DSGVO und dreiundzwanzigste Zusatzbestimmung des spanischen Organgesetzes 2/2006 über das Bildungswesen).
>
> **Daten:** Name oder Pseudonym des Kindes, Arbeiten und Kommentare, Änderungsverlauf und IP-Adresse der Verbindung.
>
> **Speicherort:** auf den im Unterricht genutzten Geräten und, falls verwendet, in der Nextcloud der Schule. Die Anwendung hat keinen zentralen Server, und ihr Inhaber erhält die Dokumente nicht. Zur Verbindung der Geräte werden [der Server der Schule / öffentliche Server Dritter, die die IP-Adresse, aber nicht den Inhalt kennen] genutzt.
>
> **Empfänger:** die Lehrkräfte und Mitschülerinnen und Mitschüler, mit denen das jeweilige Dokument geteilt wird. Es werden keine Daten an Dritte weitergegeben.
>
> **Speicherdauer:** [bis zum Ende des Schuljahres / von der Schule festgelegte Frist].
>
> **Rechte:** Sie können Ihre Rechte auf Auskunft, Berichtigung, Löschung, Widerspruch und Einschränkung gegenüber der Schule ([E-Mail]) geltend machen und Beschwerde bei der spanischen Datenschutzbehörde einlegen (www.aepd.es).
>
> **Nutzung zu Hause:** Die Dokumente werden im Browser des Geräts gespeichert. Wir empfehlen, in geteilten Dokumenten nicht den vollständigen Namen zu verwenden, Links nicht außerhalb der Gruppe weiterzugeben und externe Dienste (Online-Rechtschreibprüfung, KI-Assistenten) nicht ohne Aufsicht zu aktivieren.

## 8. Rechtsgrundlagen

- Verordnung (EU) 2016/679, Datenschutz-Grundverordnung (DSGVO).
- Spanisches Organgesetz 3/2018 über den Schutz personenbezogener Daten und die Garantie digitaler Rechte (LOPDGDD): Art. 7 (Minderjährige), 12 Abs. 6, 31, 34, 83 (digitale Bildung), 84 (Schutz Minderjähriger im Internet) und 92.
- Spanisches Organgesetz 2/2006 über das Bildungswesen, geändert durch das Organgesetz 3/2020 (LOMLOE): dreiundzwanzigste Zusatzbestimmung.
- Königliches Dekret 311/2022, Nationaler Sicherheitsrahmen.
- Königliches Dekret 1112/2018 über die Barrierefreiheit von Websites und mobilen Anwendungen öffentlicher Stellen.
- Verordnung (EU) 2024/1689 über künstliche Intelligenz.
- Spanische Datenschutzbehörde: Leitfäden für Schulen (https://www.aepd.es).
