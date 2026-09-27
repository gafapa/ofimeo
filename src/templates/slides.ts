// Presentation templates, written as .pptx with pptxgenjs and opened through
// the presentations app's PowerPoint import.

import PptxGenJS from 'pptxgenjs'
import { appInfo } from '../apps/registry'
import { pick, pickEs, type Lang, type SpainLang } from './types'

type Pptx = InstanceType<typeof PptxGenJS>
type Slide = ReturnType<Pptx['addSlide']>

// 16:9 slide, 10 × 5.625 inches.
const W = 10
const FONT = 'Helvetica'
const INK = '1F2937'
const MUTED = '5F6368'

interface Palette {
  accent: string
  dark: string
  light: string
}

function titleBar(slide: Slide, text: string, p: Palette): void {
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: 5.625, fill: { color: p.accent }, line: { color: p.accent } })
  slide.addText(text, { x: 0.5, y: 0.3, w: 9, h: 0.8, fontFace: FONT, fontSize: 30, bold: true, color: INK, valign: 'middle' })
}

function bullets(slide: Slide, items: string[], x = 0.6, y = 1.3, w = 8.8, h = 3.8, fontSize = 20): void {
  slide.addText(
    items.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
    { x, y, w, h, fontFace: FONT, fontSize, color: INK, valign: 'top', paraSpaceAfter: 8 },
  )
}

function cover(pptx: Pptx, title: string, subtitle: string, p: Palette): void {
  const s = pptx.addSlide()
  s.background = { color: p.accent }
  s.addShape('rect', { x: 0, y: 3.9, w: W, h: 1.725, fill: { color: p.dark }, line: { color: p.dark } })
  s.addText(title, { x: 0.7, y: 1.2, w: 8.6, h: 1.6, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'bottom' })
  s.addText(subtitle, { x: 0.7, y: 2.9, w: 8.6, h: 0.7, fontFace: FONT, fontSize: 20, color: 'FFFFFF', valign: 'top' })
}

