// Notebook templates (Ofimeo Notebook): class notes, lab notebook and reading
// journal, in es, gl, fr and de. Pages are written as HTML and read with the
// notebook's editor schema (tags: data-nb-tag).

import { generateJSON, getSchema } from '@tiptap/core'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { createLocalDocument } from '../core/session'
import { notebookExtensions } from '../apps/notebook/extensions'
import { addPage, addSection } from '../apps/notebook/model'
import { pick, type Lang } from './types'

type L = ReturnType<typeof pick>
interface PageSpec {
  title: string
  html: string
  level?: number
}
interface SectionSpec {
  name: string
  color: string
  pages: PageSpec[]
}

const h2 = (s: string) => `<h2>${s}</h2>`
const p = (s = '') => `<p>${s}</p>`
const tag = (t: string, s: string) => `<p data-nb-tag="${t}">${s}</p>`
const ul = (items: string[]) => `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`
const ol = (items: string[]) => `<ol>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ol>`
const tasks = (items: string[]) => `<ul data-type="taskList">${items.map((i) => `<li data-type="taskItem" data-checked="false"><p>${i}</p></li>`).join('')}</ul>`
const hint = (s: string) => `<em>${s}</em>`
const table = (rows: string[][]) =>
  `<table><tbody>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th><p>${c}</p></th>` : `<td><p>${c}</p></td>`)).join('')}</tr>`).join('')}</tbody></table>`

