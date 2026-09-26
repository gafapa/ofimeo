// Univer setup: open-source presets only (Apache-2.0), pinned to an exact
// version in package.json (command ids used by our menus live in commands.ts).

import { createUniver, LocaleType, mergeLocales, type IWorkbookData } from '@univerjs/presets'
import { language } from '../../core/i18n'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter'
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort'
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting'
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation'
import { UniverSheetsFindReplacePreset } from '@univerjs/preset-sheets-find-replace'
import { UniverSheetsHyperLinkPreset } from '@univerjs/preset-sheets-hyper-link'
import { UniverSheetsNotePreset } from '@univerjs/preset-sheets-note'
import { UniverSheetsDrawingPreset } from '@univerjs/preset-sheets-drawing'
import { UniverSheetsTablePreset } from '@univerjs/preset-sheets-table'
import coreEnUS from '@univerjs/preset-sheets-core/locales/en-US'
import filterEnUS from '@univerjs/preset-sheets-filter/locales/en-US'
import sortEnUS from '@univerjs/preset-sheets-sort/locales/en-US'
import cfEnUS from '@univerjs/preset-sheets-conditional-formatting/locales/en-US'
import dvEnUS from '@univerjs/preset-sheets-data-validation/locales/en-US'
import findEnUS from '@univerjs/preset-sheets-find-replace/locales/en-US'
import linkEnUS from '@univerjs/preset-sheets-hyper-link/locales/en-US'
import noteEnUS from '@univerjs/preset-sheets-note/locales/en-US'
import drawingEnUS from '@univerjs/preset-sheets-drawing/locales/en-US'
import tableEnUS from '@univerjs/preset-sheets-table/locales/en-US'
import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-sheets-filter/lib/index.css'
import '@univerjs/preset-sheets-sort/lib/index.css'
import '@univerjs/preset-sheets-conditional-formatting/lib/index.css'
import '@univerjs/preset-sheets-data-validation/lib/index.css'
import '@univerjs/preset-sheets-find-replace/lib/index.css'
import '@univerjs/preset-sheets-hyper-link/lib/index.css'
import '@univerjs/preset-sheets-note/lib/index.css'
import '@univerjs/preset-sheets-drawing/lib/index.css'
import '@univerjs/preset-sheets-table/lib/index.css'

// Fixed ids: every replica must address the same workbook and sheets.
export const WORKBOOK_ID = 'workbook'

export function emptyWorkbook(): Partial<IWorkbookData> {
  return {
    id: WORKBOOK_ID,
    name: '',
    locale: LocaleType.EN_US,
    styles: {},
    sheetOrder: ['sheet-1'],
    sheets: {
      'sheet-1': { id: 'sheet-1', name: 'Sheet1', rowCount: 1000, columnCount: 26, cellData: {} },
    },
    resources: [],
  }
}

