// Word processor templates, written as HTML and opened through the writer's
// HTML import (same schema: paragraph styles, tables, cell colors, lists).

import { appInfo } from '../apps/registry'
import { pick, pickEs, type Lang, type SpainLang } from './types'

type Builder = (lang: Lang) => string

// ---------- HTML helpers ----------

const HEAD_BG = '#dbe7f7'
const SIDE_BG = '#f1f3f4'

const styled = (style: string) => (s: string, align?: 'center') => `<p data-style="${style}"${align ? ` style="text-align: ${align}"` : ''}>${s}</p>`
const title = styled('title')
const subtitle = styled('subtitle')
const h1 = (s: string) => `<h1>${s}</h1>`
const h2 = (s: string) => `<h2>${s}</h2>`
const p = (s = '', align?: 'center' | 'right' | 'justify') => `<p${align ? ` style="text-align: ${align}"` : ''}>${s}</p>`
const b = (s: string) => `<strong>${s}</strong>`
// Guidance for the teacher, meant to be replaced.
const hint = (s: string) => `<em><span style="color: #5f6368">[${s}]</span></em>`
const ul = (items: string[]) => `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`
const ol = (items: string[]) => `<ol>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ol>`
const tasks = (items: string[]) =>
  `<ul data-type="taskList">${items.map((i) => `<li data-type="taskItem" data-checked="false"><p>${i}</p></li>`).join('')}</ul>`
const pageBreak = '<div data-page-break></div>'
const blank = (n = 40) => '_'.repeat(n)

interface TableOptions {
  // First row is a header row.
  head?: boolean
  // First column is a label column.
  side?: boolean
  // Column widths in pixels (the A4 text width is about 600px).
  widths?: number[]
}

function table(rows: string[][], { head = true, side = false, widths }: TableOptions = {}): string {
  const body = rows
    .map((row, r) => {
      const cells = row.map((text, c) => {
        const isHead = head && r === 0
        const tag = isHead ? 'th' : 'td'
        const bg = isHead ? HEAD_BG : side && c === 0 ? SIDE_BG : ''
        const attrs = [bg && `data-bg="${bg}"`, widths?.[c] && `colwidth="${widths[c]}"`].filter(Boolean).join(' ')
        return `<${tag}${attrs ? ' ' + attrs : ''}><p>${side && c === 0 && !isHead ? b(text) : text}</p></${tag}>`
      })
      return `<tr>${cells.join('')}</tr>`
    })
    .join('')
  return `<table><tbody>${body}</tbody></table>`
}

// ---------- Templates ----------