function classNotes(L: L): SectionSpec[] {
  return [
    {
      name: L('Unidad 1', 'Unidade 1', 'Chapitre 1', 'Einheit 1', 'Unit 1'),
      color: '#1e88e5',
      pages: [
        {
          title: L('Objetivos de la unidad', 'Obxectivos da unidade', 'Objectifs du chapitre', 'Lernziele der Einheit', 'Unit objectives'),
          html:
            p(hint(L('Copia aquí los objetivos que da el profesor y márcalos cuando los domines.', 'Copia aquí os obxectivos que dá o profesor e márcaos cando os domines.', 'Recopie ici les objectifs donnés par le professeur et coche-les quand tu les maîtrises.', 'Schreibe hier die Lernziele ab und hake sie ab, wenn du sie beherrschst.', 'Copy here the objectives your teacher gave you and tick them when you master them.'))) +
            tasks([L('Objetivo 1', 'Obxectivo 1', 'Objectif 1', 'Ziel 1', 'Objective 1'), L('Objetivo 2', 'Obxectivo 2', 'Objectif 2', 'Ziel 2', 'Objective 2'), L('Objetivo 3', 'Obxectivo 3', 'Objectif 3', 'Ziel 3', 'Objective 3')]),
        },
        {
          title: L('Clase 1: tema', 'Clase 1: tema', 'Cours 1 : thème', 'Stunde 1: Thema', 'Lesson 1: topic'),
          html:
            h2(L('Ideas clave', 'Ideas clave', 'Idées clés', 'Kernideen', 'Key ideas')) +
            ul([L('Idea principal', 'Idea principal', 'Idée principale', 'Hauptidee', 'Main idea'), L('Concepto y definición', 'Concepto e definición', 'Notion et définition', 'Begriff und Definition', 'Concept and definition')]) +
            h2(L('Notas', 'Notas', 'Notes', 'Notizen', 'Notes')) +
            p(hint(L('Escribe, pega fotos de la pizarra o dibuja con el lápiz.', 'Escribe, pega fotos do encerado ou debuxa co lapis.', 'Écris, colle des photos du tableau ou dessine au stylet.', 'Schreibe, füge Fotos der Tafel ein oder zeichne mit dem Stift.', 'Write, paste photos of the board or draw with a stylus.'))) +
            tag('important', L('Lo más importante de hoy', 'O máis importante de hoxe', 'Le plus important aujourd’hui', 'Das Wichtigste heute', 'The most important thing today')) +
            tag('question', L('Duda para preguntar en la próxima clase', 'Dúbida para preguntar na próxima clase', 'Question à poser au prochain cours', 'Frage für die nächste Stunde', 'Question to ask in the next lesson')) +
            h2(L('Resumen', 'Resumo', 'Résumé', 'Zusammenfassung', 'Summary')) +
            p(hint(L('Resume la clase en tres frases.', 'Resume a clase en tres frases.', 'Résume le cours en trois phrases.', 'Fasse die Stunde in drei Sätzen zusammen.', 'Summarise the lesson in three sentences.'))),
        },
        {
          title: L('Ejercicios', 'Exercicios', 'Exercices', 'Übungen', 'Exercises'),
          level: 1,
          html: ol([L('Ejercicio 1', 'Exercicio 1', 'Exercice 1', 'Übung 1', 'Exercise 1'), L('Ejercicio 2', 'Exercicio 2', 'Exercice 2', 'Übung 2', 'Exercise 2')]) + tag('remember', L('Revisar las soluciones con la clase', 'Revisar as solucións coa clase', 'Corriger avec la classe', 'Lösungen mit der Klasse vergleichen', 'Correct with the class')),
        },
      ],
    },
    {
      name: L('Tareas', 'Tarefas', 'Devoirs', 'Hausaufgaben', 'Homework'),
      color: '#43a047',
      pages: [
        {
          title: L('Para entregar', 'Para entregar', 'À rendre', 'Abzugeben', 'To hand in'),
          html: tag('todo', L('Tarea 1 · fecha de entrega', 'Tarefa 1 · data de entrega', 'Devoir 1 · date de remise', 'Aufgabe 1 · Abgabedatum', 'Assignment 1 · due date')) + tag('todo', L('Tarea 2 · fecha de entrega', 'Tarefa 2 · data de entrega', 'Devoir 2 · date de remise', 'Aufgabe 2 · Abgabedatum', 'Assignment 2 · due date')),
        },
      ],
    },
    {
      name: L('Exámenes', 'Exames', 'Contrôles', 'Prüfungen', 'Tests'),
      color: '#e53935',
      pages: [
        {
          title: L('Repaso', 'Repaso', 'Révisions', 'Wiederholung', 'Revision'),
          html:
            p(hint(L('Usa Ver ▸ Resumen de etiquetas para reunir lo importante y las dudas de todas las páginas.', 'Usa Ver ▸ Resumo de etiquetas para reunir o importante e as dúbidas de todas as páxinas.', 'Utilise Affichage ▸ Résumé des balises pour réunir l’essentiel et les questions de toutes les pages.', 'Mit Ansicht ▸ Tag-Übersicht sammelst du Wichtiges und Fragen aus allen Seiten.', 'Use View ▸ Tag summary to gather the key points and questions from every page.'))) +
            tasks([L('Releer los apuntes', 'Reler os apuntamentos', 'Relire les notes', 'Notizen durchlesen', 'Reread the notes'), L('Hacer un esquema', 'Facer un esquema', 'Faire un schéma', 'Eine Übersicht erstellen', 'Make a diagram'), L('Resolver las dudas', 'Resolver as dúbidas', 'Résoudre les questions', 'Fragen klären', 'Answer the questions')]),
        },
      ],
    },
  ]
}

