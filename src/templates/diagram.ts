// Diagram templates, written as draw.io XML and opened through the diagram
// editor's .drawio import.

import { appInfo } from '../apps/registry'
import { pick, type Lang } from './types'

type Cells = string[]

const xmlEscape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

class Page {
  cells: Cells = []
  private n = 0

  constructor(readonly name: string) {}

  vertex(value: string, x: number, y: number, w: number, h: number, style: string): string {
    const id = `v${++this.n}`
    this.cells.push(
      `<mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    )
    return id
  }

  edge(source: string, target: string, value = '', style = EDGE): string {
    const id = `e${++this.n}`
    this.cells.push(
      `<mxCell id="${id}" value="${xmlEscape(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    )
    return id
  }

  // A free edge between two points (lines, axes).
  line(x1: number, y1: number, x2: number, y2: number, style: string): void {
    this.cells.push(
      `<mxCell id="l${++this.n}" style="${style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y1}" as="sourcePoint"/><mxPoint x="${x2}" y="${y2}" as="targetPoint"/></mxGeometry></mxCell>`,
    )
  }

  xml(index: number): string {
    return `<diagram id="page-${index + 1}" name="${xmlEscape(this.name)}"><mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${this.cells.join('')}</root></mxGraphModel></diagram>`
  }
}

const file = (pages: Page[]) => `<mxfile host="ofimeo">${pages.map((p, i) => p.xml(i)).join('')}</mxfile>`

const EDGE = 'edgeStyle=none;html=1;endArrow=classic;rounded=0;fontSize=12;labelBackgroundColor=#ffffff;'
const TEXT = 'text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;'
const box = (fill: string, stroke: string, extra = '') =>
  `rounded=1;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};fontSize=14;arcSize=20;${extra}`

// ---------- Templates ----------

function conceptMap(lang: Lang): string {
  const L = pick(lang)
  const p = new Page(L('Mapa conceptual', 'Mapa conceptual', 'Carte conceptuelle', 'Concept-Map', 'Concept map'))
  p.vertex(L('Mapa conceptual: el ecosistema', 'Mapa conceptual: o ecosistema', 'Carte conceptuelle : l’écosystème', 'Concept-Map: das Ökosystem', 'Concept map: the ecosystem'), 290, 10, 420, 40, `${TEXT}fontSize=20;fontStyle=1;`)
  const root = p.vertex(L('Ecosistema', 'Ecosistema', 'Écosystème', 'Ökosystem', 'Ecosystem'), 410, 70, 180, 60, box('#1a73e8', '#174ea6', 'fontColor=#ffffff;fontStyle=1;fontSize=18;'))
  const bio = p.vertex(L('Factores bióticos', 'Factores bióticos', 'Facteurs biotiques', 'Biotische Faktoren', 'Biotic factors'), 170, 220, 180, 50, box('#d2e3fc', '#1a73e8', 'fontStyle=1;'))
  const abio = p.vertex(L('Factores abióticos', 'Factores abióticos', 'Facteurs abiotiques', 'Abiotische Faktoren', 'Abiotic factors'), 650, 220, 180, 50, box('#fce8b2', '#f9ab00', 'fontStyle=1;'))
  p.edge(root, bio, L('formado por', 'formado por', 'formé de', 'besteht aus', 'made up of'))
  p.edge(root, abio, L('formado por', 'formado por', 'formé de', 'besteht aus', 'made up of'))
  const leaf = (label: string, x: number, y: number, fill: string, stroke: string) => p.vertex(label, x, y, 130, 44, box(fill, stroke))
  const bioKids = [L('Productores', 'Produtores', 'Producteurs', 'Produzenten', 'Producers'), L('Consumidores', 'Consumidores', 'Consommateurs', 'Konsumenten', 'Consumers'), L('Descomponedores', 'Descompoñedores', 'Décomposeurs', 'Destruenten', 'Decomposers')].map((l, i) =>
    leaf(l, 30 + i * 150, 380, '#e8f0fe', '#669df6'),
  )
  bioKids.forEach((k) => p.edge(bio, k, L('pueden ser', 'poden ser', 'peuvent être', 'können sein', 'can be')))
  const abioKids = [L('Agua', 'Auga', 'Eau', 'Wasser', 'Water'), L('Luz', 'Luz', 'Lumière', 'Licht', 'Light'), L('Temperatura', 'Temperatura', 'Température', 'Temperatur', 'Temperature'), L('Suelo', 'Solo', 'Sol', 'Boden', 'Soil')].map((l, i) => leaf(l, 520 + i * 140, 380, '#fef7e0', '#f9ab00'))
  abioKids.forEach((k) => p.edge(abio, k))
  p.edge(abio, bio, L('condicionan', 'condicionan', 'conditionnent', 'beeinflussen', 'determine'), `${EDGE}dashed=1;`)
  const ex = p.vertex(L('Plantas y algas', 'Plantas e algas', 'Plantes et algues', 'Pflanzen und Algen', 'Plants and algae'), 30, 500, 130, 40, `${box('#ffffff', '#9aa0a6')}fontStyle=2;`)
  p.edge(bioKids[0], ex, L('por ejemplo', 'por exemplo', 'par exemple', 'zum Beispiel', 'for example'))
  p.vertex(
    L('Sustituye los conceptos y las palabras de enlace por los de tu tema.', 'Substitúe os conceptos e as palabras de ligazón polos do teu tema.', 'Remplace les notions et les mots de liaison par ceux de ton thème.', 'Ersetze die Begriffe und Verbindungswörter durch die deines Themas.', 'Replace the concepts and linking words with those of your topic.'),
    290,
    560,
    420,
    40,
    `${TEXT}fontColor=#5f6368;fontStyle=2;`,
  )
  return file([p])
}

function timeline(lang: Lang): string {
  const L = pick(lang)
  const p = new Page(L('Línea del tiempo', 'Liña do tempo', 'Frise chronologique', 'Zeitleiste', 'Timeline'))
  p.vertex(L('Línea del tiempo: grandes inventos', 'Liña do tempo: grandes inventos', 'Frise chronologique : grandes inventions', 'Zeitleiste: große Erfindungen', 'Timeline: great inventions'), 240, 20, 560, 40, `${TEXT}fontSize=20;fontStyle=1;`)
  const y = 300
  p.line(40, y, 1000, y, 'endArrow=block;endFill=1;html=1;strokeWidth=4;strokeColor=#5f6368;')
  const events: [string, string][] = [
    ['1440', L('Imprenta de tipos móviles (Gutenberg)', 'Imprenta de tipos móbiles (Gutenberg)', 'Imprimerie à caractères mobiles (Gutenberg)', 'Buchdruck mit beweglichen Lettern (Gutenberg)', 'Movable-type printing press (Gutenberg)')],
    ['1769', L('Máquina de vapor de Watt', 'Máquina de vapor de Watt', 'Machine à vapeur de Watt', 'Dampfmaschine von Watt', 'Watt’s steam engine')],
    ['1876', L('Teléfono', 'Teléfono', 'Téléphone', 'Telefon', 'Telephone')],
    ['1903', L('Primer vuelo en avión', 'Primeiro voo en avión', 'Premier vol en avion', 'Erster Motorflug', 'First powered flight')],
    ['1969', L('Llegada a la Luna y ARPANET', 'Chegada á Lúa e ARPANET', 'Premiers pas sur la Lune et ARPANET', 'Mondlandung und ARPANET', 'First steps on the Moon and ARPANET')],
    ['1991', 'World Wide Web'],
  ]
  const colors = ['#1a73e8', '#188038', '#e8710a', '#9334e6', '#d93025', '#007b83']
  events.forEach(([year, text], i) => {
    const x = 80 + i * 150
    const up = i % 2 === 0
    const dot = p.vertex('', x + 55, y - 10, 20, 20, `ellipse;html=1;fillColor=${colors[i]};strokeColor=#ffffff;strokeWidth=2;`)
    const card = p.vertex(
      `<b>${year}</b><br>${text}`,
      x,
      up ? y - 170 : y + 70,
      130,
      90,
      `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${colors[i]};strokeWidth=2;fontSize=13;`,
    )
    p.edge(dot, card, '', `endArrow=none;html=1;strokeColor=${colors[i]};dashed=1;`)
  })
  p.vertex(L('Añade o mueve acontecimientos: arrastra las tarjetas y sus puntos.', 'Engade ou move acontecementos: arrastra as tarxetas e os seus puntos.', 'Ajoute ou déplace des événements : fais glisser les cartes et leurs points.', 'Füge Ereignisse hinzu oder verschiebe sie: Ziehe die Karten und ihre Punkte.', 'Add or move events: drag the cards and their dots.'), 240, 520, 560, 30, `${TEXT}fontColor=#5f6368;fontStyle=2;`)
  return file([p])
}

function flowchart(lang: Lang): string {
  const L = pick(lang)
  const p = new Page(L('Diagrama de flujo', 'Diagrama de fluxo', 'Organigramme', 'Flussdiagramm', 'Flowchart'))
  const term = 'rounded=1;whiteSpace=wrap;html=1;arcSize=50;fillColor=#e6f4ea;strokeColor=#188038;fontSize=14;fontStyle=1;'
  const proc = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#e8f0fe;strokeColor=#1a73e8;fontSize=14;'
  const dec = 'rhombus;whiteSpace=wrap;html=1;fillColor=#fef7e0;strokeColor=#f9ab00;fontSize=13;'
  const io = 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;fillColor=#f3e8fd;strokeColor=#9334e6;fontSize=14;'
  const orth = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;fontSize=12;labelBackgroundColor=#ffffff;'
  p.vertex(L('Resolución de un problema', 'Resolución dun problema', 'Résoudre un problème', 'Eine Aufgabe lösen', 'Solving a problem'), 260, 0, 300, 40, `${TEXT}fontSize=20;fontStyle=1;`)
  const cx = 330
  const start = p.vertex(L('Inicio', 'Inicio', 'Début', 'Start', 'Start'), cx, 50, 160, 50, term)
  const read = p.vertex(L('Leer el enunciado', 'Ler o enunciado', 'Lire l’énoncé', 'Aufgabe lesen', 'Read the problem'), cx, 130, 160, 60, io)
  const data = p.vertex(L('Identificar datos y pregunta', 'Identificar datos e pregunta', 'Repérer les données et la question', 'Angaben und Frage erkennen', 'Find the data and the question'), cx, 220, 160, 60, proc)
  const know = p.vertex(L('¿Conozco una estrategia?', 'Coñezo unha estratexia?', 'Est-ce que je connais une stratégie ?', 'Kenne ich einen Lösungsweg?', 'Do I know a strategy?'), cx - 10, 310, 180, 110, dec)
  const help = p.vertex(L('Buscar un ejemplo o pedir ayuda', 'Buscar un exemplo ou pedir axuda', 'Chercher un exemple ou demander de l’aide', 'Beispiel suchen oder um Hilfe bitten', 'Look for an example or ask for help'), cx + 260, 335, 170, 60, proc)
  const solve = p.vertex(L('Aplicar la estrategia', 'Aplicar a estratexia', 'Appliquer la stratégie', 'Lösungsweg anwenden', 'Apply the strategy'), cx, 460, 160, 60, proc)
  const check = p.vertex(L('¿El resultado tiene sentido?', 'O resultado ten sentido?', 'Le résultat a-t-il du sens ?', 'Ist das Ergebnis sinnvoll?', 'Does the result make sense?'), cx - 10, 550, 180, 110, dec)
  const answer = p.vertex(L('Escribir la respuesta', 'Escribir a resposta', 'Écrire la réponse', 'Antwort aufschreiben', 'Write the answer'), cx, 700, 160, 60, io)
  const end = p.vertex(L('Fin', 'Fin', 'Fin', 'Ende', 'End'), cx, 790, 160, 50, term)
  p.edge(start, read, '', orth)
  p.edge(read, data, '', orth)
  p.edge(data, know, '', orth)
  p.edge(know, solve, L('Sí', 'Si', 'Oui', 'Ja', 'Yes'), orth)
  p.edge(know, help, 'No', orth)
  p.edge(help, data, '', `${orth}exitX=0.5;exitY=0;entryX=1;entryY=0.5;`)
  p.edge(solve, check, '', orth)
  p.edge(check, answer, L('Sí', 'Si', 'Oui', 'Ja', 'Yes'), orth)
  p.edge(check, data, 'No', `${orth}exitX=0;exitY=0.5;entryX=0;entryY=0.5;`)
  p.edge(answer, end, '', orth)
  return file([p])
}

function organizers(lang: Lang): string {
  const L = pick(lang)

  // KWL chart.
  const kwl = new Page(L('Tabla SQA (KWL)', 'Táboa SQA (KWL)', 'Tableau SVA (KWL)', 'W-W-L-Tabelle (KWL)', 'KWL chart'))
  kwl.vertex(L('Tema: ', 'Tema: ', 'Thème : ', 'Thema: ', 'Topic: ') + '__________________', 200, 10, 700, 40, `${TEXT}fontSize=20;fontStyle=1;`)
  const cols: [string, string, string][] = [
    [L('S · Lo que sé', 'S · O que sei', 'S · Ce que je sais', 'W · Was ich weiß', 'K · What I know'), '#d2e3fc', '#1a73e8'],
    [L('Q · Lo que quiero saber', 'Q · O que quero saber', 'V · Ce que je veux savoir', 'W · Was ich wissen will', 'W · What I want to know'), '#fce8b2', '#f9ab00'],
    [L('A · Lo que he aprendido', 'A · O que aprendín', 'A · Ce que j’ai appris', 'L · Was ich gelernt habe', 'L · What I learned'), '#ceead6', '#188038'],
  ]
  cols.forEach(([head, fill, stroke], i) => {
    const x = 60 + i * 340
    kwl.vertex(head, x, 70, 320, 50, `rounded=0;whiteSpace=wrap;html=1;fillColor=${stroke};strokeColor=${stroke};fontColor=#ffffff;fontSize=16;fontStyle=1;`)
    kwl.vertex('', x, 120, 320, 480, `rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};opacity=60;verticalAlign=top;align=left;spacing=10;fontSize=14;`)
  })

  // Venn diagram.
  const venn = new Page(L('Diagrama de Venn', 'Diagrama de Venn', 'Diagramme de Venn', 'Venn-Diagramm', 'Venn diagram'))
  venn.vertex(L('Comparamos: A y B', 'Comparamos: A e B', 'Comparons : A et B', 'Wir vergleichen: A und B', 'Let’s compare: A and B'), 300, 10, 500, 40, `${TEXT}fontSize=20;fontStyle=1;`)
  const circle = (fill: string, stroke: string) => `ellipse;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};opacity=45;strokeWidth=2;`
  venn.vertex('', 180, 80, 440, 440, circle('#8ab4f8', '#1a73e8'))
  venn.vertex('', 460, 80, 440, 440, circle('#fdd663', '#f9ab00'))
  venn.vertex(L('Solo A', 'Só A', 'Seulement A', 'Nur A', 'Only A'), 260, 270, 140, 40, `${TEXT}fontSize=16;fontStyle=1;`)
  venn.vertex(L('Ambos', 'Ambos', 'Les deux', 'Beide', 'Both'), 470, 270, 140, 40, `${TEXT}fontSize=16;fontStyle=1;`)
  venn.vertex(L('Solo B', 'Só B', 'Seulement B', 'Nur B', 'Only B'), 680, 270, 140, 40, `${TEXT}fontSize=16;fontStyle=1;`)
  venn.vertex('A', 300, 120, 60, 40, `${TEXT}fontSize=28;fontStyle=1;fontColor=#174ea6;`)
  venn.vertex('B', 720, 120, 60, 40, `${TEXT}fontSize=28;fontStyle=1;fontColor=#b06000;`)

  // Cause and effect.
  const ce = new Page(L('Causa y efecto', 'Causa e efecto', 'Cause et effet', 'Ursache und Wirkung', 'Cause and effect'))
  ce.vertex(L('Causas y consecuencias', 'Causas e consecuencias', 'Causes et conséquences', 'Ursachen und Folgen', 'Causes and consequences'), 300, 10, 500, 40, `${TEXT}fontSize=20;fontStyle=1;`)
  const event = ce.vertex(L('Hecho o problema', 'Feito ou problema', 'Fait ou problème', 'Ereignis oder Problem', 'Fact or problem'), 430, 250, 220, 100, box('#fad2cf', '#d93025', 'fontStyle=1;fontSize=16;'))
  for (let i = 0; i < 3; i++) {
    const cause = ce.vertex(`${L('Causa', 'Causa', 'Cause', 'Ursache', 'Cause')} ${i + 1}`, 60, 90 + i * 160, 200, 80, box('#e8f0fe', '#1a73e8'))
    ce.edge(cause, event, '', `${EDGE}strokeWidth=2;strokeColor=#1a73e8;`)
    const effect = ce.vertex(`${L('Consecuencia', 'Consecuencia', 'Conséquence', 'Folge', 'Consequence')} ${i + 1}`, 820, 90 + i * 160, 200, 80, box('#e6f4ea', '#188038'))
    ce.edge(event, effect, '', `${EDGE}strokeWidth=2;strokeColor=#188038;`)
  }
  ce.vertex(L('Causas', 'Causas', 'Causes', 'Ursachen', 'Causes'), 60, 50, 200, 30, `${TEXT}fontStyle=1;fontColor=#1a73e8;fontSize=16;`)
  ce.vertex(L('Consecuencias', 'Consecuencias', 'Conséquences', 'Folgen', 'Consequences'), 820, 50, 200, 30, `${TEXT}fontStyle=1;fontColor=#188038;fontSize=16;`)

  return file([kwl, venn, ce])
}

const BUILDERS: Record<string, (lang: Lang) => string> = {
  'concept-map': conceptMap,
  timeline,
  flowchart,
  organizers,
}

export async function createDiagramTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const module = await appInfo('diagram').load!()
  return module.importFile(new File([BUILDERS[id](lang)], `${name}.drawio`, { type: 'application/xml' }))
}