const learningSituation: Builder = (lang) => {
  const E = pickEs(lang as SpainLang)
  return [
    title(E('Situación de aprendizaje: ', 'Situación de aprendizaxe: ') + hint(E('título', 'título'))),
    subtitle(E('Programación de aula conforme a la LOMLOE', 'Programación de aula conforme á LOMLOE')),
    h1(E('1. Identificación', '1. Identificación')),
    table(
      [
        [E('Centro educativo', 'Centro educativo'), hint(E('nombre del centro', 'nome do centro'))],
        [E('Etapa y curso', 'Etapa e curso'), hint(E('p. ej., 2.º ESO', 'p. ex., 2.º ESO'))],
        [E('Materia / Área / Ámbito', 'Materia / Área / Ámbito'), ''],
        [E('Temporalización', 'Temporalización'), hint(E('n.º de sesiones, trimestre y fechas', 'n.º de sesións, trimestre e datas'))],
        [E('Docente(s)', 'Docente(s)'), ''],
        [E('Vinculación con los ODS y retos del siglo XXI', 'Vinculación cos ODS e retos do século XXI'), ''],
        [E('Producto final', 'Produto final'), hint(E('qué elaborará el alumnado', 'que elaborará o alumnado'))],
      ],
      { head: false, side: true, widths: [200, 400] },
    ),
    h1(E('2. Justificación y descripción', '2. Xustificación e descrición')),
    p(
      hint(
        E(
          'Contexto real o significativo en el que se sitúa el reto, problema o pregunta que da sentido a la situación de aprendizaje, finalidad y relación con los intereses del alumnado.',
          'Contexto real ou significativo no que se sitúa o reto, problema ou pregunta que dá sentido á situación de aprendizaxe, finalidade e relación cos intereses do alumnado.',
        ),
      ),
    ),
    p(''),
    h1(E('3. Competencias específicas', '3. Competencias específicas')),
    table(
      [
        [E('Competencia específica', 'Competencia específica'), E('Descripción', 'Descrición'), E('Descriptores del perfil de salida', 'Descritores do perfil de saída')],
        ['CE1', '', hint('CCL1, STEM2, CD1…')],
        ['CE2', '', ''],
        ['CE3', '', ''],
      ],
      { widths: [120, 300, 180] },
    ),
    p(
      E(
        'Competencias clave: comunicación lingüística (CCL), plurilingüe (CP), matemática y en ciencia, tecnología e ingeniería (STEM), digital (CD), personal, social y de aprender a aprender (CPSAA), ciudadana (CC), emprendedora (CE) y en conciencia y expresión culturales (CCEC).',
        'Competencias clave: comunicación lingüística (CCL), plurilingüe (CP), matemática e en ciencia, tecnoloxía e enxeñaría (STEM), dixital (CD), persoal, social e de aprender a aprender (CPSAA), cidadá (CC), emprendedora (CE) e en conciencia e expresión culturais (CCEC).',
      ),
    ),
    h1(E('4. Criterios de evaluación', '4. Criterios de avaliación')),
    table(
      [
        [E('Criterio de evaluación', 'Criterio de avaliación'), E('Competencia específica', 'Competencia específica'), E('Instrumento de evaluación', 'Instrumento de avaliación')],
        ['1.1', 'CE1', hint(E('rúbrica, lista de cotejo, prueba…', 'rúbrica, lista de cotexo, proba…'))],
        ['1.2', 'CE1', ''],
        ['2.1', 'CE2', ''],
        ['3.1', 'CE3', ''],
      ],
      { widths: [280, 140, 180] },
    ),
    h1(E('5. Saberes básicos', '5. Saberes básicos')),
    ul([
      b(E('Bloque A. ', 'Bloque A. ')) + hint(E('saber básico', 'saber básico')),
      b(E('Bloque B. ', 'Bloque B. ')) + hint(E('saber básico', 'saber básico')),
      b(E('Bloque C. ', 'Bloque C. ')) + hint(E('saber básico', 'saber básico')),
    ]),
    h1(E('6. Secuencia de actividades', '6. Secuencia de actividades')),
    table(
      [
        [E('Fase', 'Fase'), E('Sesión', 'Sesión'), E('Actividades y tareas', 'Actividades e tarefas'), E('Agrupamiento', 'Agrupamento'), E('Recursos', 'Recursos')],
        [E('Activación', 'Activación'), '1', hint(E('conocimientos previos, pregunta motivadora', 'coñecementos previos, pregunta motivadora')), E('Gran grupo', 'Grupo clase'), ''],
        [E('Exploración', 'Exploración'), '2–3', '', E('Parejas', 'Parellas'), ''],
        [E('Estructuración', 'Estruturación'), '4–5', '', E('Individual', 'Individual'), ''],
        [E('Aplicación', 'Aplicación'), '6–7', hint(E('elaboración del producto final', 'elaboración do produto final')), E('Equipos cooperativos', 'Equipos cooperativos'), ''],
        [E('Conclusión', 'Conclusión'), '8', hint(E('presentación, metacognición', 'presentación, metacognición')), E('Gran grupo', 'Grupo clase'), ''],
      ],
      { side: true, widths: [110, 60, 230, 110, 90] },
    ),
    h1(E('7. Atención a la diversidad (DUA)', '7. Atención á diversidade (DUA)')),
    table(
      [
        [E('Principio del DUA', 'Principio do DUA'), E('Medidas previstas', 'Medidas previstas')],
        [E('Múltiples formas de implicación (el porqué)', 'Múltiples formas de implicación (o porqué)'), hint(E('elección, relevancia, trabajo cooperativo, autorregulación', 'elección, relevancia, traballo cooperativo, autorregulación'))],
        [E('Múltiples formas de representación (el qué)', 'Múltiples formas de representación (o que)'), hint(E('textos, vídeos, esquemas, subtítulos, glosario', 'textos, vídeos, esquemas, subtítulos, glosario'))],
        [E('Múltiples formas de acción y expresión (el cómo)', 'Múltiples formas de acción e expresión (o como)'), hint(E('producto oral, escrito, digital o gráfico a elegir', 'produto oral, escrito, dixital ou gráfico a escoller'))],
        [E('Medidas específicas', 'Medidas específicas'), hint(E('alumnado NEAE, adaptaciones, refuerzo y ampliación', 'alumnado NEAE, adaptacións, reforzo e ampliación'))],
      ],
      { side: true, widths: [230, 370] },
    ),
    h1(E('8. Evaluación', '8. Avaliación')),
    table(
      [
        [E('Instrumento', 'Instrumento'), E('Criterios evaluados', 'Criterios avaliados'), E('Peso (%)', 'Peso (%)')],
        [E('Rúbrica del producto final', 'Rúbrica do produto final'), '1.1, 2.1', '40'],
        [E('Observación sistemática', 'Observación sistemática'), '1.2', '20'],
        [E('Cuaderno / portfolio', 'Caderno / portfolio'), '3.1', '20'],
        [E('Autoevaluación y coevaluación', 'Autoavaliación e coavaliación'), '1.2, 3.1', '20'],
      ],
      { widths: [260, 220, 120] },
    ),
    h2(E('Evaluación de la práctica docente', 'Avaliación da práctica docente')),
    tasks([
      E('Los objetivos y criterios se comunicaron al alumnado.', 'Os obxectivos e criterios comunicáronse ao alumnado.'),
      E('La temporalización fue adecuada.', 'A temporalización foi axeitada.'),
      E('Las medidas DUA facilitaron la participación de todo el alumnado.', 'As medidas DUA facilitaron a participación de todo o alumnado.'),
      E('Propuestas de mejora: ', 'Propostas de mellora: ') + hint('…'),
    ]),
  ].join('')
}