function labNotebook(L: L): SectionSpec[] {
  const q = L('Pregunta', 'Pregunta', 'Question', 'Frage', 'Question')
  return [
    {
      name: L('Prácticas', 'Prácticas', 'Travaux pratiques', 'Versuche', 'Lab work'),
      color: '#00897b',
      pages: [
        {
          title: L('Normas de seguridad', 'Normas de seguridade', 'Règles de sécurité', 'Sicherheitsregeln', 'Safety rules'),
          html:
            tag('remember', L('Bata, gafas y pelo recogido', 'Bata, lentes e pelo recollido', 'Blouse, lunettes et cheveux attachés', 'Kittel, Schutzbrille, Haare zusammenbinden', 'Lab coat, goggles and hair tied back')) +
            tag('remember', L('No comer ni beber en el laboratorio', 'Non comer nin beber no laboratorio', 'Ne pas manger ni boire au laboratoire', 'Im Labor nicht essen und trinken', 'No eating or drinking in the lab')) +
            tag('remember', L('Avisar al profesor de cualquier accidente', 'Avisar ao profesor de calquera accidente', 'Prévenir le professeur en cas d’accident', 'Jeden Unfall sofort der Lehrkraft melden', 'Tell the teacher if there is an accident')),
        },
        {
          title: L('Práctica 1', 'Práctica 1', 'TP 1', 'Versuch 1', 'Experiment 1'),
          html:
            h2(L('Objetivo', 'Obxectivo', 'Objectif', 'Ziel', 'Objective')) +
            p(hint(L('¿Qué queremos averiguar?', 'Que queremos descubrir?', 'Que voulons-nous découvrir ?', 'Was wollen wir herausfinden?', 'What do we want to find out?'))) +
            h2(L('Hipótesis', 'Hipótese', 'Hypothèse', 'Hypothese', 'Hypothesis')) +
            p(hint(L('Creemos que… porque…', 'Cremos que… porque…', 'Nous pensons que… parce que…', 'Wir vermuten, dass … weil …', 'We think that… because…'))) +
            h2(L('Materiales', 'Materiais', 'Matériel', 'Material', 'Materials')) +
            ul([L('Material 1', 'Material 1', 'Matériel 1', 'Material 1', 'Material 1'), L('Material 2', 'Material 2', 'Matériel 2', 'Material 2', 'Material 2')]) +
            h2(L('Procedimiento', 'Procedemento', 'Protocole', 'Durchführung', 'Method')) +
            ol([L('Paso 1', 'Paso 1', 'Étape 1', 'Schritt 1', 'Step 1'), L('Paso 2', 'Paso 2', 'Étape 2', 'Schritt 2', 'Step 2')]) +
            h2(L('Datos', 'Datos', 'Données', 'Messwerte', 'Data')) +
            table([
              [L('Medida', 'Medida', 'Mesure', 'Messung', 'Measurement'), L('Valor', 'Valor', 'Valeur', 'Wert', 'Value'), L('Unidad', 'Unidade', 'Unité', 'Einheit', 'Unit')],
              ['1', '', ''],
              ['2', '', ''],
              ['3', '', ''],
            ]) +
            h2(L('Resultados y conclusiones', 'Resultados e conclusións', 'Résultats et conclusions', 'Ergebnisse und Schlussfolgerungen', 'Results and conclusions')) +
            p(hint(L('¿Se cumple la hipótesis? Dibuja la gráfica con el lápiz o pega una foto.', 'Cúmprese a hipótese? Debuxa a gráfica co lapis ou pega unha foto.', 'L’hypothèse est-elle vérifiée ? Trace le graphique au stylet ou colle une photo.', 'Stimmt die Hypothese? Zeichne das Diagramm mit dem Stift oder füge ein Foto ein.', 'Is the hypothesis confirmed? Draw the graph with the stylus or paste a photo.'))) +
            tag('question', `${q} 1`),
        },
      ],
    },
    {
      name: L('Fórmulas y datos', 'Fórmulas e datos', 'Formules et données', 'Formeln und Daten', 'Formulas and data'),
      color: '#3949ab',
      pages: [
        {
          title: L('Fórmulas', 'Fórmulas', 'Formules', 'Formeln', 'Formulas'),
          html: `<p><span data-equation="" data-latex="v = \\frac{d}{t}"></span></p><p><span data-equation="" data-latex="\\rho = \\frac{m}{V}"></span></p>`,
        },
      ],
    },
  ]
}

