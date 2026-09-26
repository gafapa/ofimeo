// Univer command adapter: every Univer command id the suite's menus use lives
// here, so a Univer upgrade only needs this table checked (tests/e2e and
// scratch smoke tests call `missingCommands()`). Univer is pinned to an exact
// version in package.json for the same reason.

import { ICommandService, type FUniver, type Univer } from '@univerjs/presets'

export const UNIVER_COMMANDS = {
  undo: 'univer.command.undo',
  redo: 'univer.command.redo',
  cut: 'univer.command.cut',
  copy: 'univer.command.copy',
  paste: 'univer.command.paste',
  pasteValues: 'sheet.command.paste-value',
  pasteFormat: 'sheet.command.paste-format',
  selectAll: 'sheet.command.select-all',
  find: 'ui.operation.open-find-dialog',
  replace: 'ui.operation.open-replace-dialog',
  clearContents: 'sheet.command.clear-selection-content',
  clearFormat: 'sheet.command.clear-selection-format',
  clearAll: 'sheet.command.clear-selection-all',
  removeRows: 'sheet.command.remove-row-confirm',
  removeCols: 'sheet.command.remove-col-confirm',
  // View
  freezeFirstRow: 'sheet.command.set-first-row-frozen',
  freezeFirstCol: 'sheet.command.set-first-column-frozen',
  freezeSelection: 'sheet.command.set-selection-frozen',
  unfreeze: 'sheet.command.cancel-frozen',
  gridlines: 'sheet.command.toggle-gridlines',
  // Insert
  insertRowBefore: 'sheet.command.insert-row-before',
  insertRowAfter: 'sheet.command.insert-row-after',
  insertColBefore: 'sheet.command.insert-col-before',
  insertColAfter: 'sheet.command.insert-col-after',
  insertCellsDown: 'sheet.command.insert-range-move-down-confirm',
  insertCellsRight: 'sheet.command.insert-range-move-right-confirm',
  insertSheet: 'sheet.command.insert-sheet',
  insertImage: 'sheet.command.insert-float-image',
  insertCellImage: 'sheet.command.insert-cell-image',
  insertLink: 'sheet.operation.insert-hyper-link',
  insertNote: 'sheet.operation.add-note-popup',
  insertTable: 'sheet.operation.open-table-selector',
  // Format
  bold: 'sheet.command.set-range-bold',
  italic: 'sheet.command.set-range-italic',
  underline: 'sheet.command.set-range-underline',
  strike: 'sheet.command.set-range-stroke',
  numberFormat: 'sheet.operation.open.numfmt.panel',
  percent: 'sheet.command.numfmt.set.percent',
  currency: 'sheet.command.numfmt.set.currency',
  addDecimal: 'sheet.command.numfmt.add.decimal.command',
  subtractDecimal: 'sheet.command.numfmt.subtract.decimal.command',
  alignH: 'sheet.command.set-horizontal-text-align',
  alignV: 'sheet.command.set-vertical-text-align',
  wrap: 'sheet.command.set-text-wrap',
  mergeAll: 'sheet.command.add-worksheet-merge-all',
  mergeHorizontal: 'sheet.command.add-worksheet-merge-horizontal',
  mergeVertical: 'sheet.command.add-worksheet-merge-vertical',
  unmerge: 'sheet.command.remove-worksheet-merge',
  conditionalFormatting: 'sheet.operation.open.conditional.formatting.panel',
  autoWidth: 'sheet.command.set-col-auto-width',
  formatPainter: 'sheet.command.set-once-format-painter',
  // Data
  sortAsc: 'sheet.command.sort-range-asc',
  sortDesc: 'sheet.command.sort-range-desc',
  sortCustom: 'sheet.command.sort-range-custom',
  filter: 'sheet.command.smart-toggle-filter',
  clearFilter: 'sheet.command.clear-filter-criteria',
  reapplyFilter: 'sheet.command.re-calc-filter',
  validation: 'data-validation.operation.open-validation-panel',
  splitText: 'sheet.command.split-text-to-columns',
  namedRanges: 'sidebar.operation.defined-name',
  protectRange: 'sheet.command.add-range-protection-from-toolbar',
  // Drawings (charts are float DOM drawings)
  deleteDrawing: 'sheet.command.delete-drawing',
  removeDrawings: 'sheet.command.remove-sheet-image',
  // Observed ids (not executed by menus)
  setSelections: 'sheet.operation.set-selections',
  setZoom: 'sheet.operation.set-zoom-ratio',
  setActiveSheet: 'sheet.operation.set-worksheet-active',
  drawingApply: 'sheet.mutation.set-drawing-apply',
} as const

export type CommandName = keyof typeof UNIVER_COMMANDS

export interface SheetCommands {
  run(name: CommandName, params?: object): Promise<boolean>
  commands: ICommandService
  api: FUniver
}

export function createCommands(univer: Univer, univerAPI: FUniver): SheetCommands {
  const commands = univer.__getInjector().get(ICommandService)
  return {
    commands,
    api: univerAPI,
    run: async (name, params) => {
      try {
        return await commands.executeCommand(UNIVER_COMMANDS[name], params)
      } catch (err) {
        console.warn('Univer command failed', name, err)
        return false
      }
    },
  }
}

// Ids of the table that this Univer build does not register (smoke test after upgrades).
export function missingCommands(univer: Univer): string[] {
  const commands = univer.__getInjector().get(ICommandService)
  return Object.values(UNIVER_COMMANDS).filter((id) => !commands.hasCommand(id))
}
