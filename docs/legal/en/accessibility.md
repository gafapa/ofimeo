# Accessibility statement

{{owner.name}} is committed to making {{siteName}} accessible in accordance with Spanish Royal Decree 1112/2018 of 7 September on the accessibility of public sector websites and mobile applications, which transposes Directive (EU) 2016/2102.

This statement applies to the {{siteName}} website and application ({{siteUrl}}) and to installations published without changes. {{#if accessibility.complaintBody}}{{else}}The owner is not part of the public sector, so Royal Decree 1112/2018 is not mandatory for it: this statement is provided voluntarily and follows its model. When a school or a public administration publishes its own installation, it must draw up its own statement based on this one.{{/if}}

## Compliance status

{{#if accessibility.status=full}}This website is **fully compliant** with Royal Decree 1112/2018.{{/if}}{{#if accessibility.status=partial}}This website is **partially compliant** with Royal Decree 1112/2018 and with standard EN 301 549 (UNE-EN 301 549:2022, which incorporates level AA of WCAG 2.1) due to the non-compliances listed below.{{/if}}{{#if accessibility.status=none}}This website is **not compliant** with Royal Decree 1112/2018. The non-accessible aspects are listed below.{{/if}}

The following list comes from a preliminary review and is pending confirmation by a full audit following the EN 301 549 methodology.

## Non-accessible content

### Non-compliance with Royal Decree 1112/2018

- **Spreadsheet.** The grid is drawn on a canvas: screen readers cannot move through cells as a table, and the browser's spell checker is not available in the cell editor (WCAG 1.3.1, 4.1.2).
- **Drawing.** The drawing editor works on a canvas: shapes are not exposed to assistive technologies, have no text alternative, and creating and editing them requires a pointing device (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Diagrams and presentations.** Shapes and connectors are SVG graphics without a complete accessible name; moving, connecting and resizing shapes relies mainly on a mouse or touch screen (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Word processor.** Spelling and grammar marks, colour-coded authorship and other people's cursors are shown only visually and are not announced to screen readers (WCAG 1.3.1, 1.4.1, 4.1.3).
- **Collaboration.** Collaborators joining, their selections and the changes they make in real time are not communicated through accessible status messages (WCAG 4.1.3).
- **Equation editor and virtual keyboard** (third-party component): some controls lack an accessible name in every language (WCAG 4.1.2).
- **Generated files.** PDFs created with the browser's print function may not be tagged, and exported images include no text alternative (WCAG 1.1.1, 1.3.1).
- **Dictation and read aloud.** They depend on the browser's speech features and are not available in every browser or language.

### Disproportionate burden

Not invoked.

### Content outside the scope of the applicable legislation

- Documents created by users and the files they open, which are third-party content not under the owner's control.
- Third-party services and sites linked or optionally used (Nextcloud, LanguageTool, artificial intelligence assistants).

## Preparation of this statement

- Date prepared: {{accessibility.preparedOn}}.
- Method: {{#if accessibility.method=audit}}external audit{{else}}self-assessment carried out by the owner{{/if}}.
{{#if accessibility.reviewedOn}}- Last reviewed: {{accessibility.reviewedOn}}.
{{/if}}
## Available accessibility features

The *Accessibility* button (or `Alt+Shift+A`) lets you choose reading fonts (OpenDyslexic, Atkinson Hyperlegible), text size, line and letter spacing, dark and high-contrast themes, reduced motion, a large pointer, a thick focus outline, a reading ruler and mask, read aloud and dictation. The interface can be used with the keyboard (`F10` for the menu bar) and includes a skip-to-content link.

## Feedback and contact details

You can send communications about accessibility requirements (Article 10(2)(a) of Royal Decree 1112/2018), for example to:

- report any possible non-compliance by this website;
- report other difficulties in accessing content;
- ask any other question or suggest an improvement;
- request accessible information about content excluded from the scope or declared non-accessible,

by writing to {{accessibility.contactEmail}}. Communications will be answered within twenty working days at most.

## Enforcement procedure

{{#if accessibility.complaintBody}}If, after a request for accessible information or a complaint, it has been rejected, you disagree with the decision taken or the reply does not meet the requirements of Article 12(5) of Royal Decree 1112/2018, you may file a claim with {{accessibility.complaintBody}}, under Article 13 of Royal Decree 1112/2018 and Spanish Law 39/2015 of 1 October on the Common Administrative Procedure of Public Administrations.{{else}}As the owner is not part of the public sector, there is no administrative complaint procedure against it. If you are not satisfied with the reply, you can contact the owner again. If you use {{siteName}} through a public school or a public administration that publishes its own installation, you can file a complaint or claim with its accessibility unit (in Galicia, that of the regional ministry responsible for education), under Articles 12 and 13 of Royal Decree 1112/2018.{{/if}} The Web Accessibility Observatory of the Spanish General State Administration provides information on public sector accessibility.