// Univer's interface in the suite's language, loaded on demand (Univer has no
// Galician: Spanish for gl). English is always bundled as the fallback.
const univerLocales = {
  es: () => [
    import('@univerjs/preset-sheets-core/locales/es-ES'),
    import('@univerjs/preset-sheets-filter/locales/es-ES'),
    import('@univerjs/preset-sheets-sort/locales/es-ES'),
    import('@univerjs/preset-sheets-conditional-formatting/locales/es-ES'),
    import('@univerjs/preset-sheets-data-validation/locales/es-ES'),
    import('@univerjs/preset-sheets-find-replace/locales/es-ES'),
    import('@univerjs/preset-sheets-hyper-link/locales/es-ES'),
    import('@univerjs/preset-sheets-note/locales/es-ES'),
    import('@univerjs/preset-sheets-drawing/locales/es-ES'),
    import('@univerjs/preset-sheets-table/locales/es-ES'),
  ],
  fr: () => [
    import('@univerjs/preset-sheets-core/locales/fr-FR'),
    import('@univerjs/preset-sheets-filter/locales/fr-FR'),
    import('@univerjs/preset-sheets-sort/locales/fr-FR'),
    import('@univerjs/preset-sheets-conditional-formatting/locales/fr-FR'),
    import('@univerjs/preset-sheets-data-validation/locales/fr-FR'),
    import('@univerjs/preset-sheets-find-replace/locales/fr-FR'),
    import('@univerjs/preset-sheets-hyper-link/locales/fr-FR'),
    import('@univerjs/preset-sheets-note/locales/fr-FR'),
    import('@univerjs/preset-sheets-drawing/locales/fr-FR'),
    import('@univerjs/preset-sheets-table/locales/fr-FR'),
  ],
  de: () => [
    import('@univerjs/preset-sheets-core/locales/de-DE'),
    import('@univerjs/preset-sheets-filter/locales/de-DE'),
    import('@univerjs/preset-sheets-sort/locales/de-DE'),
    import('@univerjs/preset-sheets-conditional-formatting/locales/de-DE'),
    import('@univerjs/preset-sheets-data-validation/locales/de-DE'),
    import('@univerjs/preset-sheets-find-replace/locales/de-DE'),
    import('@univerjs/preset-sheets-hyper-link/locales/de-DE'),
    import('@univerjs/preset-sheets-note/locales/de-DE'),
    import('@univerjs/preset-sheets-drawing/locales/de-DE'),
    import('@univerjs/preset-sheets-table/locales/de-DE'),
  ],
}
const univerLocaleType = { es: LocaleType.ES_ES, fr: LocaleType.FR_FR, de: LocaleType.DE_DE }

async function uiLocale() {
  const lang = language === 'gl' ? 'es' : language
  if (lang === 'en') return null
  const parts = await Promise.all(univerLocales[lang]())
  return { type: univerLocaleType[lang], data: mergeLocales(...parts.map((m) => m.default)) }
}

// Univer's own sheet and range protection: every peer is the same Univer user,
// so "Only I can edit" would protect nothing; Data ▸ Warn before editing… is
// the suite's honest replacement (warnings.ts).
const HIDDEN_MENUS = [
  'sheet.contextMenu.permission',
  'sheet.command.add-range-protection-from-toolbar',
  'sheet.command.add-range-protection-from-context-menu',
  'sheet.command.view-sheet-permission-from-context-menu',
  'sheet.command.add-range-protection-from-sheet-bar',
  'sheet.command.view-sheet-permission-from-sheet-bar',
  'sheet.command.delete-range-protection-from-context-menu',
  'sheet.command.set-range-protection-from-context-menu',
  'sheet.command.delete-worksheet-protection-from-sheet-bar',
  'sheet.command.change-sheet-protection-from-sheet-bar',
]

// `readOnly`: view and comment links get no tool bar and no context menu.
export async function createSpreadsheet(container: HTMLElement, { readOnly = false } = {}) {
  const english = mergeLocales(coreEnUS, filterEnUS, sortEnUS, cfEnUS, dvEnUS, findEnUS, linkEnUS, noteEnUS, drawingEnUS, tableEnUS)
  const ui = await uiLocale()
  return createUniver({
    locale: ui ? ui.type : LocaleType.EN_US,
    locales: ui ? { [ui.type]: ui.data, [LocaleType.EN_US]: english } : { [LocaleType.EN_US]: english },
    presets: [
      UniverSheetsCorePreset({
        container,
        // One tool row without Univer's ribbon tabs: our menu bar has File…Help.
        ribbonType: 'simple',
        // Only the sheet tabs: selection statistics and zoom are in our status bar.
        footer: { sheetBar: true, statisticBar: false, menus: false, zoomSlider: false },
        toolbar: !readOnly,
        contextMenu: !readOnly,
        menu: Object.fromEntries(HIDDEN_MENUS.map((id) => [id, { hidden: true }])),
      }),
      UniverSheetsFilterPreset(),
      UniverSheetsSortPreset(),
      UniverSheetsConditionalFormattingPreset(),
      UniverSheetsDataValidationPreset(),
      UniverSheetsFindReplacePreset(),
      UniverSheetsHyperLinkPreset(),
      UniverSheetsNotePreset(),
      UniverSheetsDrawingPreset(),
      UniverSheetsTablePreset(),
    ],
  })
}