function readingJournal(L: L): SectionSpec[] {
  return [
    {
      name: L('Libro 1', 'Libro 1', 'Livre 1', 'Buch 1', 'Book 1'),
      color: '#8e24aa',
      pages: [
        {
          title: L('Ficha del libro', 'Ficha do libro', 'Fiche du livre', 'Steckbrief des Buches', 'Book record'),
          html: table([
            [L('Dato', 'Dato', 'Information', 'Angabe', 'Information'), ''],
            [L('Título', 'Título', 'Titre', 'Titel', 'Title'), ''],
            [L('Autor o autora', 'Autor ou autora', 'Auteur', 'Autor/in', 'Author'), ''],
            [L('Género', 'Xénero', 'Genre', 'Gattung', 'Genre'), ''],
            [L('Empecé / terminé', 'Comecei / rematei', 'Commencé / terminé', 'Begonnen / beendet', 'Started / finished'), ''],
          ]),
        },
        {
          title: L('Capítulos 1–3', 'Capítulos 1–3', 'Chapitres 1 à 3', 'Kapitel 1–3', 'Chapters 1 to 3'),
          html:
            h2(L('Resumen', 'Resumo', 'Résumé', 'Zusammenfassung', 'Summary')) +
            p(hint(L('¿Qué ha pasado?', 'Que pasou?', 'Que s’est-il passé ?', 'Was ist passiert?', 'What happened?'))) +
            h2(L('Personajes', 'Personaxes', 'Personnages', 'Figuren', 'Characters')) +
            ul([L('Nombre: cómo es', 'Nome: como é', 'Nom : comment il est', 'Name: wie er/sie ist', 'Name: what they are like')]) +
            h2(L('Citas', 'Citas', 'Citations', 'Zitate', 'Quotes')) +
            `<blockquote><p>${hint(L('Copia una frase que te haya gustado (página).', 'Copia unha frase que che gustase (páxina).', 'Recopie une phrase que tu as aimée (page).', 'Schreibe einen Satz ab, der dir gefallen hat (Seite).', 'Copy a sentence you liked (page).'))}</p></blockquote>` +
            tag('question', L('¿Qué crees que pasará después?', 'Que cres que pasará despois?', 'Que va-t-il se passer ensuite, à ton avis ?', 'Was passiert wohl als Nächstes?', 'What do you think will happen next?')) +
            tag('important', L('Tema principal', 'Tema principal', 'Thème principal', 'Hauptthema', 'Main theme')),
        },
        {
          title: L('Valoración final', 'Valoración final', 'Avis final', 'Abschließende Bewertung', 'Final opinion'),
          html: p(L('Puntuación: ☆☆☆☆☆', 'Puntuación: ☆☆☆☆☆', 'Note : ☆☆☆☆☆', 'Bewertung: ☆☆☆☆☆', 'Rating: ☆☆☆☆☆')) + p(hint(L('¿Lo recomendarías? ¿Por qué?', 'Recomendaríalo? Por que?', 'Le recommanderais-tu ? Pourquoi ?', 'Würdest du es empfehlen? Warum?', 'Would you recommend it? Why?'))),
        },
      ],
    },
    {
      name: L('Vocabulario', 'Vocabulario', 'Vocabulaire', 'Wortschatz', 'Vocabulary'),
      color: '#fb8c00',
      pages: [
        {
          title: L('Palabras nuevas', 'Palabras novas', 'Mots nouveaux', 'Neue Wörter', 'New words'),
          html: table([
            [L('Palabra', 'Palabra', 'Mot', 'Wort', 'Word'), L('Significado', 'Significado', 'Sens', 'Bedeutung', 'Meaning'), L('Página', 'Páxina', 'Page', 'Seite', 'Page')],
            ['', '', ''],
            ['', '', ''],
          ]),
        },
      ],
    },
  ]
}

export async function createNotebookTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const L = pick(lang)
  const spec = id === 'nb-lab-notebook' ? labNotebook(L) : id === 'nb-reading-journal' ? readingJournal(L) : classNotes(L)
  const extensions = notebookExtensions()
  const schema = getSchema(extensions)
  return createLocalDocument('notebook', name, (doc) => {
    for (const section of spec) {
      const sectionId = addSection(doc, section.name, section.color)
      for (const page of section.pages)
        addPage(doc, sectionId, page.title, { level: page.level, content: (fragment) => prosemirrorJSONToYXmlFragment(schema, generateJSON(page.html, extensions), fragment) })
    }
  })
}