const rubric: Builder = (lang) => {
  const L = pick(lang)
  const levels = [L('Excelente (4)', 'Excelente (4)', 'Excellent (4)', 'Sehr gut (4)', 'Excellent (4)'), L('Bien (3)', 'Ben (3)', 'Bien (3)', 'Gut (3)', 'Good (3)'), L('Suficiente (2)', 'Suficiente (2)', 'Suffisant (2)', 'Ausreichend (2)', 'Satisfactory (2)'), L('Insuficiente (1)', 'Insuficiente (1)', 'Insuffisant (1)', 'Nicht ausreichend (1)', 'Insufficient (1)')]
  const row = (criterion: string, weight: string, d: string[]) => [criterion, weight, ...d]
  return [
    title(L('Rúbrica de evaluación', 'Rúbrica de avaliación', 'Grille d’évaluation', 'Bewertungsraster', 'Assessment rubric')),
    table(
      [
        [L('Materia', 'Materia', 'Matière', 'Fach', 'Subject'), '', L('Curso', 'Curso', 'Classe', 'Klasse', 'Class'), ''],
        [L('Tarea / producto', 'Tarefa / produto', 'Tâche / production', 'Aufgabe / Produkt', 'Task / product'), '', L('Alumno/a', 'Alumno/a', 'Élève', 'Schüler/in', 'Student'), ''],
      ],
      { head: false, side: true, widths: [130, 190, 90, 190] },
    ),
    p(''),
    table(
      [
        [L('Criterio', 'Criterio', 'Critère', 'Kriterium', 'Criterion'), L('Peso', 'Peso', 'Poids', 'Gewichtung', 'Weight'), ...levels],
        row(L('Contenido', 'Contido', 'Contenu', 'Inhalt', 'Content'), '30%', [
          L('Información completa, rigurosa y bien relacionada.', 'Información completa, rigorosa e ben relacionada.', 'Informations complètes, rigoureuses et bien reliées.', 'Vollständige, genaue und gut verknüpfte Informationen.', 'Complete, accurate and well connected information.'),
          L('Información correcta con pequeñas omisiones.', 'Información correcta con pequenas omisións.', 'Informations correctes avec de petits oublis.', 'Korrekte Informationen mit kleinen Lücken.', 'Correct information with small gaps.'),
          L('Información básica, con algunos errores.', 'Información básica, con algúns erros.', 'Informations de base, avec quelques erreurs.', 'Grundlegende Informationen mit einigen Fehlern.', 'Basic information, with some errors.'),
          L('Información escasa o incorrecta.', 'Información escasa ou incorrecta.', 'Informations insuffisantes ou incorrectes.', 'Wenige oder falsche Informationen.', 'Little or incorrect information.'),
        ]),
        row(L('Organización', 'Organización', 'Organisation', 'Aufbau', 'Organisation'), '20%', [
          L('Estructura clara y lógica en todas las partes.', 'Estrutura clara e lóxica en todas as partes.', 'Structure claire et logique dans toutes les parties.', 'Klare und logische Struktur in allen Teilen.', 'Clear and logical structure in every part.'),
          L('Estructura clara con algún salto.', 'Estrutura clara con algún salto.', 'Structure claire avec quelques ruptures.', 'Klare Struktur mit einzelnen Sprüngen.', 'Clear structure with a few jumps.'),
          L('Estructura poco clara.', 'Estrutura pouco clara.', 'Structure peu claire.', 'Wenig klare Struktur.', 'Unclear structure.'),
          L('Sin estructura reconocible.', 'Sen estrutura recoñecible.', 'Aucune structure reconnaissable.', 'Keine erkennbare Struktur.', 'No recognisable structure.'),
        ]),
        row(L('Expresión y vocabulario', 'Expresión e vocabulario', 'Expression et vocabulaire', 'Ausdruck und Wortschatz', 'Expression and vocabulary'), '20%', [
          L('Vocabulario preciso y sin errores.', 'Vocabulario preciso e sen erros.', 'Vocabulaire précis et sans erreurs.', 'Präziser Wortschatz ohne Fehler.', 'Precise vocabulary, no errors.'),
          L('Vocabulario adecuado, errores leves.', 'Vocabulario axeitado, erros leves.', 'Vocabulaire adapté, erreurs légères.', 'Angemessener Wortschatz, leichte Fehler.', 'Suitable vocabulary, minor errors.'),
          L('Vocabulario limitado, varios errores.', 'Vocabulario limitado, varios erros.', 'Vocabulaire limité, plusieurs erreurs.', 'Begrenzter Wortschatz, mehrere Fehler.', 'Limited vocabulary, several errors.'),
          L('Errores frecuentes que dificultan la comprensión.', 'Erros frecuentes que dificultan a comprensión.', 'Erreurs fréquentes qui gênent la compréhension.', 'Häufige Fehler, die das Verständnis erschweren.', 'Frequent errors that make it hard to understand.'),
        ]),
        row(L('Presentación', 'Presentación', 'Présentation', 'Gestaltung', 'Presentation'), '15%', [
          L('Cuidada, original y atractiva.', 'Coidada, orixinal e atractiva.', 'Soignée, originale et attrayante.', 'Sorgfältig, originell und ansprechend.', 'Careful, original and attractive.'),
          L('Cuidada y ordenada.', 'Coidada e ordenada.', 'Soignée et ordonnée.', 'Sorgfältig und ordentlich.', 'Careful and tidy.'),
          L('Aceptable.', 'Aceptable.', 'Acceptable.', 'Akzeptabel.', 'Acceptable.'),
          L('Descuidada.', 'Descoidada.', 'Négligée.', 'Nachlässig.', 'Careless.'),
        ]),
        row(L('Fuentes y citas', 'Fontes e citas', 'Sources et citations', 'Quellen und Zitate', 'Sources and citations'), '15%', [
          L('Varias fuentes fiables, bien citadas.', 'Varias fontes fiables, ben citadas.', 'Plusieurs sources fiables, bien citées.', 'Mehrere verlässliche Quellen, korrekt zitiert.', 'Several reliable sources, well cited.'),
          L('Fuentes fiables, citas incompletas.', 'Fontes fiables, citas incompletas.', 'Sources fiables, citations incomplètes.', 'Verlässliche Quellen, unvollständige Zitate.', 'Reliable sources, incomplete citations.'),
          L('Una sola fuente o sin citar.', 'Unha soa fonte ou sen citar.', 'Une seule source ou aucune citation.', 'Nur eine Quelle oder nicht zitiert.', 'Only one source or no citations.'),
          L('Sin fuentes.', 'Sen fontes.', 'Aucune source.', 'Keine Quellen.', 'No sources.'),
        ]),
      ],
      { side: true, widths: [110, 50, 110, 110, 110, 110] },
    ),
    p(''),
    p(b(L('Calificación: ', 'Cualificación: ', 'Note : ', 'Note: ', 'Grade: ')) + L('suma de (nivel × peso) ÷ 4 × 10 = ', 'suma de (nivel × peso) ÷ 4 × 10 = ', 'somme de (niveau × poids) ÷ 4 × 10 = ', 'Summe aus (Stufe × Gewichtung) ÷ 4 × 10 = ', 'sum of (level × weight) ÷ 4 × 10 = ') + blank(8) + ' / 10'),
    p(b(L('Observaciones: ', 'Observacións: ', 'Observations : ', 'Bemerkungen: ', 'Comments: '))),
    p(blank(80)),
    p(blank(80)),
  ].join('')
}

