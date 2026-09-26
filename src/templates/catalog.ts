// Template catalog for schools. Metadata only: the content of each app's
// templates is a separate chunk, loaded when used. Names and descriptions are
// [es, gl, fr, de]; the LOMLOE ones (Spain) have [es, gl] only.

import type { DocType } from '../core/store'
import { THUMBS } from './thumbs'
import type { Lang, Template } from './types'

type Texts = [es: string, gl: string, fr: string, de: string] | [es: string, gl: string]
type Entry = [id: string, app: DocType, name: Texts, description: Texts]

const ENTRIES: Entry[] = [
  [
    'learning-situation',
    'writer',
    ['Situación de aprendizaje', 'Situación de aprendizaxe'],
    [
      'Estructura LOMLOE: competencias, criterios, saberes básicos, actividades, DUA y evaluación.',
      'Estrutura LOMLOE: competencias, criterios, saberes básicos, actividades, DUA e avaliación.',
    ],
  ],
  ['rubric', 'writer', ['Rúbrica', 'Rúbrica', 'Grille d’évaluation', 'Bewertungsraster'], ['Tabla de criterios con cuatro niveles de logro y pesos.', 'Táboa de criterios con catro niveis de logro e pesos.', 'Tableau de critères avec quatre niveaux de maîtrise et leurs poids.', 'Kriterientabelle mit vier Leistungsstufen und Gewichtung.']],
  [
    'worksheet',
    'writer',
    ['Ficha de trabajo', 'Ficha de traballo', 'Fiche d’exercices', 'Arbeitsblatt'],
    ['Cabecera con nombre, curso y fecha, ejercicios variados y autoevaluación.', 'Cabeceira con nome, curso e data, exercicios variados e autoavaliación.', 'En-tête avec nom, classe et date, exercices variés et autoévaluation.', 'Kopfzeile mit Name, Klasse und Datum, abwechslungsreiche Aufgaben und Selbsteinschätzung.'],
  ],
  [
    'report',
    'writer',
    ['Trabajo de alumno', 'Traballo de alumno', 'Dossier d’élève', 'Schülerarbeit'],
    ['Portada, índice, apartados, conclusiones y bibliografía en APA.', 'Portada, índice, epígrafes, conclusións e bibliografía en APA.', 'Page de titre, sommaire, parties, conclusions et bibliographie APA.', 'Deckblatt, Inhaltsverzeichnis, Abschnitte, Fazit und Literaturverzeichnis nach APA.'],
  ],
  [
    'minutes',
    'writer',
    ['Acta de reunión', 'Acta de reunión', 'Compte rendu de réunion', 'Sitzungsprotokoll'],
    ['Claustro, departamento o equipo docente: asistentes, orden del día y acuerdos.', 'Claustro, departamento ou equipo docente: asistentes, orde do día e acordos.', 'Conseil pédagogique ou équipe disciplinaire : présents, ordre du jour et décisions.', 'Lehrer- oder Fachkonferenz: Anwesende, Tagesordnung und Beschlüsse.'],
  ],
  [
    'family-letter',
    'writer',
    ['Carta a las familias', 'Carta ás familias', 'Lettre aux familles', 'Elternbrief'],
    ['Comunicación de una salida didáctica con autorización recortable.', 'Comunicación dunha saída didáctica con autorización recortable.', 'Annonce d’une sortie scolaire avec autorisation à découper.', 'Information zu einem Unterrichtsgang mit Abschnitt zum Abtrennen.'],
  ],
  [
    'gradebook',
    'sheet',
    ['Cuaderno de notas', 'Caderno de notas', 'Carnet de notes', 'Notenbuch'],
    [
      'Medias ponderadas por evaluación, nota final, calificación y aprobados/suspensos en color.',
      'Medias ponderadas por avaliación, nota final, cualificación e aprobados/suspensos en cor.',
      'Moyennes pondérées par trimestre, note finale, appréciation et réussites/échecs en couleur (sur 10).',
      'Gewichtete Durchschnitte pro Trimester, Endnote, Bewertung und bestanden/nicht bestanden in Farbe (0–10 Punkte).',
    ],
  ],
  ['timetable', 'sheet', ['Horario semanal', 'Horario semanal', 'Emploi du temps', 'Stundenplan'], ['Sesiones de lunes a viernes con recreo y lista de materias.', 'Sesións de luns a venres con recreo e lista de materias.', 'Cours du lundi au vendredi avec récréation et liste des matières.', 'Stunden von Montag bis Freitag mit Pause und Fächerliste.']],
  [
    'attendance',
    'sheet',
    ['Registro de asistencia', 'Rexistro de asistencia', 'Registre de présence', 'Anwesenheitsliste'],
    ['Cuadrícula mensual con faltas, justificadas, retrasos y porcentaje de asistencia.', 'Cuadrícula mensual con faltas, xustificadas, atrasos e porcentaxe de asistencia.', 'Grille mensuelle avec absences, absences justifiées, retards et taux de présence.', 'Monatsraster mit Fehltagen, Entschuldigungen, Verspätungen und Anwesenheitsquote.'],
  ],
  [
    'scored-rubric',
    'sheet',
    ['Rúbrica con puntuación', 'Rúbrica con puntuación', 'Grille avec score', 'Bewertungsraster mit Punkten'],
    ['Introduce el nivel de cada criterio y obtén la nota automáticamente.', 'Introduce o nivel de cada criterio e obtén a nota automaticamente.', 'Saisissez le niveau de chaque critère et obtenez la note automatiquement.', 'Stufe je Kriterium eingeben, die Note wird automatisch berechnet.'],
  ],
  ['concept-map', 'diagram', ['Mapa conceptual', 'Mapa conceptual', 'Carte conceptuelle', 'Concept-Map'], ['Conceptos jerarquizados unidos por palabras de enlace.', 'Conceptos xerarquizados unidos por palabras de ligazón.', 'Notions hiérarchisées reliées par des mots de liaison.', 'Hierarchisch geordnete Begriffe, verbunden durch Verbindungswörter.']],
  ['timeline', 'diagram', ['Línea del tiempo', 'Liña do tempo', 'Frise chronologique', 'Zeitleiste'], ['Acontecimientos ordenados con fechas y tarjetas.', 'Acontecementos ordenados con datas e tarxetas.', 'Événements ordonnés avec dates et cartes.', 'Geordnete Ereignisse mit Daten und Karten.']],
  [
    'flowchart',
    'diagram',
    ['Diagrama de flujo', 'Diagrama de fluxo', 'Organigramme', 'Flussdiagramm'],
    ['Pasos y decisiones de un proceso con símbolos estándar.', 'Pasos e decisións dun proceso con símbolos estándar.', 'Étapes et décisions d’un processus avec des symboles standard.', 'Schritte und Entscheidungen eines Ablaufs mit Standardsymbolen.'],
  ],
  [
    'organizers',
    'diagram',
    ['Organizadores gráficos', 'Organizadores gráficos', 'Organisateurs graphiques', 'Grafische Strukturierungshilfen'],
    ['Tabla SQA (KWL), diagrama de Venn y causa-efecto, en tres páginas.', 'Táboa SQA (KWL), diagrama de Venn e causa-efecto, en tres páxinas.', 'Tableau SVA (KWL), diagramme de Venn et cause-effet, sur trois pages.', 'W-W-L-Tabelle (KWL), Venn-Diagramm und Ursache-Wirkung auf drei Seiten.'],
  ],
  [
    'slides-learning-situation',
    'slides',
    ['Presentación de la situación de aprendizaje', 'Presentación da situación de aprendizaxe'],
    ['Reto, objetivos, fases, producto final y evaluación para presentar al alumnado.', 'Reto, obxectivos, fases, produto final e avaliación para presentar ao alumnado.'],
  ],
  [
    'oral-presentation',
    'slides',
    ['Exposición oral del alumnado', 'Exposición oral do alumnado', 'Exposé oral d’élève', 'Schülerreferat'],
    ['Portada, índice, desarrollo con imagen, conclusiones y fuentes.', 'Portada, índice, desenvolvemento con imaxe, conclusións e fontes.', 'Page de titre, sommaire, développement avec image, conclusions et sources.', 'Titelfolie, Gliederung, Hauptteil mit Bild, Fazit und Quellen.'],
  ],
  [
    'brainstorm',
    'draw',
    ['Lluvia de ideas', 'Chuvia de ideas', 'Remue-méninges', 'Brainstorming'],
    ['Pizarra con tema central y notas de colores para generar ideas.', 'Lousa con tema central e notas de cores para xerar ideas.', 'Tableau avec thème central et notes de couleur pour générer des idées.', 'Tafel mit zentralem Thema und farbigen Notizen zum Sammeln von Ideen.'],
  ],
  ['form-self-assessment', 'forms', ['Autoevaluación', 'Autoavaliación', 'Autoévaluation', 'Selbsteinschätzung'], ['Cuadrícula de frecuencia, escala de aprendizaje y preguntas de reflexión.', 'Cuadrícula de frecuencia, escala de aprendizaxe e preguntas de reflexión.', 'Grille de fréquence, échelle d’apprentissage et questions de réflexion.', 'Häufigkeitsraster, Lernskala und Reflexionsfragen.']],
  ['form-review-quiz', 'forms', ['Cuestionario de repaso', 'Cuestionario de repaso', 'Quiz de révision', 'Wiederholungsquiz'], ['Autocorregible: respuestas correctas, puntos, retroalimentación y nota automática.', 'Autocorrixible: respostas correctas, puntos, retroalimentación e nota automática.', 'Autocorrigé : bonnes réponses, points, commentaires et note automatique.', 'Selbstkorrigierend: richtige Antworten, Punkte, Rückmeldung und automatische Note.']],
  ['form-family-survey', 'forms', ['Encuesta a las familias', 'Enquisa ás familias', 'Enquête auprès des familles', 'Elternumfrage'], ['Satisfacción, canales de comunicación, actividades y sugerencias.', 'Satisfacción, canles de comunicación, actividades e suxestións.', 'Satisfaction, moyens de communication, activités et suggestions.', 'Zufriedenheit, Kommunikationswege, Aktivitäten und Anregungen.']],
  ['form-peer-rubric', 'forms', ['Rúbrica de coevaluación', 'Rúbrica de coavaliación', 'Grille d’évaluation par les pairs', 'Peer-Bewertungsraster'], ['El alumnado evalúa a un compañero con criterios y niveles de logro.', 'O alumnado avalía a un compañeiro con criterios e niveis de logro.', 'Les élèves évaluent un camarade selon des critères et des niveaux.', 'Schüler bewerten eine Mitschülerin oder einen Mitschüler nach Kriterien und Stufen.']],
]