function learningSituation(pptx: Pptx, lang: Lang): void {
  const E = pickEs(lang as SpainLang)
  const p = { accent: '1A73E8', dark: '174EA6', light: 'E8F0FE' }
  cover(pptx, E('[Título de la situación de aprendizaje]', '[Título da situación de aprendizaxe]'), E('Materia · Curso · Trimestre', 'Materia · Curso · Trimestre'), p)

  let s = pptx.addSlide()
  titleBar(s, E('¿Qué reto vamos a resolver?', 'Que reto imos resolver?'), p)
  s.addShape('roundRect', { x: 0.6, y: 1.4, w: 8.8, h: 1.6, fill: { color: p.light }, line: { color: p.accent }, rectRadius: 0.15 })
  s.addText(E('[Pregunta o problema motivador conectado con la vida real]', '[Pregunta ou problema motivador conectado coa vida real]'), {
    x: 0.8, y: 1.5, w: 8.4, h: 1.4, fontFace: FONT, fontSize: 24, italic: true, color: INK, align: 'center', valign: 'middle',
  })
  s.addText(E('Contexto: ', 'Contexto: ') + E('¿por qué es importante para nosotros?', 'por que é importante para nós?'), { x: 0.6, y: 3.4, w: 8.8, h: 0.8, fontFace: FONT, fontSize: 18, color: MUTED })

  s = pptx.addSlide()
  titleBar(s, E('¿Qué vamos a aprender?', 'Que imos aprender?'), p)
  bullets(s, [
    E('Objetivo 1: …', 'Obxectivo 1: …'),
    E('Objetivo 2: …', 'Obxectivo 2: …'),
    E('Objetivo 3: …', 'Obxectivo 3: …'),
    E('Competencias clave: CCL, STEM, CD, CPSAA…', 'Competencias clave: CCL, STEM, CD, CPSAA…'),
  ])

  s = pptx.addSlide()
  titleBar(s, E('¿Cómo lo vamos a hacer?', 'Como o imos facer?'), p)
  const phases = [
    [E('Activación', 'Activación'), E('Ideas previas', 'Ideas previas')],
    [E('Exploración', 'Exploración'), E('Investigamos', 'Investigamos')],
    [E('Estructuración', 'Estruturación'), E('Organizamos', 'Organizamos')],
    [E('Aplicación', 'Aplicación'), E('Producto final', 'Produto final')],
    [E('Conclusión', 'Conclusión'), E('Presentamos y reflexionamos', 'Presentamos e reflexionamos')],
  ]
  phases.forEach(([name, desc], i) => {
    const x = 0.5 + i * 1.83
    s.addShape('chevron', { x, y: 1.8, w: 1.8, h: 0.9, fill: { color: p.accent, transparency: i * 12 }, line: { color: 'FFFFFF' } })
    s.addText(name, { x: x + 0.25, y: 1.8, w: 1.4, h: 0.9, fontFace: FONT, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    s.addText(desc, { x, y: 2.9, w: 1.8, h: 0.9, fontFace: FONT, fontSize: 14, color: INK, align: 'center', valign: 'top' })
  })
  s.addText(E('Sesiones: [n.º] · Agrupamientos: individual, parejas y equipos', 'Sesións: [n.º] · Agrupamentos: individual, parellas e equipos'), {
    x: 0.6, y: 4.4, w: 8.8, h: 0.5, fontFace: FONT, fontSize: 16, color: MUTED,
  })

  s = pptx.addSlide()
  titleBar(s, E('Producto final', 'Produto final'), p)
  bullets(s, [
    E('¿Qué vamos a crear? …', 'Que imos crear? …'),
    E('¿Para quién? …', 'Para quen? …'),
    E('Formato a elegir: póster, vídeo, presentación, maqueta…', 'Formato a escoller: póster, vídeo, presentación, maqueta…'),
    E('Fecha de entrega: …', 'Data de entrega: …'),
  ])

  s = pptx.addSlide()
  titleBar(s, E('¿Cómo se evaluará?', 'Como se avaliará?'), p)
  const items = [
    [E('Rúbrica del producto', 'Rúbrica do produto'), '40%'],
    [E('Observación en clase', 'Observación na clase'), '20%'],
    [E('Cuaderno / portfolio', 'Caderno / portfolio'), '20%'],
    [E('Autoevaluación y coevaluación', 'Autoavaliación e coavaliación'), '20%'],
  ]
  items.forEach(([name, pct], i) => {
    const x = 0.6 + (i % 2) * 4.5
    const y = 1.4 + Math.floor(i / 2) * 1.7
    s.addShape('roundRect', { x, y, w: 4.2, h: 1.4, fill: { color: p.light }, line: { color: p.accent }, rectRadius: 0.1 })
    s.addText(pct, { x: x + 0.2, y, w: 1.4, h: 1.4, fontFace: FONT, fontSize: 32, bold: true, color: p.accent, valign: 'middle' })
    s.addText(name, { x: x + 1.6, y, w: 2.5, h: 1.4, fontFace: FONT, fontSize: 17, color: INK, valign: 'middle' })
  })

  s = pptx.addSlide()
  titleBar(s, E('¿Qué he aprendido?', 'Que aprendín?'), p)
  bullets(s, [
    E('Lo que más me ha gustado…', 'O que máis me gustou…'),
    E('Lo que me ha resultado difícil…', 'O que me resultou difícil…'),
    E('Lo que puedo mejorar…', 'O que podo mellorar…'),
  ])
}

function oralPresentation(pptx: Pptx, lang: Lang): void {
  const L = pick(lang)
  const p = { accent: '188038', dark: '0D652D', light: 'E6F4EA' }
  cover(pptx, L('[Título de la exposición]', '[Título da exposición]', '[Titre de l’exposé]', '[Titel des Referats]'), L('Nombre y apellidos · Curso · Fecha', 'Nome e apelidos · Curso · Data', 'Nom et prénom · Classe · Date', 'Vor- und Nachname · Klasse · Datum'), p)

  let s = pptx.addSlide()
  titleBar(s, L('Índice', 'Índice', 'Sommaire', 'Inhaltsverzeichnis'), p)
  ;[L('Introducción', 'Introdución', 'Introduction', 'Einleitung'), L('Desarrollo', 'Desenvolvemento', 'Développement', 'Hauptteil'), L('Conclusiones', 'Conclusións', 'Conclusions', 'Fazit'), L('Fuentes', 'Fontes', 'Sources', 'Quellen')].forEach((item, i) => {
    const y = 1.35 + i * 0.95
    s.addShape('ellipse', { x: 0.7, y, w: 0.7, h: 0.7, fill: { color: p.accent }, line: { color: p.accent } })
    s.addText(String(i + 1), { x: 0.7, y, w: 0.7, h: 0.7, fontFace: FONT, fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    s.addText(item, { x: 1.7, y, w: 7, h: 0.7, fontFace: FONT, fontSize: 22, color: INK, valign: 'middle' })
  })

  s = pptx.addSlide()
  titleBar(s, L('Introducción', 'Introdución', 'Introduction', 'Einleitung'), p)
  bullets(s, [L('¿De qué trata el tema?', 'De que trata o tema?', 'De quoi parle le thème ?', 'Worum geht es?'), L('¿Por qué lo he elegido?', 'Por que o escollín?', 'Pourquoi l’ai-je choisi ?', 'Warum habe ich das Thema gewählt?'), L('¿Qué vais a aprender?', 'Que ides aprender?', 'Qu’allez-vous apprendre ?', 'Was werdet ihr lernen?')])

  s = pptx.addSlide()
  titleBar(s, L('Desarrollo', 'Desenvolvemento', 'Développement', 'Hauptteil'), p)
  bullets(s, [L('Idea principal 1', 'Idea principal 1', 'Idée principale 1', 'Hauptgedanke 1'), L('Dato o ejemplo', 'Dato ou exemplo', 'Donnée ou exemple', 'Fakt oder Beispiel')], 0.6, 1.3, 4.3, 3.8)
  s.addShape('rect', { x: 5.2, y: 1.4, w: 4.2, h: 3.4, fill: { color: p.light }, line: { color: p.accent, dashType: 'dash' } })
  s.addText(L('[Imagen, gráfico o mapa]', '[Imaxe, gráfico ou mapa]', '[Image, graphique ou carte]', '[Bild, Grafik oder Karte]'), { x: 5.2, y: 1.4, w: 4.2, h: 3.4, fontFace: FONT, fontSize: 16, italic: true, color: MUTED, align: 'center', valign: 'middle' })

  s = pptx.addSlide()
  titleBar(s, L('Conclusiones', 'Conclusións', 'Conclusions', 'Fazit'), p)
  bullets(s, [L('Lo más importante es…', 'O máis importante é…', 'Le plus important, c’est…', 'Das Wichtigste ist…'), L('He aprendido que…', 'Aprendín que…', 'J’ai appris que…', 'Ich habe gelernt, dass…'), L('Me pregunto…', 'Pregúntome…', 'Je me demande…', 'Ich frage mich…')])

  s = pptx.addSlide()
  titleBar(s, L('Fuentes', 'Fontes', 'Sources', 'Quellen'), p)
  bullets(
    s,
    [
      L('Apellido, N. (Año). Título del libro. Editorial.', 'Apelido, N. (Ano). Título do libro. Editorial.', 'Nom, P. (Année). Titre du livre. Éditeur.', 'Nachname, V. (Jahr). Titel des Buches. Verlag.'),
      L('Apellido, N. (Año). Título de la página. Sitio web. https://…', 'Apelido, N. (Ano). Título da páxina. Sitio web. https://…', 'Nom, P. (Année). Titre de la page. Site web. https://…', 'Nachname, V. (Jahr). Titel der Seite. Website. https://…'),
    ],
    0.6,
    1.3,
    8.8,
    3.8,
    16,
  )

  s = pptx.addSlide()
  s.background = { color: p.accent }
  s.addText(L('¡Gracias!', 'Grazas!', 'Merci !', 'Danke!'), { x: 0.5, y: 1.5, w: 9, h: 1.4, fontFace: FONT, fontSize: 54, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
  s.addText(L('¿Preguntas?', 'Preguntas?', 'Des questions ?', 'Fragen?'), { x: 0.5, y: 2.9, w: 9, h: 0.8, fontFace: FONT, fontSize: 26, color: 'FFFFFF', align: 'center', valign: 'middle' })
}

// Numbered cards in a row (steps, phases).
function steps(slide: Slide, items: [string, string][], p: Palette, y = 1.5): void {
  const n = items.length
  const gap = 0.25
  const w = (8.8 - gap * (n - 1)) / n
  items.forEach(([title, text], i) => {
    const x = 0.6 + i * (w + gap)
    slide.addShape('roundRect', { x, y, w, h: 2.9, fill: { color: p.light }, line: { color: p.accent }, rectRadius: 0.1 })
    slide.addShape('ellipse', { x: x + 0.2, y: y + 0.2, w: 0.6, h: 0.6, fill: { color: p.accent }, line: { color: p.accent } })
    slide.addText(String(i + 1), { x: x + 0.2, y: y + 0.2, w: 0.6, h: 0.6, fontFace: FONT, fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    slide.addText(title, { x: x + 0.15, y: y + 0.95, w: w - 0.3, h: 0.6, fontFace: FONT, fontSize: 17, bold: true, color: INK, valign: 'top' })
    slide.addText(text, { x: x + 0.15, y: y + 1.55, w: w - 0.3, h: 1.25, fontFace: FONT, fontSize: 14, color: MUTED, valign: 'top' })
  })
}

// A table with a colored header row. Row heights are explicit: without them
// pptxgenjs writes h="0" rows, which importers show collapsed.
function table(slide: Slide, rows: string[][], p: Palette, colW: number[], y = 1.3, fontSize = 14, rowH = 0.55): void {
  slide.addTable(
    rows.map((row, r) =>
      row.map((text) => ({
        text,
        options: r === 0 ? { bold: true, color: 'FFFFFF', fill: { color: p.accent } } : { color: INK, fill: { color: r % 2 ? 'FFFFFF' : p.light } },
      })),
    ),
    { x: 0.6, y, w: colW.reduce((a, b) => a + b, 0), colW, rowH, fontFace: FONT, fontSize, border: { type: 'solid', pt: 0.75, color: 'C4C7C5' }, valign: 'middle' },
  )
}

function classPresentation(pptx: Pptx, lang: Lang): void {
  const L = pick(lang)
  const p = { accent: 'E8710A', dark: 'B06000', light: 'FEEFE3' }
  cover(pptx, L('[Tema de la clase]', '[Tema da clase]', '[Thème du cours]', '[Thema der Stunde]'), L('Materia · Curso · Fecha', 'Materia · Curso · Data', 'Matière · Classe · Date', 'Fach · Klasse · Datum'), p)

  let s = pptx.addSlide()
  titleBar(s, L('Hoy vamos a…', 'Hoxe imos…', 'Aujourd’hui, nous allons…', 'Heute werden wir…'), p)
  bullets(s, [
    L('Recordar lo que ya sabemos sobre…', 'Lembrar o que xa sabemos sobre…', 'Rappeler ce que nous savons déjà sur…', 'Wiederholen, was wir schon über … wissen'),
    L('Descubrir…', 'Descubrir…', 'Découvrir…', 'Entdecken, …'),
    L('Practicar…', 'Practicar…', 'Nous entraîner à…', 'Üben, …'),
  ])
  s.addNotes(L('Pregunta inicial para activar ideas previas.', 'Pregunta inicial para activar ideas previas.', 'Question de départ pour faire émerger les représentations.', 'Einstiegsfrage, um Vorwissen zu aktivieren.'))

  s = pptx.addSlide()
  titleBar(s, L('Concepto clave', 'Concepto clave', 'Notion clé', 'Schlüsselbegriff'), p)
  s.addShape('roundRect', { x: 0.6, y: 1.4, w: 8.8, h: 1.5, fill: { color: p.light }, line: { color: p.accent }, rectRadius: 0.15 })
  s.addText(L('[Definición con palabras sencillas]', '[Definición con palabras sinxelas]', '[Définition en mots simples]', '[Definition in einfachen Worten]'), {
    x: 0.8, y: 1.5, w: 8.4, h: 1.3, fontFace: FONT, fontSize: 24, bold: true, color: INK, align: 'center', valign: 'middle',
  })
  bullets(s, [L('Por ejemplo: …', 'Por exemplo: …', 'Par exemple : …', 'Zum Beispiel: …'), L('No confundir con: …', 'Non confundir con: …', 'À ne pas confondre avec : …', 'Nicht verwechseln mit: …')], 0.6, 3.2, 8.8, 1.9, 18)

  s = pptx.addSlide()
  titleBar(s, L('Un ejemplo', 'Un exemplo', 'Un exemple', 'Ein Beispiel'), p)
  bullets(s, [L('Observa…', 'Observa…', 'Observe…', 'Beobachte …'), L('¿Qué ocurre si…?', 'Que ocorre se…?', 'Que se passe-t-il si… ?', 'Was passiert, wenn …?'), L('Conclusión: …', 'Conclusión: …', 'Conclusion : …', 'Ergebnis: …')], 0.6, 1.3, 4.3, 3.8)
  s.addShape('rect', { x: 5.2, y: 1.4, w: 4.2, h: 3.4, fill: { color: p.light }, line: { color: p.accent, dashType: 'dash' } })
  s.addText(L('[Imagen, esquema o vídeo]', '[Imaxe, esquema ou vídeo]', '[Image, schéma ou vidéo]', '[Bild, Skizze oder Video]'), { x: 5.2, y: 1.4, w: 4.2, h: 3.4, fontFace: FONT, fontSize: 16, italic: true, color: MUTED, align: 'center', valign: 'middle' })

  s = pptx.addSlide()
  titleBar(s, L('Actividad', 'Actividade', 'Activité', 'Aufgabe'), p)
  steps(s, [
    [L('Lee', 'Le', 'Lis', 'Lies'), L('el texto o el enunciado', 'o texto ou o enunciado', 'le texte ou la consigne', 'den Text oder die Aufgabe')],
    [L('Piensa', 'Pensa', 'Réfléchis', 'Denk nach'), L('solo, 2 minutos', 'só, 2 minutos', 'seul, 2 minutes', 'allein, 2 Minuten')],
    [L('Comparte', 'Comparte', 'Partage', 'Tausch dich aus'), L('con tu pareja', 'coa túa parella', 'avec ton binôme', 'mit deinem Partner')],
    [L('Presenta', 'Presenta', 'Présente', 'Stell vor'), L('al resto de la clase', 'ao resto da clase', 'au reste de la classe', 'der ganzen Klasse')],
  ], p)

  s = pptx.addSlide()
  titleBar(s, L('Resumen y ticket de salida', 'Resumo e ticket de saída', 'À retenir et ticket de sortie', 'Zusammenfassung und Exit-Ticket'), p)
  bullets(s, [
    L('Hoy he aprendido…', 'Hoxe aprendín…', 'Aujourd’hui, j’ai appris…', 'Heute habe ich gelernt, …'),
    L('Todavía tengo dudas sobre…', 'Aínda teño dúbidas sobre…', 'J’ai encore des questions sur…', 'Unklar ist mir noch …'),
    L('Deberes: …', 'Deberes: …', 'Devoirs : …', 'Hausaufgabe: …'),
  ])
}

function projectReport(pptx: Pptx, lang: Lang): void {
  const L = pick(lang)
  const p = { accent: '9334E6', dark: '681DA8', light: 'F3E8FD' }
  cover(pptx, L('[Nombre del proyecto]', '[Nome do proxecto]', '[Nom du projet]', '[Name des Projekts]'), L('Equipo · Curso · Fecha', 'Equipo · Curso · Data', 'Équipe · Classe · Date', 'Team · Klasse · Datum'), p)

  let s = pptx.addSlide()
  titleBar(s, L('El equipo', 'O equipo', 'L’équipe', 'Das Team'), p)
  const roles = [
    L('Coordinación', 'Coordinación', 'Coordination', 'Koordination'),
    L('Investigación', 'Investigación', 'Recherche', 'Recherche'),
    L('Diseño', 'Deseño', 'Conception', 'Gestaltung'),
    L('Comunicación', 'Comunicación', 'Communication', 'Präsentation'),
  ]
  roles.forEach((role, i) => {
    const x = 0.6 + i * 2.25
    s.addShape('ellipse', { x: x + 0.45, y: 1.5, w: 1.1, h: 1.1, fill: { color: p.light }, line: { color: p.accent } })
    s.addText(L('[Nombre]', '[Nome]', '[Prénom]', '[Name]'), { x, y: 2.8, w: 2, h: 0.5, fontFace: FONT, fontSize: 17, bold: true, color: INK, align: 'center' })
    s.addText(role, { x, y: 3.3, w: 2, h: 0.5, fontFace: FONT, fontSize: 14, color: MUTED, align: 'center' })
  })

  s = pptx.addSlide()
  titleBar(s, L('Objetivo', 'Obxectivo', 'Objectif', 'Ziel'), p)
  s.addShape('roundRect', { x: 0.6, y: 1.4, w: 8.8, h: 1.4, fill: { color: p.light }, line: { color: p.accent }, rectRadius: 0.15 })
  s.addText(L('[¿Qué queríamos conseguir y por qué?]', '[Que queriamos conseguir e por que?]', '[Que voulions-nous obtenir, et pourquoi ?]', '[Was wollten wir erreichen und warum?]'), {
    x: 0.8, y: 1.5, w: 8.4, h: 1.2, fontFace: FONT, fontSize: 22, italic: true, color: INK, align: 'center', valign: 'middle',
  })
  bullets(s, [L('Pregunta de investigación: …', 'Pregunta de investigación: …', 'Question de recherche : …', 'Forschungsfrage: …'), L('Hipótesis: …', 'Hipótese: …', 'Hypothèse : …', 'Hypothese: …')], 0.6, 3.1, 8.8, 2, 18)

  s = pptx.addSlide()
  titleBar(s, L('Cómo lo hicimos', 'Como o fixemos', 'Comment nous avons procédé', 'So sind wir vorgegangen'), p)
  steps(s, [
    [L('Investigar', 'Investigar', 'Se documenter', 'Recherchieren'), L('fuentes y datos', 'fontes e datos', 'sources et données', 'Quellen und Daten')],
    [L('Planificar', 'Planificar', 'Planifier', 'Planen'), L('tareas y plazos', 'tarefas e prazos', 'tâches et délais', 'Aufgaben und Fristen')],
    [L('Crear', 'Crear', 'Réaliser', 'Umsetzen'), L('el producto', 'o produto', 'le produit', 'das Produkt')],
    [L('Probar', 'Probar', 'Tester', 'Testen'), L('y mejorar', 'e mellorar', 'et améliorer', 'und verbessern')],
  ], p)

  s = pptx.addSlide()
  titleBar(s, L('Resultados', 'Resultados', 'Résultats', 'Ergebnisse'), p)
  table(
    s,
    [
      [L('Indicador', 'Indicador', 'Indicateur', 'Kennzahl'), L('Previsto', 'Previsto', 'Prévu', 'Geplant'), L('Conseguido', 'Conseguido', 'Obtenu', 'Erreicht')],
      [L('[Dato 1]', '[Dato 1]', '[Donnée 1]', '[Wert 1]'), '', ''],
      [L('[Dato 2]', '[Dato 2]', '[Donnée 2]', '[Wert 2]'), '', ''],
      [L('[Dato 3]', '[Dato 3]', '[Donnée 3]', '[Wert 3]'), '', ''],
    ],
    p,
    [4.4, 2.2, 2.2],
    1.4,
    16,
  )

  s = pptx.addSlide()
  titleBar(s, L('Conclusiones y próximos pasos', 'Conclusións e próximos pasos', 'Conclusions et prochaines étapes', 'Fazit und nächste Schritte'), p)
  bullets(s, [
    L('Lo que funcionó: …', 'O que funcionou: …', 'Ce qui a marché : …', 'Was gut lief: …'),
    L('Lo que cambiaríamos: …', 'O que cambiariamos: …', 'Ce que nous changerions : …', 'Was wir ändern würden: …'),
    L('Siguiente paso: …', 'Seguinte paso: …', 'Prochaine étape : …', 'Nächster Schritt: …'),
  ])
}

function lessonPlan(pptx: Pptx, lang: Lang): void {
  const L = pick(lang)
  const p = { accent: '00897B', dark: '00695C', light: 'E0F2F1' }
  cover(pptx, L('Plan de la sesión', 'Plan da sesión', 'Plan de séance', 'Stundenentwurf'), L('[Materia] · [Curso] · Sesión [n.º] · [Fecha]', '[Materia] · [Curso] · Sesión [n.º] · [Data]', '[Matière] · [Classe] · Séance [n°] · [Date]', '[Fach] · [Klasse] · Stunde [Nr.] · [Datum]'), p)

  let s = pptx.addSlide()
  titleBar(s, L('Objetivos', 'Obxectivos', 'Objectifs', 'Lernziele'), p)
  bullets(s, [
    L('Al final de la sesión, el alumnado será capaz de…', 'Ao final da sesión, o alumnado será quen de…', 'À la fin de la séance, les élèves seront capables de…', 'Am Ende der Stunde können die Schülerinnen und Schüler …'),
    L('Contenidos: …', 'Contidos: …', 'Contenus : …', 'Inhalte: …'),
    L('Competencias: …', 'Competencias: …', 'Compétences : …', 'Kompetenzen: …'),
  ])

  s = pptx.addSlide()
  titleBar(s, L('Desarrollo de la sesión', 'Desenvolvemento da sesión', 'Déroulement de la séance', 'Stundenverlauf'), p)
  table(
    s,
    [
      [L('Tiempo', 'Tempo', 'Durée', 'Zeit'), L('Fase', 'Fase', 'Phase', 'Phase'), L('Actividad', 'Actividade', 'Activité', 'Aktivität'), L('Agrupamiento', 'Agrupamento', 'Organisation', 'Sozialform')],
      ['10 min', L('Inicio', 'Inicio', 'Lancement', 'Einstieg'), L('Pregunta inicial e ideas previas', 'Pregunta inicial e ideas previas', 'Question de départ et représentations', 'Einstiegsfrage und Vorwissen'), L('Gran grupo', 'Grupo grande', 'Classe entière', 'Plenum')],
      ['25 min', L('Desarrollo', 'Desenvolvemento', 'Développement', 'Erarbeitung'), L('Explicación y práctica guiada', 'Explicación e práctica guiada', 'Explication et pratique guidée', 'Erklärung und angeleitete Übung'), L('Parejas', 'Parellas', 'Binômes', 'Partnerarbeit')],
      ['15 min', L('Cierre', 'Peche', 'Synthèse', 'Sicherung'), L('Puesta en común y ticket de salida', 'Posta en común e ticket de saída', 'Mise en commun et ticket de sortie', 'Besprechung und Exit-Ticket'), L('Individual', 'Individual', 'Individuel', 'Einzelarbeit')],
    ],
    p,
    [1.3, 1.7, 3.9, 1.9],
  )

  s = pptx.addSlide()
  titleBar(s, L('Materiales y atención a la diversidad', 'Materiais e atención á diversidade', 'Matériel et différenciation', 'Material und Differenzierung'), p)
  bullets(s, [L('Materiales: …', 'Materiais: …', 'Matériel : …', 'Material: …'), L('Recursos digitales: …', 'Recursos dixitais: …', 'Ressources numériques : …', 'Digitale Medien: …')], 0.6, 1.3, 4.3, 3.8, 18)
  bullets(s, [L('Refuerzo: …', 'Reforzo: …', 'Soutien : …', 'Förderung: …'), L('Ampliación: …', 'Ampliación: …', 'Approfondissement : …', 'Forderung: …')], 5.1, 1.3, 4.3, 3.8, 18)

  s = pptx.addSlide()
  titleBar(s, L('Evaluación', 'Avaliación', 'Évaluation', 'Bewertung'), p)
  table(
    s,
    [
      [L('Criterio', 'Criterio', 'Critère', 'Kriterium'), L('Instrumento', 'Instrumento', 'Outil', 'Instrument'), L('Peso', 'Peso', 'Poids', 'Gewicht')],
      [L('[Criterio 1]', '[Criterio 1]', '[Critère 1]', '[Kriterium 1]'), L('Observación', 'Observación', 'Observation', 'Beobachtung'), '30%'],
      [L('[Criterio 2]', '[Criterio 2]', '[Critère 2]', '[Kriterium 2]'), L('Ticket de salida', 'Ticket de saída', 'Ticket de sortie', 'Exit-Ticket'), '30%'],
      [L('[Criterio 3]', '[Criterio 3]', '[Critère 3]', '[Kriterium 3]'), L('Producto / cuaderno', 'Produto / caderno', 'Production / cahier', 'Produkt / Heft'), '40%'],
    ],
    p,
    [4.4, 3, 1.4],
  )
  s.addText(L('Observaciones tras la sesión: …', 'Observacións tras a sesión: …', 'Remarques après la séance : …', 'Notizen nach der Stunde: …'), { x: 0.6, y: 4.3, w: 8.8, h: 0.6, fontFace: FONT, fontSize: 16, italic: true, color: MUTED })
}

const BUILDERS: Record<string, (pptx: Pptx, lang: Lang) => void> = {
  'slides-learning-situation': learningSituation,
  'oral-presentation': oralPresentation,
  'class-presentation': classPresentation,
  'project-report': projectReport,
  'lesson-plan': lessonPlan,
}

export async function createSlidesTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = name
  BUILDERS[id](pptx, lang)
  const data = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer
  const module = await appInfo('slides').load!()
  return module.importFile(new File([data], `${name}.pptx`, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
}