const worksheet: Builder = (lang) => {
  const L = pick(lang)
  return [
    table(
      [
        [L('Nombre y apellidos', 'Nome e apelidos', 'Nom et prénom', 'Vor- und Nachname', 'Full name'), '', L('N.º', 'N.º', 'N°', 'Nr.', 'No.'), ''],
        [L('Curso y grupo', 'Curso e grupo', 'Classe et groupe', 'Klasse und Gruppe', 'Class and group'), '', L('Fecha', 'Data', 'Date', 'Datum', 'Date'), ''],
      ],
      { head: false, side: true, widths: [150, 270, 70, 110] },
    ),
    title(L('Ficha de trabajo: ', 'Ficha de traballo: ', 'Fiche d’exercices : ', 'Arbeitsblatt: ', 'Worksheet: ') + hint(L('tema', 'tema', 'thème', 'Thema', 'topic'))),
    p(b(L('Objetivo: ', 'Obxectivo: ', 'Objectif : ', 'Ziel: ', 'Objective: ')) + hint(L('qué vas a aprender con esta ficha', 'que vas aprender con esta ficha', 'ce que tu vas apprendre avec cette fiche', 'was du mit diesem Arbeitsblatt lernst', 'what you will learn with this worksheet'))),
    p(b(L('Instrucciones: ', 'Instrucións: ', 'Consignes : ', 'Arbeitsanweisung: ', 'Instructions: ')) + L('lee con atención cada enunciado antes de responder.', 'le con atención cada enunciado antes de responder.', 'lis attentivement chaque énoncé avant de répondre.', 'Lies jede Aufgabe aufmerksam durch, bevor du antwortest.', 'read each question carefully before answering.')),
    h2(L('1. Completa los huecos', '1. Completa os ocos', '1. Complète les trous', '1. Fülle die Lücken aus', '1. Fill in the gaps')),
    p(L('El agua de los ríos y mares se ', 'A auga dos ríos e mares ', 'L’eau des rivières et des mers s’', 'Das Wasser von Flüssen und Meeren ', 'The water of rivers and seas ') + blank(12) + L(' con el calor del sol y forma las ', ' coa calor do sol e forma as ', ' sous l’effet de la chaleur du soleil et forme les ', ' durch die Wärme der Sonne und bildet die ', ' with the heat of the sun and forms ') + blank(12) + '.'),
    p(L('Cuando el vapor se enfría, se ', 'Cando o vapor arrefría, ', 'Quand la vapeur se refroidit, elle se ', 'Wenn der Dampf abkühlt, ', 'When the vapour cools, it ') + blank(12) + L(' y cae en forma de ', ' e cae en forma de ', ' et tombe sous forme de ', ' er und fällt als ', ' and falls as ') + blank(12) + '.'),
    h2(L('2. Relaciona cada concepto con su definición', '2. Relaciona cada concepto coa súa definición', '2. Relie chaque notion à sa définition', '2. Ordne jedem Begriff seine Definition zu', '2. Match each concept to its definition')),
    table(
      [
        [L('Concepto', 'Concepto', 'Notion', 'Begriff', 'Concept'), L('Letra', 'Letra', 'Lettre', 'Buchstabe', 'Letter'), L('Definición', 'Definición', 'Définition', 'Definition', 'Definition')],
        [L('1. Evaporación', '1. Evaporación', '1. Évaporation', '1. Verdunstung', '1. Evaporation'), '', L('a) Paso de vapor a líquido', 'a) Paso de vapor a líquido', 'a) Passage de la vapeur au liquide', 'a) Übergang von Dampf zu Flüssigkeit', 'a) Change from vapour to liquid')],
        [L('2. Condensación', '2. Condensación', '2. Condensation', '2. Kondensation', '2. Condensation'), '', L('b) Caída de agua desde las nubes', 'b) Caída de auga desde as nubes', 'b) Chute d’eau depuis les nuages', 'b) Wasser fällt aus den Wolken', 'b) Water falling from the clouds')],
        [L('3. Precipitación', '3. Precipitación', '3. Précipitations', '3. Niederschlag', '3. Precipitation'), '', L('c) Paso de líquido a vapor', 'c) Paso de líquido a vapor', 'c) Passage du liquide à la vapeur', 'c) Übergang von Flüssigkeit zu Dampf', 'c) Change from liquid to vapour')],
      ],
      { widths: [200, 70, 330] },
    ),
    h2(L('3. Verdadero o falso', '3. Verdadeiro ou falso', '3. Vrai ou faux', '3. Richtig oder falsch', '3. True or false')),
    table(
      [
        [L('Afirmación', 'Afirmación', 'Affirmation', 'Aussage', 'Statement'), 'V', 'F'],
        [L('El agua solo existe en estado líquido.', 'A auga só existe en estado líquido.', 'L’eau n’existe qu’à l’état liquide.', 'Wasser gibt es nur in flüssigem Zustand.', 'Water only exists as a liquid.'), '', ''],
        [L('Las nubes están formadas por gotas de agua.', 'As nubes están formadas por pingas de auga.', 'Les nuages sont formés de gouttes d’eau.', 'Wolken bestehen aus Wassertropfen.', 'Clouds are made of water droplets.'), '', ''],
        [L('El ciclo del agua no tiene principio ni fin.', 'O ciclo da auga non ten principio nin fin.', 'Le cycle de l’eau n’a ni début ni fin.', 'Der Wasserkreislauf hat weder Anfang noch Ende.', 'The water cycle has no beginning and no end.'), '', ''],
      ],
      { widths: [500, 50, 50] },
    ),
    h2(L('4. Responde con tus palabras', '4. Responde coas túas palabras', '4. Réponds avec tes propres mots', '4. Antworte mit eigenen Worten', '4. Answer in your own words')),
    p(L('¿Por qué es importante cuidar el agua? Pon dos ejemplos.', 'Por que é importante coidar a auga? Pon dous exemplos.', 'Pourquoi est-il important de préserver l’eau ? Donne deux exemples.', 'Warum ist es wichtig, Wasser zu schützen? Nenne zwei Beispiele.', 'Why is it important to save water? Give two examples.')),
    p(blank(80)),
    p(blank(80)),
    p(blank(80)),
    h2(L('5. Autoevaluación', '5. Autoavaliación', '5. Autoévaluation', '5. Selbsteinschätzung', '5. Self-assessment')),
    tasks([
      L('He entendido los conceptos principales.', 'Entendín os conceptos principais.', 'J’ai compris les notions principales.', 'Ich habe die wichtigsten Begriffe verstanden.', 'I understood the main ideas.'),
      L('Puedo explicarlo a un compañero o compañera.', 'Podo explicalo a un compañeiro ou compañeira.', 'Je peux l’expliquer à un ou une camarade.', 'Ich kann es einer Mitschülerin oder einem Mitschüler erklären.', 'I can explain it to a classmate.'),
      L('Necesito repasar: ', 'Necesito repasar: ', 'Je dois revoir : ', 'Ich muss wiederholen: ', 'I need to review: ') + blank(30),
    ]),
  ].join('')
}