async function create(id: string, app: DocType, lang: Lang, name: string): Promise<string> {
  switch (app) {
    case 'writer':
      return (await import('./writer')).createWriterTemplate(id, lang, name)
    case 'sheet':
      return (await import('./sheet')).createSheetTemplate(id, lang, name)
    case 'diagram':
      return (await import('./diagram')).createDiagramTemplate(id, lang, name)
    case 'draw':
      return (await import('./draw')).createDrawTemplate(id, lang, name)
    case 'slides':
      return (await import('./slides')).createSlidesTemplate(id, lang, name)
    case 'forms':
      return (await import('./forms')).createFormTemplate(id, lang, name)
    default:
      throw new Error(`No templates for ${app}`)
  }
}

const LANGS: Lang[] = ['es', 'gl', 'fr', 'de']
const byLang = (texts: Texts) => Object.fromEntries(texts.map((text, i) => [LANGS[i], text])) as Partial<Record<Lang, string>>

export const TEMPLATES: Template[] = ENTRIES.map(([id, app, name, description]) => ({
  id,
  app,
  langs: LANGS.slice(0, name.length),
  name: byLang(name),
  description: byLang(description),
  thumb: THUMBS[id],
  create: (lang) => create(id, app, lang, byLang(name)[lang]!),
}))
