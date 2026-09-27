# Richtlinie zu Cookies und lokaler Speicherung

{{siteName}} verwendet keine Cookies und keinerlei Tracking-, Analyse- oder Werbetechnologien. Es speichert in Ihrem Browser nur die für den Betrieb der Anwendung unbedingt erforderlichen Informationen, und diese werden nicht an den Inhaber gesendet.

## 1. Was Cookies und lokale Speicherung sind

Cookies und andere Speichertechnologien (localStorage, IndexedDB, Cache Storage) ermöglichen es einer Website, Informationen auf dem Gerät der Nutzerin oder des Nutzers abzulegen. Artikel 22 Abs. 2 des spanischen Gesetzes 34/2002 (LSSI-CE) verlangt dafür Information und Einwilligung, es sei denn, die Speicherung ist unbedingt erforderlich, um einen ausdrücklich gewünschten Dienst bereitzustellen.

## 2. Welche Speicherung {{siteName}} nutzt

Die gesamte Speicherung ist eigene Speicherung (keine Speicherung Dritter), liegt nur in Ihrem Browser und bleibt bestehen, bis Sie sie löschen.

| Kategorie | Technischer Name | Zweck |
| --- | --- | --- |
| Dokumente | IndexedDB `ofimeo:<id>` und `ofimeo:<id>:comments` | Inhalt jedes Dokuments, Kommentare, Versionsverlauf und Urheberschaft |
| Protokoll signierter Änderungen | IndexedDB `ofimeo-kv` | Ermöglicht die Weitergabe von Änderungen an Dokumenten, die über Ansichts- oder Kommentarlinks geöffnet wurden, an andere Beteiligte |
| Dokumentenverzeichnis | localStorage `ofimeo:docs` | Liste Ihrer Dokumente: Titel, Datum, Zugriffsschlüssel und verknüpfte Nextcloud-Datei |
| Lokale Ordnung | localStorage `ofimeo:library`; IndexedDB `ofimeo-library` | Ordner und Schlagwörter Ihrer Dokumente, Index für die Volltextsuche und Ihre eigenen Vorlagen |
| Sicherungen | localStorage `ofimeo:backup` | Datum der letzten Sicherung, Erinnerung und automatische Sicherung in Nextcloud, falls aktiviert |
| Relay der Schule | localStorage `ofimeo:school-relay` | Adresse des Schul-Relays und die von ihm bereitgestellten Verbindungseinstellungen |
| Identität | localStorage `ofimeo:user`, `ofimeo:writer-user-id` | Name und Farbe, die Ihre Mitwirkenden sehen; technische Kennung für die Urheberschaft |
| Einstellungen | localStorage `ofimeo:language`, `ofimeo:a11y`, `ofimeo:spelling`, `ofimeo:spelling-dictionary:<Sprache>`, `ofimeo:zoom`, `ofimeo:home-view`, `wo-template-lang`, `diagram-libraries` | Sprache, Barrierefreiheit, Rechtschreibung und persönliches Wörterbuch, Zoom, Sprache der Vorlagen und gewählte Formenbibliotheken |
| KI-Assistenten (nur wenn Sie es einschalten) | localStorage `ofimeo:webmcp` | Dass Sie KI-Assistenten erlaubt haben, die in diesem Browser geöffneten Dokumente zu verwenden (WebMCP; standardmäßig aus). Siehe den [Hinweis zu künstlicher Intelligenz](ai.md) |
| Nextcloud (nur wenn eingerichtet) | localStorage `ofimeo:nextcloud`, `ofimeo:nextcloud-server`, `ofimeo:nextcloud-folder`, `ofimeo:nextcloud-format`, `ofimeo:nextcloud-share` | Server, Benutzername und App-Passwort, zuletzt verwendeter Ordner und Format |
| Offline-Betrieb | Service Worker und Cache Storage `workbox-precache-*`, `excalidraw-fonts`, `spelling`, `diagram-libs-*` | Dateien der Anwendung, Schriftarten, Wörterbücher und Formen für die Offline-Nutzung |

Technische Namen können sich zwischen Versionen ändern; Kategorien und Zwecke bleiben gleich. Die Schlüssel `ofimeo` stammen vom technischen Namen des Projekts.

## 3. Warum es keinen Cookie-Hinweis gibt

Diese gesamte Speicherung ist unbedingt erforderlich, um den von Ihnen gewünschten Dienst bereitzustellen (Ihre Dokumente bearbeiten, speichern und teilen, Ihre Einstellungen merken und die Anwendung offline nutzen), und ist nach Artikel 22 Abs. 2 LSSI-CE und dem Leitfaden der spanischen Datenschutzbehörde zur Verwendung von Cookies von der Einwilligungspflicht ausgenommen. Sie wird nicht für Analyse, Werbung oder Profiling verwendet und weder mit dem Inhaber noch mit Dritten geteilt.

Der Hosting-Server setzt auf dieser Website keine Cookies. Sollte künftig eine nicht ausgenommene Speicherung hinzukommen, würde vor deren Nutzung Ihre Einwilligung eingeholt.

## 4. Speicherung einsehen und löschen

- **Ein Dokument:** Öffnen Sie auf dem Startbildschirm das Menü ⋮ des Dokuments und wählen Sie *Aus diesem Browser entfernen*. Es wird aus diesem Browser gelöscht; die Kopien Ihrer Mitwirkenden bleiben unberührt.
- **Nextcloud-Zugangsdaten:** im Nextcloud-Konto *Abmelden*.
- **Alles:** Löschen Sie in den Browsereinstellungen die Websitedaten (in Chrome und Edge *Einstellungen → Datenschutz und Sicherheit → Cookies und Websitedaten*; in Firefox *Einstellungen → Datenschutz & Sicherheit → Cookies und Website-Daten*; in Safari *Einstellungen → Datenschutz → Websitedaten verwalten*).

Achtung: Das Löschen der Websitedaten entfernt Ihre Dokumente unwiderruflich von diesem Gerät. Laden Sie sie vorher herunter oder speichern Sie sie in Nextcloud.

Im privaten bzw. Inkognito-Modus löscht der Browser diese gesamte Speicherung beim Schließen des Fensters.

## 5. Weitere Informationen

In der [Datenschutzerklärung](privacy.md) erfahren Sie, welche Daten es gibt und wer sie verarbeiten kann.