const report: Builder = (lang) => {
  const L = pick(lang)
  // French puts a no-break space before the colon.
  const cover = (label: string) => p(b(label + (lang === 'fr' ? '\u00a0: ' : ': ')) + blank(30), 'center')
  return [
    p(''),
    p(''),
    p(''),
    title(L('Título del trabajo', 'Título do traballo', 'Titre du travail', 'Titel der Arbeit', 'Title of the work'), 'center'),
    subtitle(L('Subtítulo o tema', 'Subtítulo ou tema', 'Sous-titre ou thème', 'Untertitel oder Thema', 'Subtitle or topic'), 'center'),
    p(''),
    p(''),
    p(''),
    cover(L('Autor/a', 'Autor/a', 'Auteur/autrice', 'Verfasser/in', 'Author')),
    cover(L('Curso y grupo', 'Curso e grupo', 'Classe et groupe', 'Klasse und Gruppe', 'Class and group')),
    cover(L('Materia', 'Materia', 'Matière', 'Fach', 'Subject')),
    cover(L('Docente', 'Docente', 'Enseignant(e)', 'Lehrkraft', 'Teacher')),
    cover(L('Centro', 'Centro', 'Établissement', 'Schule', 'School')),
    cover(L('Fecha de entrega', 'Data de entrega', 'Date de remise', 'Abgabedatum', 'Due date')),
    pageBreak,
    h1(L('Índice', 'Índice', 'Sommaire', 'Inhaltsverzeichnis', 'Contents')),
    ol([
      L('Introducción', 'Introdución', 'Introduction', 'Einleitung', 'Introduction'),
      L('Objetivos', 'Obxectivos', 'Objectifs', 'Ziele', 'Objectives'),
      L('Desarrollo', 'Desenvolvemento', 'Développement', 'Hauptteil', 'Main body'),
      L('Conclusiones', 'Conclusións', 'Conclusions', 'Fazit', 'Conclusions'),
      L('Bibliografía', 'Bibliografía', 'Bibliographie', 'Literaturverzeichnis', 'Bibliography'),
      L('Anexos', 'Anexos', 'Annexes', 'Anhang', 'Appendices'),
    ]),
    pageBreak,
    h1(L('1. Introducción', '1. Introdución', '1. Introduction', '1. Einleitung', '1. Introduction')),
    p(hint(L('Presenta el tema, por qué lo has elegido y cómo está organizado el trabajo.', 'Presenta o tema, por que o escolliches e como está organizado o traballo.', 'Présente le thème, pourquoi tu l’as choisi et comment le travail est organisé.', 'Stelle das Thema vor, erkläre, warum du es gewählt hast und wie die Arbeit aufgebaut ist.', 'Present the topic, why you chose it and how the work is organised.'))),
    h1(L('2. Objetivos', '2. Obxectivos', '2. Objectifs', '2. Ziele', '2. Objectives')),
    ul([hint(L('objetivo 1', 'obxectivo 1', 'objectif 1', 'Ziel 1', 'objective 1')), hint(L('objetivo 2', 'obxectivo 2', 'objectif 2', 'Ziel 2', 'objective 2'))]),
    h1(L('3. Desarrollo', '3. Desenvolvemento', '3. Développement', '3. Hauptteil', '3. Main body')),
    h2(L('3.1. Primer apartado', '3.1. Primeira epígrafe', '3.1. Première partie', '3.1. Erster Abschnitt', '3.1. First part')),
    p(hint(L('Desarrolla la información con tus propias palabras y cita las fuentes.', 'Desenvolve a información coas túas propias palabras e cita as fontes.', 'Développe les informations avec tes propres mots et cite tes sources.', 'Gib die Informationen mit eigenen Worten wieder und nenne die Quellen.', 'Develop the information in your own words and cite your sources.'))),
    h2(L('3.2. Segundo apartado', '3.2. Segunda epígrafe', '3.2. Deuxième partie', '3.2. Zweiter Abschnitt', '3.2. Second part')),
    p(''),
    h1(L('4. Conclusiones', '4. Conclusións', '4. Conclusions', '4. Fazit', '4. Conclusions')),
    p(hint(L('¿Qué has aprendido? ¿Se han cumplido los objetivos?', 'Que aprendiches? Cumpríronse os obxectivos?', 'Qu’as-tu appris ? Les objectifs ont-ils été atteints ?', 'Was hast du gelernt? Wurden die Ziele erreicht?', 'What have you learned? Were the objectives met?'))),
    h1(L('5. Bibliografía', '5. Bibliografía', '5. Bibliographie', '5. Literaturverzeichnis', '5. Bibliography')),
    p(L('Cita las fuentes en formato APA (7.ª edición). Ejemplos:', 'Cita as fontes en formato APA (7.ª edición). Exemplos:', 'Cite les sources au format APA (7e édition). Exemples :', 'Gib die Quellen im APA-Format an (7. Auflage). Beispiele:', 'Cite the sources in APA style (7th edition). Examples:')),
    ul([
      L('Apellido, N. (Año). ', 'Apelido, N. (Ano). ', 'Nom, P. (Année). ', 'Nachname, V. (Jahr). ', 'Surname, N. (Year). ') + `<em>${L('Título del libro', 'Título do libro', 'Titre du livre', 'Titel des Buches', 'Title of the book')}</em>` + L('. Editorial.', '. Editorial.', '. Éditeur.', '. Verlag.', '. Publisher.'),
      L('Apellido, N. (Año, día de mes). Título de la página. ', 'Apelido, N. (Ano, día de mes). Título da páxina. ', 'Nom, P. (Année, jour mois). Titre de la page. ', 'Nachname, V. (Jahr, Tag. Monat). Titel der Seite. ', 'Surname, N. (Year, Month day). Title of the page. ') + `<em>${L('Nombre del sitio', 'Nome do sitio', 'Nom du site', 'Name der Website', 'Website name')}</em>. https://…`,
    ]),
    h1(L('6. Anexos', '6. Anexos', '6. Annexes', '6. Anhang', '6. Appendices')),
    p(''),
  ].join('')
}

