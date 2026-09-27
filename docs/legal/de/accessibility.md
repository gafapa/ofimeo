# Erklärung zur Barrierefreiheit

{{owner.name}} ist bestrebt, {{siteName}} im Einklang mit dem spanischen Königlichen Dekret 1112/2018 vom 7. September über die Barrierefreiheit von Websites und mobilen Anwendungen öffentlicher Stellen, das die Richtlinie (EU) 2016/2102 umsetzt, barrierefrei zugänglich zu machen.

Diese Erklärung gilt für die Website und Anwendung {{siteName}} ({{siteUrl}}) sowie für unverändert veröffentlichte Installationen. {{#if accessibility.complaintBody}}{{else}}Der Inhaber ist keine öffentliche Stelle; das Königliche Dekret 1112/2018 ist für ihn daher nicht verpflichtend: Diese Erklärung wird freiwillig abgegeben und folgt dessen Muster. Wenn eine Schule oder eine Behörde eine eigene Installation veröffentlicht, muss sie auf dieser Grundlage eine eigene Erklärung erstellen.{{/if}}

## Stand der Vereinbarkeit

{{#if accessibility.status=full}}Diese Website ist mit dem Königlichen Dekret 1112/2018 **vollständig vereinbar**.{{/if}}{{#if accessibility.status=partial}}Diese Website ist wegen der unten aufgeführten Unvereinbarkeiten mit dem Königlichen Dekret 1112/2018 und der Norm EN 301 549 (UNE-EN 301 549:2022, die Stufe AA der WCAG 2.1 übernimmt) **teilweise vereinbar**.{{/if}}{{#if accessibility.status=none}}Diese Website ist mit dem Königlichen Dekret 1112/2018 **nicht vereinbar**. Die nicht barrierefreien Aspekte sind unten aufgeführt.{{/if}}

Die folgende Aufstellung beruht auf einer vorläufigen Prüfung und muss durch ein vollständiges Audit nach der Methodik der Norm EN 301 549 bestätigt werden.

## Nicht barrierefreie Inhalte

### Unvereinbarkeiten mit dem Königlichen Dekret 1112/2018

- **Tabellenkalkulation.** Das Raster wird auf einer Zeichenfläche (Canvas) dargestellt: Screenreader können die Zellen nicht als Tabelle durchlaufen, und die Rechtschreibprüfung des Browsers steht im Zelleneditor nicht zur Verfügung (WCAG 1.3.1, 4.1.2).
- **Zeichnen.** Der Zeicheneditor arbeitet auf einer Zeichenfläche: Formen werden assistiven Technologien nicht bereitgestellt, haben keine Textalternative, und ihr Erstellen und Bearbeiten erfordert ein Zeigegerät (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Diagramme und Präsentationen.** Formen und Verbinder sind SVG-Grafiken ohne vollständigen zugänglichen Namen; Verschieben, Verbinden und Größenänderung von Formen erfolgen überwiegend mit Maus oder Touchscreen (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Textverarbeitung.** Rechtschreib- und Grammatikmarkierungen, farbige Urheberschaftsanzeige und die Cursor anderer Personen werden nur visuell dargestellt und Screenreadern nicht angekündigt (WCAG 1.3.1, 1.4.1, 4.1.3).
- **Zusammenarbeit.** Das Hinzukommen von Mitwirkenden, ihre Auswahl und ihre Änderungen in Echtzeit werden nicht über barrierefreie Statusmeldungen mitgeteilt (WCAG 4.1.3).
- **Formeleditor und virtuelle Tastatur** (Komponente eines Dritten): Einige Bedienelemente haben nicht in allen Sprachen einen zugänglichen Namen (WCAG 4.1.2).
- **Erzeugte Dateien.** Mit der Druckfunktion des Browsers erstellte PDFs sind möglicherweise nicht getaggt, und exportierte Bilder enthalten keine Textalternative (WCAG 1.1.1, 1.3.1).
- **Diktieren und Vorlesen.** Diese Funktionen hängen von den Sprachfunktionen des Browsers ab und sind nicht in allen Browsern und Sprachen verfügbar.

### Unverhältnismäßige Belastung

Wird nicht geltend gemacht.

### Inhalte, die nicht in den Anwendungsbereich der Rechtsvorschriften fallen

- Von Nutzerinnen und Nutzern erstellte Dokumente und die von ihnen geöffneten Dateien; dies sind Inhalte Dritter, die nicht der Kontrolle des Inhabers unterliegen.
- Verlinkte oder optional genutzte Dienste und Websites Dritter (Nextcloud, LanguageTool, KI-Assistenten).

## Erstellung dieser Erklärung

- Datum der Erstellung: {{accessibility.preparedOn}}.
- Methode: {{#if accessibility.method=audit}}externes Audit{{else}}Selbstbewertung durch den Inhaber{{/if}}.
{{#if accessibility.reviewedOn}}- Letzte Überprüfung: {{accessibility.reviewedOn}}.
{{/if}}
## Verfügbare Funktionen für Barrierefreiheit

Die Schaltfläche *Barrierefreiheit* (oder `Alt+Umschalt+A`) bietet Leseschriftarten (OpenDyslexic, Atkinson Hyperlegible), Textgröße, Zeilen- und Zeichenabstand, dunkle und kontrastreiche Designs, reduzierte Bewegung, einen großen Mauszeiger, einen dicken Fokusrahmen, Leselineal und Lesemaske, Vorlesen und Diktieren. Die Oberfläche ist per Tastatur bedienbar (`F10` für die Menüleiste) und enthält einen Link zum Überspringen zum Inhalt.

## Feedback und Kontaktangaben

Sie können Mitteilungen zu den Anforderungen an die Barrierefreiheit (Artikel 10 Abs. 2 lit. a des Königlichen Dekrets 1112/2018) senden, zum Beispiel um:

- mögliche Mängel dieser Website zu melden;
- andere Schwierigkeiten beim Zugang zu Inhalten mitzuteilen;
- sonstige Fragen zu stellen oder Verbesserungen vorzuschlagen;
- barrierefreie Informationen zu Inhalten anzufordern, die vom Anwendungsbereich ausgenommen oder als nicht barrierefrei erklärt sind,

per E-Mail an {{accessibility.contactEmail}}. Mitteilungen werden innerhalb von höchstens zwanzig Arbeitstagen beantwortet.

## Durchsetzungsverfahren

{{#if accessibility.complaintBody}}Wurde eine Anfrage nach barrierefreien Informationen oder eine Beschwerde abgelehnt, sind Sie mit der getroffenen Entscheidung nicht einverstanden oder erfüllt die Antwort nicht die Anforderungen des Artikels 12 Abs. 5 des Königlichen Dekrets 1112/2018, können Sie gemäß Artikel 13 des Königlichen Dekrets 1112/2018 und dem spanischen Gesetz 39/2015 vom 1. Oktober über das gemeinsame Verwaltungsverfahren der öffentlichen Verwaltungen eine Beschwerde bei {{accessibility.complaintBody}} einlegen.{{else}}Da der Inhaber keine öffentliche Stelle ist, gibt es gegen ihn kein behördliches Beschwerdeverfahren. Sind Sie mit der Antwort nicht zufrieden, können Sie sich erneut an den Inhaber wenden. Wenn Sie {{siteName}} über eine öffentliche Schule oder eine Behörde nutzen, die eine eigene Installation veröffentlicht, können Sie Ihre Beschwerde gemäß Artikel 12 und 13 des Königlichen Dekrets 1112/2018 an deren für Barrierefreiheit zuständige Stelle richten (in Galicien die des für Bildung zuständigen Regionalministeriums).{{/if}} Die Beobachtungsstelle für Web-Barrierefreiheit der spanischen Zentralverwaltung informiert über die Barrierefreiheit öffentlicher Stellen.
