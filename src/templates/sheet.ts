// Spreadsheet templates, built as Univer workbook snapshots (cells, formulas,
// styles, merges, conditional formatting and data validation).

import type { ICellData, IRange, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/presets'
import { pick, type Lang } from './types'
import { CHART_COMPONENT, CHART_KIND, DRAWING_TYPE_DOM, type ChartSpec } from '../apps/sheet/charts/model'
import { DrawingCollector } from '../apps/sheet/formats/drawings'

const CF_RESOURCE = 'SHEET_CONDITIONAL_FORMATTING_PLUGIN'
const DV_RESOURCE = 'SHEET_DATA_VALIDATION_PLUGIN'

// ---------- Styles ----------

const GRID = '#9aa0a6'
const edge = { s: 1, cl: { rgb: GRID } }
const BOX: IStyleData['bd'] = { t: edge, b: edge, l: edge, r: edge }
const CENTER = { ht: 2, vt: 2 } as const
const S = {
  title: { bl: 1, fs: 16, cl: { rgb: '#174ea6' } },
  label: { bl: 1 },
  note: { it: 1, cl: { rgb: '#5f6368' } },
  head: { bl: 1, bg: { rgb: '#dbe7f7' }, bd: BOX, ...CENTER, tb: 3 },
  group: { bl: 1, bg: { rgb: '#174ea6' }, cl: { rgb: '#ffffff' }, bd: BOX, ...CENTER },
  cell: { bd: BOX },
  center: { bd: BOX, ...CENTER },
  wrap: { bd: BOX, vt: 1, tb: 3 },
  input: { bd: BOX, bg: { rgb: '#fef7e0' } },
  avg: { bl: 1, bd: BOX, bg: { rgb: '#f1f3f4' }, ...CENTER, n: { pattern: '0.00' } },
  final: { bl: 1, bd: BOX, bg: { rgb: '#e6f4ea' }, ...CENTER, n: { pattern: '0.00' } },
  pct: { bd: BOX, ...CENTER, n: { pattern: '0%' } },
  count: { bl: 1, bd: BOX, bg: { rgb: '#f1f3f4' }, ...CENTER },
  side: { bl: 1, bd: BOX, bg: { rgb: '#f1f3f4' }, vt: 2, tb: 3 },
} satisfies Record<string, IStyleData>

const col = (c: number): string => (c >= 26 ? col(Math.floor(c / 26) - 1) : '') + String.fromCharCode(65 + (c % 26))
const ref = (r: number, c: number) => `${col(c)}${r + 1}`

class SheetBuilder {
  cellData: Record<number, Record<number, ICellData>> = {}
  mergeData: IRange[] = []
  columnData: Record<number, { w: number }> = {}
  rowData: Record<number, { h: number }> = {}
  cf: unknown[] = []
  dv: unknown[] = []
  freeze = { xSplit: 0, ySplit: 0, startRow: -1, startColumn: -1 }

  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  // A string starting with '=' is a formula.
  set(r: number, c: number, value: string | number | null, s?: IStyleData): this {
    const cell: ICellData = {}
    if (typeof value === 'string' && value.startsWith('=')) cell.f = value
    else if (value !== null && value !== '') {
      cell.v = value
      // Cell types (Univer's CellValueType): some features, like colour scales, need them.
      cell.t = typeof value === 'number' ? 2 : 1
    }
    if (s) cell.s = s
    ;(this.cellData[r] ||= {})[c] = cell
    return this
  }

  row(r: number, c: number, values: (string | number | null)[], s?: IStyleData): this {
    values.forEach((v, i) => this.set(r, c + i, v, s))
    return this
  }

  // Applies a style to a block, keeping values.
  style(r1: number, c1: number, r2: number, c2: number, s: IStyleData): this {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ((this.cellData[r] ||= {})[c] ||= {}).s = s
    return this
  }

  merge(r1: number, c1: number, r2: number, c2: number): this {
    this.mergeData.push({ startRow: r1, startColumn: c1, endRow: r2, endColumn: c2 })
    return this
  }

  width(c: number, w: number, count = 1): this {
    for (let i = 0; i < count; i++) this.columnData[c + i] = { w }
    return this
  }

  height(r: number, h: number, count = 1): this {
    for (let i = 0; i < count; i++) this.rowData[r + i] = { h }
    return this
  }

  freezeAt(rows: number, cols: number): this {
    this.freeze = { xSplit: cols, ySplit: rows, startRow: rows || -1, startColumn: cols || -1 }
    return this
  }

  highlight(range: IRange, rule: Record<string, unknown>, style: IStyleData): this {
    this.cf.push({ cfId: `${this.id}-cf-${this.cf.length + 1}`, ranges: [range], stopIfTrue: false, rule: { type: 'highlightCell', style, ...rule } })
    return this
  }

  colorScale(range: IRange, points: [number, string][]): this {
    this.cf.push({
      cfId: `${this.id}-cf-${this.cf.length + 1}`,
      ranges: [range],
      stopIfTrue: false,
      rule: { type: 'colorScale', config: points.map(([value, color], index) => ({ index, color, value: { type: 'num', value } })) },
    })
    return this
  }

  validate(range: IRange, rule: Record<string, unknown>): this {
    this.dv.push({
      uid: `${this.id}-dv-${this.dv.length + 1}`,
      ranges: [range],
      allowBlank: true,
      showDropDown: true,
      showErrorMessage: true,
      errorStyle: 1,
      ...rule,
    })
    return this
  }

  build(): IWorksheetData {
    return {
      id: this.id,
      name: this.name,
      rowCount: 1000,
      columnCount: 40,
      cellData: this.cellData,
      mergeData: this.mergeData,
      columnData: this.columnData,
      rowData: this.rowData,
      freeze: this.freeze,
    } as unknown as IWorksheetData
  }
}

const range = (r1: number, c1: number, r2: number, c2: number): IRange => ({ startRow: r1, startColumn: c1, endRow: r2, endColumn: c2 })

interface TemplateChart {
  sheet: SheetBuilder
  at: { row: number; col: number }
  size: { width: number; height: number }
  spec: Omit<ChartSpec, 'kind' | 'sheetId'>
}

function workbook(sheets: SheetBuilder[], charts: TemplateChart[] = []): Partial<IWorkbookData> {
  const built = Object.fromEntries(sheets.map((s) => [s.id, s.build()]))
  const drawings = new DrawingCollector(built as IWorkbookData['sheets'])
  for (const c of charts) {
    drawings.add(c.sheet.id, { column: c.at.col, columnOffset: 0, row: c.at.row, rowOffset: 0 }, c.size, {
      drawingType: DRAWING_TYPE_DOM,
      componentKey: CHART_COMPONENT,
      allowTransform: true,
      data: { kind: CHART_KIND, sheetId: c.sheet.id, ...c.spec },
    })
  }
  const cf: Record<string, unknown> = {}
  const dv: Record<string, unknown> = {}
  for (const s of sheets) {
    if (s.cf.length) cf[s.id] = s.cf
    if (s.dv.length) dv[s.id] = s.dv
  }
  return {
    name: '',
    styles: {},
    sheetOrder: sheets.map((s) => s.id),
    sheets: built,
    resources: [
      ...(drawings.empty ? [] : [drawings.resource()]),
      ...(Object.keys(cf).length ? [{ name: CF_RESOURCE, data: JSON.stringify(cf) }] : []),
      ...(Object.keys(dv).length ? [{ name: DV_RESOURCE, data: JSON.stringify(dv) }] : []),
    ],
  }
}

const FAIL: IStyleData = { bg: { rgb: '#fce8e6' }, cl: { rgb: '#a50e0e' } }
const PASS: IStyleData = { bg: { rgb: '#e6f4ea' }, cl: { rgb: '#137333' } }
// Formula rules (relative to the range's first cell), so empty cells stay uncoloured.
const failRule = (cell: string) => ({ subType: 'formula', value: `=AND(ISNUMBER(${cell}),${cell}<5)` })
const passRule = (cell: string) => ({ subType: 'formula', value: `=AND(ISNUMBER(${cell}),${cell}>=5)` })
const grade0to10 = (lang: Lang) => ({
  type: 'decimal',
  operator: 'between',
  formula1: '0',
  formula2: '10',
  error: pick(lang)('Introduce una nota entre 0 y 10', 'Introduce unha nota entre 0 e 10', 'Saisis une note entre 0 et 10', 'Gib eine Note zwischen 0 und 10 ein'),
})

// Qualitative grades for 0-10 grades (<5, <6, <7, <9, else), with their abbreviation:
// the LOMLOE scale in Spain (IN, SU, BI, NT, SB), the usual mentions in France
// and the school grades in Germany. The pass mark stays at 5.
const GRADE_NAMES: Record<Lang, [string, string][]> = {
  es: [['Insuficiente', 'IN'], ['Suficiente', 'SU'], ['Bien', 'BI'], ['Notable', 'NT'], ['Sobresaliente', 'SB']],
  gl: [['Insuficiente', 'IN'], ['Suficiente', 'SU'], ['Ben', 'BI'], ['Notable', 'NT'], ['Sobresaliente', 'SB']],
  fr: [['Insuffisant', 'I'], ['Passable', 'P'], ['Assez bien', 'AB'], ['Bien', 'B'], ['Très bien', 'TB']],
  de: [['Mangelhaft', '5'], ['Ausreichend', '4'], ['Befriedigend', '3'], ['Gut', '2'], ['Sehr gut', '1']],
}

function levelFormula(lang: Lang, cell: string): string {
  const [a, b, c, d, e] = GRADE_NAMES[lang].map(([name]) => name)
  return `=IF(${cell}="","",IF(${cell}<5,"${a}",IF(${cell}<6,"${b}",IF(${cell}<7,"${c}",IF(${cell}<9,"${d}","${e}")))))`
}

// Deterministic sample grades so the formulas show results.
const sample = (i: number, j: number) => Math.round((4 + ((i * 7 + j * 3) % 13) / 2.2) * 10) / 10

// ---------- Templates ----------

function gradebook(lang: Lang): Partial<IWorkbookData> {
  const L = pick(lang)
  const W = `'${L('Ponderación', 'Ponderación', 'Pondération', 'Gewichtung')}'`
  const acts = [L('Prueba escrita', 'Proba escrita', 'Contrôle écrit', 'Klassenarbeit'), L('Trabajos y proyectos', 'Traballos e proxectos', 'Travaux et projets', 'Arbeiten und Projekte'), L('Cuaderno y tareas', 'Caderno e tarefas', 'Cahier et devoirs', 'Heft und Hausaufgaben')]
  const evals = [L('1.ª evaluación', '1.ª avaliación', '1er trimestre', '1. Trimester'), L('2.ª evaluación', '2.ª avaliación', '2e trimestre', '2. Trimester'), L('3.ª evaluación', '3.ª avaliación', '3e trimestre', '3. Trimester')]
  const students = 25
  const first = 5 // first student row
  const last = first + students - 1

  // Weights sheet: activity weights per evaluation (rows 4-6) and each evaluation's weight in the final grade.
  const w = new SheetBuilder('sheet-2', L('Ponderación', 'Ponderación', 'Pondération', 'Gewichtung'))
  w.set(0, 0, L('Ponderación de los instrumentos de evaluación', 'Ponderación dos instrumentos de avaliación', 'Pondération des instruments d’évaluation', 'Gewichtung der Bewertungsinstrumente'), S.title)
  w.set(1, 0, L('Cambia los porcentajes: las medias del cuaderno de notas se recalculan solas.', 'Cambia as porcentaxes: as medias do caderno de notas recalcúlanse soas.', 'Modifie les pourcentages : les moyennes du carnet de notes se recalculent automatiquement.', 'Ändere die Prozentsätze: Die Durchschnitte im Notenbuch werden automatisch neu berechnet.'), S.note)
  w.row(2, 0, [L('Evaluación', 'Avaliación', 'Période', 'Zeitraum'), ...acts, L('Suma', 'Suma', 'Somme', 'Summe'), L('Peso en la nota final', 'Peso na nota final', 'Poids dans la note finale', 'Gewicht in der Endnote')], S.head)
  const weights = [
    [0.6, 0.3, 0.1, 0.3],
    [0.6, 0.3, 0.1, 0.3],
    [0.5, 0.4, 0.1, 0.4],
  ]
  weights.forEach((row, i) => {
    const r = 3 + i
    w.set(r, 0, evals[i], S.side)
    row.slice(0, 3).forEach((v, j) => w.set(r, 1 + j, v, { ...S.pct, bg: { rgb: '#fef7e0' } }))
    w.set(r, 4, `=SUM(B${r + 1}:D${r + 1})`, S.pct)
    w.set(r, 5, row[3], { ...S.pct, bg: { rgb: '#fef7e0' } })
  })
  w.set(6, 4, L('Total', 'Total', 'Total', 'Gesamt'), S.label).set(6, 5, '=SUM(F4:F6)', S.pct)
  w.highlight(range(3, 4, 5, 4), { subType: 'number', operator: 'notEqual', value: 1 }, FAIL)
  w.highlight(range(6, 5, 6, 5), { subType: 'number', operator: 'notEqual', value: 1 }, FAIL)
  w.set(8, 0, L('Escala de calificación', 'Escala de cualificación', 'Barème', 'Notenskala'), { bl: 1, fs: 12 })
  w.row(9, 0, [L('Calificación', 'Cualificación', 'Appréciation', 'Bewertung'), L('Nota', 'Nota', 'Note', 'Punkte')], S.head)
  const bands = ['0 – 4,99', '5 – 5,99', '6 – 6,99', '7 – 8,99', '9 – 10']
  GRADE_NAMES[lang].forEach(([name, abbr], i) => w.row(10 + i, 0, [`${name} (${abbr})`, bands[i]], S.cell))
  w.width(0, 170).width(1, 130, 3).width(4, 80).width(5, 150).height(2, 40)

  // Grades sheet.
  const g = new SheetBuilder('sheet-1', L('Notas', 'Notas', 'Notes', 'Noten'))
  g.set(0, 0, L('Cuaderno de notas', 'Caderno de notas', 'Carnet de notes', 'Notenbuch'), S.title)
  g.set(1, 1, L('Materia', 'Materia', 'Matière', 'Fach'), { ...S.label, ht: 3 })
  g.set(1, 2, '', S.input).style(1, 3, 1, 5, S.input).merge(1, 2, 1, 5)
  g.set(1, 6, L('Grupo', 'Grupo', 'Groupe', 'Gruppe'), { ...S.label, ht: 3 })
  g.set(1, 7, '', S.input).style(1, 8, 1, 8, S.input).merge(1, 7, 1, 8)
  g.set(1, 10, L('Curso escolar', 'Curso escolar', 'Année scolaire', 'Schuljahr'), { ...S.label, ht: 3 }).merge(1, 10, 1, 11)
  g.set(1, 12, '', S.input).style(1, 13, 1, 13, S.input).merge(1, 12, 1, 13)
  g.set(3, 0, L('N.º', 'N.º', 'N°', 'Nr.'), S.head).set(3, 1, L('Alumno/a', 'Alumno/a', 'Élève', 'Schüler/in'), S.head)
  g.merge(3, 0, 4, 0).merge(3, 1, 4, 1)
  g.style(4, 0, 4, 1, S.head)
  evals.forEach((name, e) => {
    const c = 2 + e * 4
    g.set(3, c, name, S.group).style(3, c + 1, 3, c + 3, S.group).merge(3, c, 3, c + 3)
    g.row(4, c, [...acts, L('Media', 'Media', 'Moyenne', 'Schnitt')], S.head)
  })
  g.set(3, 14, L('Final', 'Final', 'Final', 'Gesamt'), S.group).style(3, 15, 3, 15, S.group).merge(3, 14, 3, 15)
  g.row(4, 14, [L('Nota final', 'Nota final', 'Note finale', 'Endnote'), L('Calificación', 'Cualificación', 'Appréciation', 'Bewertung')], S.head)

  for (let i = 0; i < students; i++) {
    const r = first + i
    const n = r + 1
    g.set(r, 0, i + 1, S.center)
    g.set(r, 1, i < 5 ? `${L('Alumno/a de ejemplo', 'Alumno/a de exemplo', 'Élève exemple', 'Beispielschüler/in')} ${i + 1}` : '', S.cell)
    for (let e = 0; e < 3; e++) {
      const c = 2 + e * 4
      for (let j = 0; j < 3; j++) g.set(r, c + j, i < 5 && e < 2 ? sample(i, e * 3 + j) : null, S.center)
      const grades = `${col(c)}${n}:${col(c + 2)}${n}`
      const wr = 4 + e
      g.set(r, c + 3, `=IF(COUNT(${grades})=0,"",ROUND(SUMPRODUCT(${grades},${W}!$B$${wr}:$D$${wr})/SUM(${W}!$B$${wr}:$D$${wr}),2))`, S.avg)
    }
    // Final grade: weighted mean of the evaluations that have a grade so far.
    const parts = [5, 9, 13].map((c, e) => [`${col(c)}${n}`, `${W}!$F$${4 + e}`])
    const num = parts.map(([cell, wt]) => `IF(${cell}="",0,${cell}*${wt})`).join('+')
    const den = parts.map(([cell, wt]) => `IF(${cell}="",0,${wt})`).join('+')
    g.set(r, 14, `=IF(COUNT(F${n},J${n},N${n})=0,"",ROUND((${num})/(${den}),2))`, S.final)
    g.set(r, 15, levelFormula(lang, `O${n}`), S.center)
  }

  // Group statistics.
  const stats: [string, (c: string) => string, IStyleData][] = [
    [L('Media del grupo', 'Media do grupo', 'Moyenne du groupe', 'Klassenschnitt'), (c) => `=IFERROR(ROUND(AVERAGE(${c}),2),"")`, S.avg],
    [L('Aprobados', 'Aprobados', 'Admis', 'Bestanden'), (c) => `=COUNTIF(${c},">=5")`, S.center],
    [L('Suspensos', 'Suspensos', 'Non admis', 'Nicht bestanden'), (c) => `=COUNTIF(${c},"<5")`, S.center],
    [L('% de aprobados', '% de aprobados', '% d’admis', '% bestanden'), (c) => `=IF(COUNT(${c})=0,"",COUNTIF(${c},">=5")/COUNT(${c}))`, S.pct],
  ]
  stats.forEach(([label, f, s], k) => {
    const r = last + 2 + k
    g.set(r, 1, label, S.side)
    for (let c = 2; c <= 14; c++) g.set(r, c, f(`${col(c)}${first + 1}:${col(c)}${last + 1}`), s)
  })

  // Grade distribution of the final grades (qualitative levels) and its chart.
  const dist = last + 7
  g.row(dist, 1, [L('Distribución de calificaciones', 'Distribución de cualificacións', 'Répartition des appréciations', 'Notenverteilung'), L('Alumnos', 'Alumnado', 'Élèves', 'Schüler/innen')], S.head).height(dist, 40)
  GRADE_NAMES[lang].forEach(([name, abbr], k) => {
    g.set(dist + 1 + k, 1, `${name} (${abbr})`, S.side)
    g.set(dist + 1 + k, 2, `=COUNTIF($P$${first + 1}:$P$${last + 1},"${name}")`, S.center)
  })
  const chart: TemplateChart = {
    sheet: g,
    at: { row: dist, col: 4 },
    size: { width: 520, height: 280 },
    spec: {
      type: 'column',
      range: `B${dist + 1}:C${dist + 6}`,
      seriesIn: 'columns',
      headerRow: true,
      headerCol: true,
      title: L('Distribución de la nota final', 'Distribución da nota final', 'Répartition de la note finale', 'Verteilung der Endnoten'),
      legend: 'none',
      xTitle: '',
      yTitle: L('Alumnos', 'Alumnado', 'Élèves', 'Schüler/innen'),
      palette: 'ofimeo',
    },
  }

  const grades = range(first, 2, last, 14)
  g.highlight(grades, failRule('C6'), FAIL)
  g.highlight(grades, passRule('C6'), PASS)
  g.highlight(range(first, 15, last, 15), { subType: 'text', operator: 'equal', value: GRADE_NAMES[lang][0][0] }, FAIL)
  for (let e = 0; e < 3; e++) g.validate(range(first, 2 + e * 4, last, 4 + e * 4), grade0to10(lang))
  // German activity names are longer.
  g.width(0, 40).width(1, 200).width(2, lang === 'de' ? 112 : 88, 13).width(14, 80).width(15, 110).height(4, 48)
  g.freezeAt(first, 2)

  return workbook([g, w], [chart])
}

function timetable(lang: Lang): Partial<IWorkbookData> {
  const L = pick(lang)
  const s = new SheetBuilder('sheet-1', L('Horario', 'Horario', 'Emploi du temps', 'Stundenplan'))
  const days = {
    es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
    gl: ['Luns', 'Martes', 'Mércores', 'Xoves', 'Venres'],
    fr: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'],
  }[lang]
  const slots = ['08:45 – 09:35', '09:35 – 10:25', '10:25 – 11:15', 'break', '11:45 – 12:35', '12:35 – 13:25', '13:25 – 14:15']
  s.set(0, 0, L('Horario semanal', 'Horario semanal', 'Emploi du temps hebdomadaire', 'Wochenstundenplan'), S.title)
  s.set(1, 0, L('Grupo / docente', 'Grupo / docente', 'Groupe / enseignant(e)', 'Klasse / Lehrkraft'), S.label).set(1, 1, '', S.input)
  s.set(1, 3, L('Curso escolar', 'Curso escolar', 'Année scolaire', 'Schuljahr'), S.label).set(1, 4, '', S.input)
  s.row(3, 0, [L('Hora', 'Hora', 'Heure', 'Zeit'), ...days], S.head)
  slots.forEach((slot, i) => {
    const r = 4 + i
    if (slot === 'break') {
      s.set(r, 0, '11:15 – 11:45', { ...S.side, ht: 2 })
      s.set(r, 1, L('Recreo', 'Recreo', 'Récréation', 'Pause'), { ...S.head, bg: { rgb: '#e8eaed' } }).style(r, 2, r, 5, S.head).merge(r, 1, r, 5)
      s.height(r, 28)
      return
    }
    s.set(r, 0, slot, { ...S.side, ht: 2 })
    for (let d = 1; d <= 5; d++) s.set(r, d, '', { ...S.center, tb: 3 })
    s.height(r, 52)
  })
  s.set(12, 0, L('Materias, docentes y aulas', 'Materias, docentes e aulas', 'Matières, enseignants et salles', 'Fächer, Lehrkräfte und Räume'), { bl: 1, fs: 12 })
  s.row(13, 0, [L('Materia', 'Materia', 'Matière', 'Fach'), L('Docente', 'Docente', 'Enseignant(e)', 'Lehrkraft'), L('Aula', 'Aula', 'Salle', 'Raum'), L('Horas semanales', 'Horas semanais', 'Heures par semaine', 'Wochenstunden')], S.head)
  for (let i = 0; i < 8; i++) s.row(14 + i, 0, ['', '', '', ''], S.cell)
  s.set(22, 2, L('Total', 'Total', 'Total', 'Gesamt'), S.label).set(22, 3, '=SUM(D15:D22)', S.center)
  s.width(0, 120).width(1, 150, 5).height(3, 30)
  return workbook([s])
}

function attendance(lang: Lang): Partial<IWorkbookData> {
  const L = pick(lang)
  const s = new SheetBuilder('sheet-1', L('Asistencia', 'Asistencia', 'Présences', 'Anwesenheit'))
  const now = new Date()
  const students = 30
  const first = 5
  const last = first + students - 1
  const DAY0 = 2 // column of day 1
  const DAYN = DAY0 + 30
  const date = (c: number) => `DATE($E$2,$B$2,${ref(3, c)})`
  const weekdays = {
    es: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
    gl: ['D', 'L', 'M', 'Mé', 'X', 'V', 'S'],
    fr: ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'],
    de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  }[lang]
  // Codes for absence, justified absence and late arrival.
  const [A, J, R] = { es: 'FJR', gl: 'FJR', fr: 'AJR', de: 'FEV' }[lang]

  s.set(0, 0, L('Registro de asistencia', 'Rexistro de asistencia', 'Registre de présence', 'Anwesenheitsliste'), S.title)
  s.set(1, 0, L('Mes', 'Mes', 'Mois', 'Monat'), S.label).set(1, 1, now.getMonth() + 1, { ...S.input, ht: 2 })
  s.set(1, 2, L('Año', 'Ano', 'Année', 'Jahr'), S.label).merge(1, 2, 1, 3)
  s.set(1, 4, now.getFullYear(), { ...S.input, ht: 2 }).style(1, 5, 1, 5, S.input).merge(1, 4, 1, 5)
  s.set(1, 7, L('Grupo', 'Grupo', 'Groupe', 'Gruppe'), S.label).merge(1, 7, 1, 8)
  s.set(1, 9, '', S.input).style(1, 10, 1, 13, S.input).merge(1, 9, 1, 13)
  s.set(1, 16, L('Días lectivos', 'Días lectivos', 'Jours de classe', 'Schultage'), S.label).merge(1, 16, 1, 20)
  s.set(1, 21, '=NETWORKDAYS(DATE(E2,B2,1),EOMONTH(DATE(E2,B2,1),0))', { ...S.input, ht: 2 }).style(1, 22, 1, 22, S.input).merge(1, 21, 1, 22)
  s.set(
    2,
    0,
    L(
      'Códigos: F = falta · J = falta justificada · R = retraso · (vacío) = presente. Ajusta los días lectivos si hay festivos.',
      'Códigos: F = falta · J = falta xustificada · R = atraso · (baleiro) = presente. Axusta os días lectivos se hai festivos.',
      'Codes : A = absence · J = absence justifiée · R = retard · (vide) = présent. Ajuste le nombre de jours de classe en cas de jours fériés.',
      'Codes: F = Fehltag · E = entschuldigt · V = Verspätung · (leer) = anwesend. Passe die Schultage bei Feiertagen an.',
    ),
    S.note,
  )
  s.set(3, 0, L('N.º', 'N.º', 'N°', 'Nr.'), S.head).set(3, 1, L('Alumno/a', 'Alumno/a', 'Élève', 'Schüler/in'), S.head).merge(3, 0, 4, 0).merge(3, 1, 4, 1).style(4, 0, 4, 1, S.head)
  for (let d = 1; d <= 31; d++) {
    const c = DAY0 + d - 1
    s.set(3, c, d <= 28 ? d : `=IF(${d}<=DAY(EOMONTH(DATE($E$2,$B$2,1),0)),${d},"")`, S.head)
    s.set(4, c, `=IF(${ref(3, c)}="","",CHOOSE(WEEKDAY(${date(c)}),${weekdays.map((w) => `"${w}"`).join(',')}))`, { ...S.head, bl: 0 })
  }
  const tot = DAYN + 1
  const totals = [A, J, R, L('% asist.', '% asist.', '% prés.', '% anw.')]
  totals.forEach((label, i) => s.set(3, tot + i, label, S.group).merge(3, tot + i, 4, tot + i).style(4, tot + i, 4, tot + i, S.group))

  for (let i = 0; i < students; i++) {
    const r = first + i
    const n = r + 1
    const days = `${col(DAY0)}${n}:${col(DAYN)}${n}`
    s.set(r, 0, i + 1, S.center).set(r, 1, '', S.cell)
    for (let c = DAY0; c <= DAYN; c++) s.set(r, c, null, S.center)
    s.set(r, tot, `=COUNTIF(${days},"${A}")`, S.count)
    s.set(r, tot + 1, `=COUNTIF(${days},"${J}")`, S.count)
    s.set(r, tot + 2, `=COUNTIF(${days},"${R}")`, S.count)
    s.set(r, tot + 3, `=IF($V$2=0,"",1-(${col(tot)}${n}+${col(tot + 1)}${n})/$V$2)`, { ...S.pct, bl: 1 })
  }
  const sumRow = last + 1
  s.set(sumRow, 1, L('Ausencias del día', 'Ausencias do día', 'Absences du jour', 'Fehlende am Tag'), S.side)
  for (let c = DAY0; c <= DAYN + 3; c++) {
    const rg = `${col(c)}${first + 1}:${col(c)}${last + 1}`
    s.set(sumRow, c, c <= DAYN ? `=COUNTIF(${rg},"${A}")+COUNTIF(${rg},"${J}")` : `=SUM(${rg})`, S.count)
  }

  const grid = range(first, DAY0, last, DAYN)
  s.highlight(grid, { subType: 'text', operator: 'equal', value: A }, { bg: { rgb: '#f28b82' }, bl: 1 })
  s.highlight(grid, { subType: 'text', operator: 'equal', value: J }, { bg: { rgb: '#fdd663' } })
  s.highlight(grid, { subType: 'text', operator: 'equal', value: R }, { bg: { rgb: '#fcc896' } })
  // Weekends in grey.
  s.highlight(range(first, DAY0, last, DAYN), { subType: 'formula', value: `=AND(ISNUMBER(${col(DAY0)}$4),WEEKDAY(DATE($E$2,$B$2,${col(DAY0)}$4),2)>5)` }, { bg: { rgb: '#e8eaed' } })
  s.highlight(range(first, tot + 3, last, tot + 3), { subType: 'number', operator: 'lessThan', value: 0.85 }, FAIL)
  // Text render mode: no dropdown chip in every cell of the grid.
  s.validate(grid, { type: 'list', formula1: `${A},${J},${R}`, renderMode: 0, error: L('Usa F, J o R', 'Usa F, J ou R', 'Utilise A, J ou R', 'Verwende F, E oder V') })
  s.width(0, 36).width(1, 190).width(DAY0, 30, 31).width(tot, 40, 3).width(tot + 3, 70)
  s.freezeAt(first, 2)
  return workbook([s])
}

function scoredRubric(lang: Lang): Partial<IWorkbookData> {
  const L = pick(lang)
  const R = `'${L('Rúbrica', 'Rúbrica', 'Grille', 'Raster')}'`
  const levels = [
    L('Excelente (4)', 'Excelente (4)', 'Excellent (4)', 'Sehr gut (4)'),
    L('Bien (3)', 'Ben (3)', 'Bien (3)', 'Gut (3)'),
    L('Suficiente (2)', 'Suficiente (2)', 'Suffisant (2)', 'Ausreichend (2)'),
    L('Insuficiente (1)', 'Insuficiente (1)', 'Insuffisant (1)', 'Nicht ausreichend (1)'),
  ]
  const criteria: [string, number, string[]][] = [
    [
      L('Contenido', 'Contido', 'Contenu', 'Inhalt'),
      0.3,
      [
        L('Completo, riguroso y bien relacionado.', 'Completo, rigoroso e ben relacionado.', 'Complet, rigoureux et bien relié.', 'Vollständig, genau und gut verknüpft.'),
        L('Correcto con pequeñas omisiones.', 'Correcto con pequenas omisións.', 'Correct avec de petits oublis.', 'Korrekt mit kleinen Lücken.'),
        L('Básico, con algunos errores.', 'Básico, con algúns erros.', 'Basique, avec quelques erreurs.', 'Grundlegend, mit einigen Fehlern.'),
        L('Escaso o incorrecto.', 'Escaso ou incorrecto.', 'Insuffisant ou incorrect.', 'Lückenhaft oder falsch.'),
      ],
    ],
    [
      L('Organización', 'Organización', 'Organisation', 'Aufbau'),
      0.2,
      [L('Estructura clara y lógica.', 'Estrutura clara e lóxica.', 'Structure claire et logique.', 'Klare und logische Struktur.'), L('Clara con algún salto.', 'Clara con algún salto.', 'Claire avec quelques ruptures.', 'Klar mit einzelnen Sprüngen.'), L('Poco clara.', 'Pouco clara.', 'Peu claire.', 'Wenig klar.'), L('Sin estructura.', 'Sen estrutura.', 'Sans structure.', 'Ohne Struktur.')],
    ],
    [
      L('Expresión', 'Expresión', 'Expression', 'Ausdruck'),
      0.2,
      [L('Precisa y sin errores.', 'Precisa e sen erros.', 'Précise et sans erreurs.', 'Präzise und fehlerfrei.'), L('Adecuada, errores leves.', 'Axeitada, erros leves.', 'Adaptée, erreurs légères.', 'Angemessen, leichte Fehler.'), L('Limitada, varios errores.', 'Limitada, varios erros.', 'Limitée, plusieurs erreurs.', 'Begrenzt, mehrere Fehler.'), L('Errores graves.', 'Erros graves.', 'Erreurs graves.', 'Schwere Fehler.')],
    ],
    [
      L('Trabajo en equipo', 'Traballo en equipo', 'Travail en équipe', 'Teamarbeit'),
      0.15,
      [L('Lidera y colabora siempre.', 'Lidera e colabora sempre.', 'Mène le groupe et coopère toujours.', 'Übernimmt Führung und arbeitet immer mit.'), L('Colabora casi siempre.', 'Colabora case sempre.', 'Coopère presque toujours.', 'Arbeitet fast immer mit.'), L('Colabora a veces.', 'Colabora ás veces.', 'Coopère parfois.', 'Arbeitet manchmal mit.'), L('No colabora.', 'Non colabora.', 'Ne coopère pas.', 'Arbeitet nicht mit.')],
    ],
    [
      L('Presentación', 'Presentación', 'Présentation', 'Gestaltung'),
      0.15,
      [L('Cuidada y original.', 'Coidada e orixinal.', 'Soignée et originale.', 'Sorgfältig und originell.'), L('Cuidada.', 'Coidada.', 'Soignée.', 'Sorgfältig.'), L('Aceptable.', 'Aceptable.', 'Acceptable.', 'Akzeptabel.'), L('Descuidada.', 'Descoidada.', 'Négligée.', 'Nachlässig.')],
    ],
  ]

  const r = new SheetBuilder('sheet-1', L('Rúbrica', 'Rúbrica', 'Grille', 'Raster'))
  r.set(0, 0, L('Rúbrica: ', 'Rúbrica: ', 'Grille : ', 'Raster: ') + L('descriptores y pesos', 'descritores e pesos', 'descripteurs et poids', 'Beschreibungen und Gewichtung'), S.title)
  r.set(1, 0, L('Edita criterios, descriptores y pesos; la hoja «Puntuación» calcula la nota.', 'Edita criterios, descritores e pesos; a folla «Puntuación» calcula a nota.', 'Modifie les critères, les descripteurs et les poids ; la feuille « Score » calcule la note.', 'Bearbeite Kriterien, Beschreibungen und Gewichtung; das Blatt „Punkte“ berechnet die Note.'), S.note)
  r.row(3, 0, [L('Criterio', 'Criterio', 'Critère', 'Kriterium'), L('Peso', 'Peso', 'Poids', 'Gewichtung'), ...levels], S.head)
  criteria.forEach(([name, weight, desc], i) => {
    r.set(4 + i, 0, name, S.side).set(4 + i, 1, weight, { ...S.pct, bg: { rgb: '#fef7e0' } })
    desc.forEach((d, j) => r.set(4 + i, 2 + j, d, S.wrap))
    r.height(4 + i, 54)
  })
  r.set(9, 0, L('Total', 'Total', 'Total', 'Gesamt'), S.label).set(9, 1, '=SUM(B5:B9)', S.pct)
  r.highlight(range(9, 1, 9, 1), { subType: 'number', operator: 'notEqual', value: 1 }, FAIL)
  r.width(0, 150).width(1, 70).width(2, 170, 4).height(3, 30)

  const p = new SheetBuilder('sheet-2', L('Puntuación', 'Puntuación', 'Score', 'Punkte'))
  const n = criteria.length
  const lastC = 2 + n - 1
  const students = 25
  const first = 5
  const last = first + students - 1
  p.set(0, 0, L('Puntuación automática', 'Puntuación automática', 'Score automatique', 'Automatische Punktevergabe'), S.title)
  p.set(1, 0, L('Escribe el nivel de cada criterio (1 = Insuficiente … 4 = Excelente). Nota = Σ(nivel × peso) ÷ 4 × 10.', 'Escribe o nivel de cada criterio (1 = Insuficiente … 4 = Excelente). Nota = Σ(nivel × peso) ÷ 4 × 10.', 'Saisis le niveau de chaque critère (1 = Insuffisant … 4 = Excellent). Note = Σ(niveau × poids) ÷ 4 × 10.', 'Gib für jedes Kriterium die Stufe ein (1 = Nicht ausreichend … 4 = Sehr gut). Note = Σ(Stufe × Gewichtung) ÷ 4 × 10.'), S.note)
  p.set(3, 0, L('N.º', 'N.º', 'N°', 'Nr.'), S.head).set(3, 1, L('Alumno/a', 'Alumno/a', 'Élève', 'Schüler/in'), S.head)
  p.set(4, 0, '', S.head).set(4, 1, L('Peso', 'Peso', 'Poids', 'Gewichtung'), S.head)
  for (let j = 0; j < n; j++) {
    p.set(3, 2 + j, `=${R}!A${5 + j}`, S.head)
    p.set(4, 2 + j, `=${R}!B${5 + j}`, { ...S.pct, bl: 1, bg: { rgb: '#dbe7f7' } })
  }
  p.set(3, lastC + 1, L('Nota (0–10)', 'Nota (0–10)', 'Note (0–10)', 'Punkte (0–10)'), S.group).set(3, lastC + 2, L('Calificación', 'Cualificación', 'Appréciation', 'Bewertung'), S.group)
  p.style(4, lastC + 1, 4, lastC + 2, S.group)
  const levelsRange = `$C$5:$${col(lastC)}$5`
  for (let i = 0; i < students; i++) {
    const row = first + i
    const nr = row + 1
    p.set(row, 0, i + 1, S.center).set(row, 1, i < 3 ? `${L('Alumno/a de ejemplo', 'Alumno/a de exemplo', 'Élève exemple', 'Beispielschüler/in')} ${i + 1}` : '', S.cell)
    for (let j = 0; j < n; j++) p.set(row, 2 + j, RUBRIC_SAMPLE[i]?.[j] ?? null, S.center)
    const cells = `C${nr}:${col(lastC)}${nr}`
    p.set(row, lastC + 1, `=IF(COUNT(${cells})=0,"",ROUND(SUMPRODUCT(${cells},${levelsRange})/(4*SUM(${levelsRange}))*10,2))`, S.final)
    p.set(row, lastC + 2, levelFormula(lang, `${col(lastC + 1)}${nr}`), S.center)
  }
  p.colorScale(range(first, 2, last, lastC), [
    [1, '#f28b82'],
    [2.5, '#fde293'],
    [4, '#81c995'],
  ])
  p.highlight(range(first, lastC + 1, last, lastC + 1), failRule(`${col(lastC + 1)}${first + 1}`), FAIL)
  p.validate(range(first, 2, last, lastC), { type: 'whole', operator: 'between', formula1: '1', formula2: '4', error: L('El nivel va de 1 a 4', 'O nivel vai de 1 a 4', 'Le niveau va de 1 à 4', 'Die Stufe liegt zwischen 1 und 4') })
  p.width(0, 40).width(1, 200).width(2, 110, n).width(lastC + 1, 90).width(lastC + 2, 110).height(3, 36)
  p.freezeAt(first, 2)

  return workbook([r, p])
}

// Sample levels for three students (one of each outcome).
const RUBRIC_SAMPLE = [
  [2, 3, 3, 4, 2],
  [4, 3, 4, 3, 4],
  [1, 2, 1, 2, 2],
]

const BUILDERS: Record<string, (lang: Lang) => Partial<IWorkbookData>> = {
  gradebook,
  timetable,
  attendance,
  'scored-rubric': scoredRubric,
}

// Snapshot of a template (exported for tests).
export const sheetTemplateData = (id: string, lang: Lang) => BUILDERS[id](lang)

export async function createSheetTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const { createFromWorkbook } = await import('../apps/sheet')
  return createFromWorkbook(name, BUILDERS[id](lang))
}