const minutes: Builder = (lang) => {
  const L = pick(lang)
  return [
    title(L('Acta de reunión', 'Acta de reunión', 'Compte rendu de réunion', 'Sitzungsprotokoll', 'Meeting minutes')),
    table(
      [
        [L('Órgano', 'Órgano', 'Instance', 'Gremium', 'Body'), hint(L('Claustro / Departamento / Equipo docente / CCP', 'Claustro / Departamento / Equipo docente / CCP', 'Conseil pédagogique / Équipe disciplinaire / Équipe pédagogique / Conseil de classe', 'Lehrerkonferenz / Fachkonferenz / Klassenkonferenz / Steuergruppe', 'Staff meeting / Department / Teaching team / Class board'))],
        [L('Acta n.º', 'Acta n.º', 'Compte rendu n°', 'Protokoll Nr.', 'Minutes no.'), ''],
        [L('Fecha', 'Data', 'Date', 'Datum', 'Date'), ''],
        [L('Hora de inicio y fin', 'Hora de inicio e fin', 'Heure de début et de fin', 'Beginn und Ende', 'Start and end time'), ''],
        [L('Lugar / modalidad', 'Lugar / modalidade', 'Lieu / modalité', 'Ort / Format', 'Place / format'), hint(L('presencial o telemática', 'presencial ou telemática', 'en présentiel ou à distance', 'in Präsenz oder online', 'in person or online'))],
        [L('Preside', 'Preside', 'Présidence', 'Vorsitz', 'Chair'), ''],
        [L('Secretario/a', 'Secretario/a', 'Secrétaire de séance', 'Protokoll', 'Secretary'), ''],
      ],
      { head: false, side: true, widths: [180, 420] },
    ),
    h2(L('Asistentes', 'Asistentes', 'Présents', 'Anwesend', 'Present')),
    ul(['', '']),
    h2(L('Ausencias justificadas', 'Ausencias xustificadas', 'Absences excusées', 'Entschuldigt abwesend', 'Apologies')),
    ul(['']),
    h2(L('Orden del día', 'Orde do día', 'Ordre du jour', 'Tagesordnung', 'Agenda')),
    ol([
      L('Lectura y aprobación, si procede, del acta de la sesión anterior.', 'Lectura e aprobación, se procede, da acta da sesión anterior.', 'Lecture et approbation, le cas échéant, du compte rendu de la séance précédente.', 'Genehmigung des Protokolls der letzten Sitzung.', 'Reading and approval, if appropriate, of the minutes of the previous meeting.'),
      hint(L('punto', 'punto', 'point', 'Punkt', 'item')),
      hint(L('punto', 'punto', 'point', 'Punkt', 'item')),
      L('Ruegos y preguntas.', 'Rogos e preguntas.', 'Questions diverses.', 'Verschiedenes.', 'Any other business.'),
    ]),
    h2(L('Desarrollo de la sesión', 'Desenvolvemento da sesión', 'Déroulement de la séance', 'Verlauf der Sitzung', 'Proceedings')),
    p(b(L('Punto 1. ', 'Punto 1. ', 'Point 1. ', 'TOP 1. ', 'Item 1. ')) + L('Se aprueba el acta de la sesión anterior ', 'Apróbase a acta da sesión anterior ', 'Le compte rendu de la séance précédente est approuvé ', 'Das Protokoll der letzten Sitzung wird ', 'The minutes of the previous meeting are approved ') + hint(L('por unanimidad / con las siguientes modificaciones', 'por unanimidade / coas seguintes modificacións', 'à l’unanimité / avec les modifications suivantes', 'einstimmig / mit folgenden Änderungen genehmigt', 'unanimously / with the following changes')) + '.'),
    p(b(L('Punto 2. ', 'Punto 2. ', 'Point 2. ', 'TOP 2. ', 'Item 2. ')) + hint(L('resumen de las intervenciones', 'resumo das intervencións', 'résumé des interventions', 'Zusammenfassung der Beiträge', 'summary of the contributions'))),
    p(b(L('Punto 3. ', 'Punto 3. ', 'Point 3. ', 'TOP 3. ', 'Item 3. ')) + hint(L('resumen de las intervenciones', 'resumo das intervencións', 'résumé des interventions', 'Zusammenfassung der Beiträge', 'summary of the contributions'))),
    h2(L('Acuerdos adoptados', 'Acordos adoptados', 'Décisions prises', 'Beschlüsse', 'Decisions')),
    table(
      [
        [L('Acuerdo', 'Acordo', 'Décision', 'Beschluss', 'Decision'), L('Responsable', 'Responsable', 'Responsable', 'Verantwortlich', 'Responsible'), L('Plazo', 'Prazo', 'Échéance', 'Frist', 'Deadline')],
        ['', '', ''],
        ['', '', ''],
      ],
      { widths: [360, 140, 100] },
    ),
    h2(L('Ruegos y preguntas', 'Rogos e preguntas', 'Questions diverses', 'Verschiedenes', 'Any other business')),
    p(''),
    p(
      L(
        'Sin más asuntos que tratar, se levanta la sesión a las ____ horas, de lo que, como secretario/a, doy fe.',
        'Sen máis asuntos que tratar, levántase a sesión ás ____ horas, do que, como secretario/a, dou fe.',
        'L’ordre du jour étant épuisé, la séance est levée à ____ heures.',
        'Da keine weiteren Punkte vorliegen, wird die Sitzung um ____ Uhr geschlossen.',
        'There being no further business, the meeting closes at ____.',
      ),
    ),
    p(''),
    table(
      [
        [L('V.º B.º El/La presidente/a', 'V.º e pr. O/A presidente/a', 'Le/La président(e)', 'Vorsitz', 'The chair'), L('El/La secretario/a', 'O/A secretario/a', 'Le/La secrétaire de séance', 'Protokollführung', 'The secretary')],
        [`<br>${L('Fdo.: ', 'Asdo.: ', 'Signature : ', 'Unterschrift: ', 'Signed: ')}${blank(20)}`, `<br>${L('Fdo.: ', 'Asdo.: ', 'Signature : ', 'Unterschrift: ', 'Signed: ')}${blank(20)}`],
      ],
      { widths: [300, 300] },
    ),
  ].join('')
}

