# Impressum und rechtliche Hinweise

Diese rechtlichen Hinweise regeln den Zugang zur Website und Anwendung {{siteName}} sowie deren Nutzung gemäß Artikel 10 des spanischen Gesetzes 34/2002 vom 11. Juli über Dienste der Informationsgesellschaft und den elektronischen Geschäftsverkehr (LSSI-CE).

## 1. Angaben zum Inhaber

| Angabe | Wert |
| --- | --- |
| Inhaber | {{owner.name}} |
| Steuer-ID (NIF/CIF) | {{owner.nif}} |
| Anschrift | {{owner.address}} |
| E-Mail | {{owner.email}} |
{{#if owner.phone}}| Telefon | {{owner.phone}} |
{{/if}}{{#if owner.registry}}| Registerangaben | {{owner.registry}} |
{{/if}}| Website | {{siteUrl}} |

{{#if dpo.email}}Datenschutzbeauftragter: {{dpo.name}} ({{dpo.email}}).{{else}}Der Inhaber hat keinen Datenschutzbeauftragten benannt, da er dazu nicht verpflichtet ist (Art. 37 DSGVO und Art. 34 LOPDGDD). Für Fragen zum Datenschutz können Sie an {{privacyEmail}} schreiben.{{/if}}

## 2. Gegenstand

{{siteName}} ist eine Sammlung kollaborativer Büroanwendungen (Textverarbeitung, Tabellenkalkulation, Zeichnen, Diagramme und Präsentationen), die vollständig im Browser der Nutzerinnen und Nutzer läuft. Der Inhaber stellt das Programm als statische Website bereit: Er betreibt keinen eigenen Anwendungsserver, legt keine Benutzerkonten an und speichert oder empfängt keine Dokumente; diese werden auf dem Gerät der jeweiligen Person gespeichert und direkt zwischen den Browsern der Zusammenarbeitenden ausgetauscht.

## 3. Zugangs- und Nutzungsbedingungen

Der Zugang ist frei, kostenlos und ohne Registrierung. Mit der Nutzung von {{siteName}} werden diese Hinweise und die [Nutzungsbedingungen](terms.md) anerkannt. Nutzerinnen und Nutzer verpflichten sich, Website und Anwendung im Einklang mit dem Gesetz, nach Treu und Glauben, unter Wahrung der öffentlichen Ordnung und im schulischen Umfeld gemäß den Regeln der Schule zu verwenden und sie nicht für rechtswidrige oder die Rechte oder Interessen Dritter verletzende Zwecke einzusetzen.

## 4. Geistiges und gewerbliches Eigentum

- Der eigene Code von {{siteName}}, seine Gestaltung und seine Texte gehören dem Inhaber oder seinen Mitwirkenden und werden unter der im Projekt-Repository angegebenen Lizenz angeboten; ohne ausdrückliche Angabe sind alle Rechte vorbehalten.
- {{siteName}} enthält Komponenten Dritter (Open-Source-Bibliotheken, Schriftarten, Rechtschreibwörterbücher und Formenbibliotheken von draw.io), die ihren eigenen Lizenzen unterliegen; diese sind unter [Lizenzen von Drittanbieter-Software](../../THIRD_PARTY_NOTICES.md) wiedergegeben. Diese Hinweise schränken die durch diese Lizenzen gewährten Rechte nicht ein.
- Der Name {{siteName}} und sein Logo sind Kennzeichen des Inhabers und dürfen nicht so verwendet werden, dass Verwechslungen über die Herkunft anderer Produkte oder Dienste entstehen.
- Die von Nutzerinnen und Nutzern erstellten Dokumente gehören ihren Urhebern. Der Inhaber erwirbt daran keine Rechte und hat keinen Zugriff auf ihren Inhalt.

## 5. Gewährleistungsausschluss und Haftung

- {{siteName}} wird kostenlos und „wie besehen“ angeboten. Der Inhaber übernimmt keine Gewähr für Verfügbarkeit oder Fortbestand der Website, Fehlerfreiheit oder Kompatibilität mit allen Browsern, Geräten oder Dateiformaten.
- Dokumente werden ausschließlich im Browser der jeweiligen Person und ihrer Mitwirkenden gespeichert. Der Inhaber bewahrt keine Kopie auf und haftet nicht für deren Verlust, etwa beim Löschen der Browserdaten, beim Gerätewechsel oder bei einem Geräteausfall. Für Sicherungskopien ist jede Nutzerin und jeder Nutzer selbst verantwortlich.
- Der Inhaber speichert, übermittelt oder kontrolliert die Inhalte, die Nutzerinnen und Nutzer erstellen oder untereinander austauschen, nicht und haftet daher nach Maßgabe der Artikel 14 bis 17 LSSI-CE nicht dafür. Erlangt er tatsächliche Kenntnis von einer rechtswidrigen Nutzung der Website, arbeitet er mit den zuständigen Behörden zusammen.
- Die Zusammenarbeit nutzt Dienste Dritter, die der Inhaber nicht kontrolliert (Nostr-Signalisierungsserver, STUN/TURN-Server), und, sofern aktiviert, weitere optionale Dienste (Nextcloud, LanguageTool, KI-Assistenten, Spracherkennung des Browsers). Der Inhaber haftet nicht für deren Verfügbarkeit, Inhalte oder Datenverarbeitung.
- Links zu Websites Dritter dienen nur der Information; für deren Inhalte haftet der Inhaber nicht.
- Die vorstehenden Beschränkungen gelten nicht, soweit das Gesetz einen Haftungsausschluss oder eine Haftungsbeschränkung nicht zulässt, insbesondere bei Vorsatz oder grober Fahrlässigkeit, und berühren nicht die Rechte aus dem Verbraucherschutzrecht.

## 6. Datenschutz und lokale Speicherung

Informationen zur Verarbeitung personenbezogener Daten finden Sie in der [Datenschutzerklärung](privacy.md). {{siteName}} verwendet keine Cookies; die genutzte lokale Speicherung ist in der [Richtlinie zu Cookies und lokaler Speicherung](cookies.md) beschrieben.

## 7. Änderungen

Der Inhaber kann diese Hinweise sowie Konfiguration, Darstellung oder Inhalt der Website jederzeit ändern. Maßgeblich ist die auf dieser Seite veröffentlichte Fassung mit dem Datum ihrer letzten Aktualisierung.

## 8. Anwendbares Recht und Gerichtsstand

Diese Hinweise unterliegen spanischem Recht. Für Streitigkeiten sind {{#if jurisdiction}}{{jurisdiction}} zuständig, sofern die anwendbaren Vorschriften keinen anderen Gerichtsstand vorsehen{{else}}die nach dem anwendbaren Recht zuständigen Gerichte zuständig{{/if}}; insbesondere ist, wenn die Nutzerin oder der Nutzer Verbraucher ist, das Gericht ihres bzw. seines Wohnsitzes zuständig. Ist der Inhaber eine Behörde, gelten die einschlägigen verwaltungsrechtlichen Vorschriften.