const familyLetter: Builder = (lang) => {
  const L = pick(lang)
  return [
    p(b(hint(L('Nombre del centro', 'Nome do centro', 'Nom de l’établissement', 'Name der Schule', 'Name of the school'))) + '<br>' + hint(L('Dirección · Teléfono · Correo electrónico', 'Enderezo · Teléfono · Correo electrónico', 'Adresse · Téléphone · Courriel', 'Anschrift · Telefon · E-Mail', 'Address · Phone · Email'))),
    p(''),
    p(hint(L('Localidad', 'Localidade', 'Ville', 'Ort', 'Town')) + L(', a ', ', ', ', le ', ', den ', ', ') + hint(L('día', 'día', 'jour', 'Tag', 'day')) + L(' de ', ' de ', ' ', ' ', ' ') + hint(L('mes', 'mes', 'mois', 'Monat', 'month')) + L(' de ', ' de ', ' ', ' ', ' ') + hint(L('año', 'ano', 'année', 'Jahr', 'year')), 'right'),
    p(''),
    p(b(L('Asunto: ', 'Asunto: ', 'Objet : ', 'Betreff: ', 'Subject: ')) + L('Salida didáctica a ', 'Saída didáctica a ', 'Sortie scolaire à ', 'Unterrichtsgang nach ', 'School trip to ') + hint(L('lugar', 'lugar', 'lieu', 'Ort', 'place'))),
    p(''),
    p(L('Estimadas familias:', 'Estimadas familias:', 'Madame, Monsieur,', 'Liebe Eltern,', 'Dear parents and guardians,')),
    p(
      L(
        'Nos ponemos en contacto con ustedes para informarles de que el alumnado de ',
        'Poñémonos en contacto con vós para informarvos de que o alumnado de ',
        'Nous vous informons que les élèves de ',
        'wir möchten Sie darüber informieren, dass die Klasse ',
        'We are writing to let you know that the students of ',
      ) +
        hint(L('curso y grupo', 'curso e grupo', 'classe et groupe', 'Klasse und Gruppe', 'class and group')) +
        L(
          ' realizará una salida didáctica como parte de la situación de aprendizaje que estamos trabajando en el aula. Los datos de la actividad son los siguientes:',
          ' realizará unha saída didáctica como parte da situación de aprendizaxe que estamos a traballar na aula. Os datos da actividade son os seguintes:',
          ' participeront à une sortie scolaire dans le cadre du projet que nous menons en classe. Voici les informations sur l’activité :',
          ' im Rahmen des aktuellen Unterrichtsprojekts einen Unterrichtsgang unternimmt. Die Angaben zur Veranstaltung:',
          ' will go on a school trip as part of the project we are working on in class. These are the details of the activity:',
        ),
      'justify',
    ),
    ul([
      b(L('Fecha: ', 'Data: ', 'Date : ', 'Datum: ', 'Date: ')) + blank(20),
      b(L('Horario: ', 'Horario: ', 'Horaires : ', 'Uhrzeit: ', 'Times: ')) + L('salida a las ', 'saída ás ', 'départ à ', 'Abfahrt um ', 'leaving at ') + blank(6) + L(' y regreso a las ', ' e regreso ás ', ' et retour à ', ' und Rückkehr um ', ' and returning at ') + blank(6),
      b(L('Lugar: ', 'Lugar: ', 'Lieu : ', 'Ort: ', 'Place: ')) + blank(30),
      b(L('Coste: ', 'Custo: ', 'Coût : ', 'Kosten: ', 'Cost: ')) + blank(10),
      b(L('Material necesario: ', 'Material necesario: ', 'Matériel nécessaire : ', 'Benötigtes Material: ', 'What to bring: ')) + blank(30),
    ]),
    p(
      L(
        'Les rogamos que devuelvan la autorización firmada al tutor o tutora antes del ',
        'Pregámosvos que devolvades a autorización asinada ao titor ou titora antes do ',
        'Merci de retourner l’autorisation signée au professeur principal ou à la professeure principale avant le ',
        'Bitte geben Sie die unterschriebene Einverständniserklärung bis zum ',
        'Please return the signed permission form to the class tutor before ',
      ) +
        blank(12) +
        L('. Para cualquier duda pueden contactar con el centro por los medios habituales.', '. Para calquera dúbida podedes contactar co centro polos medios habituais.', '. Pour toute question, vous pouvez contacter l’établissement par les moyens habituels.', ' bei der Klassenleitung ab. Bei Fragen erreichen Sie die Schule auf den üblichen Wegen.', '. If you have any questions, you can contact the school in the usual way.'),
      'justify',
    ),
    p(L('Reciban un cordial saludo.', 'Recibide un cordial saúdo.', 'Veuillez agréer, Madame, Monsieur, nos salutations distinguées.', 'Mit freundlichen Grüßen', 'Yours faithfully,')),
    p(''),
    p(L('El tutor / La tutora', 'O titor / A titora', 'Le professeur principal / La professeure principale', 'Die Klassenleitung', 'The class tutor')),
    p(''),
    p(L('Fdo.: ', 'Asdo.: ', 'Signature : ', 'Unterschrift: ', 'Signed: ') + blank(30)),
    p(''),
    p('✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', 'center'),
    h2(L('Autorización', 'Autorización', 'Autorisation', 'Einverständniserklärung', 'Permission')),
    p(
      L('D./D.ª ', 'D./D.ª ', 'Je soussigné(e) ', 'Ich, ', 'I, ') +
        blank(36) +
        L(', con DNI ', ', con DNI ', ', joignable au ', ', telefonisch erreichbar unter ', ', phone number ') +
        blank(12) +
        L(', como padre, madre o tutor/a legal del alumno/a ', ', como pai, nai ou titor/a legal do alumno/a ', ', parent ou responsable légal de l’élève ', ', Erziehungsberechtigte/r von ', ', parent or legal guardian of the student ') +
        blank(36) +
        L(' del curso ', ' do curso ', ' de la classe ', ' aus der Klasse ', ' in class ') +
        blank(8) +
        ':',
      'justify',
    ),
    tasks([
      L('Autorizo su participación en la actividad.', 'Autorizo a súa participación na actividade.', 'J’autorise sa participation à l’activité.', 'Ich erlaube die Teilnahme an der Veranstaltung.', 'I give permission to take part in the activity.'),
      L('No autorizo su participación en la actividad.', 'Non autorizo a súa participación na actividade.', 'Je n’autorise pas sa participation à l’activité.', 'Ich erlaube die Teilnahme an der Veranstaltung nicht.', 'I do not give permission to take part in the activity.'),
    ]),
    p(L('Firma: ', 'Sinatura: ', 'Signature : ', 'Unterschrift: ', 'Signature: ') + blank(30) + L('   Fecha: ', '   Data: ', '   Date : ', '   Datum: ', '   Date: ') + blank(14)),
  ].join('')
}

const BUILDERS: Record<string, Builder> = {
  'learning-situation': learningSituation,
  rubric,
  worksheet,
  report,
  minutes,
  'family-letter': familyLetter,
}

export async function createWriterTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"></head><body>${BUILDERS[id](lang)}</body></html>`
  const module = await appInfo('writer').load!()
  return module.importFile(new File([html], `${name}.html`, { type: 'text/html' }))
}
