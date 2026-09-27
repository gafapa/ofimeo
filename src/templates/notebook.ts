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
      name: L('Unidad 1', 'Unidade 1', 'Chapitre 1', 'Einheit 1'),
      color: '#1e88e5',
      pages: [
        {
          title: L('Objetivos de la unidad', 'Obxectivos da unidade', 'Objectifs du chapitre', 'Lernziele der Einheit'),
          html:
            p(hint(L('Copia aquí los objetivos que da el profesor y márcalos cuando los domines.', 'Copia aquí os obxectivos que dá o profesor e márcaos cando os domines.', 'Recopie ici les objectifs donnés par le professeur et coche-les quand tu les maîtrises.', 'Schreibe hier die Lernziele ab und hake sie ab, wenn du sie beherrschst.'))) +
            tasks([L('Objetivo 1', 'Obxectivo 1', 'Objectif 1', 'Ziel 1'), L('Objetivo 2', 'Obxectivo 2', 'Objectif 2', 'Ziel 2'), L('Objetivo 3', 'Obxectivo 3', 'Objectif 3', 'Ziel 3')]),
        },
        {
          title: L('Clase 1: tema', 'Clase 1: tema', 'Cours 1 : thème', 'Stunde 1: Thema'),
          html:
            h2(L('Ideas clave', 'Ideas clave', 'Idées clés', 'Kernideen')) +
            ul([L('Idea principal', 'Idea principal', 'Idée principale', 'Hauptidee'), L('Concepto y definición', 'Concepto e definición', 'Notion et définition', 'Begriff und Definition')]) +
            h2(L('Notas', 'Notas', 'Notes', 'Notizen')) +
            p(hint(L('Escribe, pega fotos de la pizarra o dibuja con el lápiz.', 'Escribe, pega fotos do encerado ou debuxa co lapis.', 'Écris, colle des photos du tableau ou dessine au stylet.', 'Schreibe, füge Fotos der Tafel ein oder zeichne mit dem Stift.'))) +
            tag('important', L('Lo más importante de hoy', 'O máis importante de hoxe', 'Le plus important aujourd’hui', 'Das Wichtigste heute')) +
            tag('question', L('Duda para preguntar en la próxima clase', 'Dúbida para preguntar na próxima clase', 'Question à poser au prochain cours', 'Frage für die nächste Stunde')) +
            h2(L('Resumen', 'Resumo', 'Résumé', 'Zusammenfassung')) +
            p(hint(L('Resume la clase en tres frases.', 'Resume a clase en tres frases.', 'Résume le cours en trois phrases.', 'Fasse die Stunde in drei Sätzen zusammen.'))),
        },
        {
          title: L('Ejercicios', 'Exercicios', 'Exercices', 'Übungen'),
          level: 1,
          html: ol([L('Ejercicio 1', 'Exercicio 1', 'Exercice 1', 'Übung 1'), L('Ejercicio 2', 'Exercicio 2', 'Exercice 2', 'Übung 2')]) + tag('remember', L('Revisar las soluciones con la clase', 'Revisar as solucións coa clase', 'Corriger avec la classe', 'Lösungen mit der Klasse vergleichen')),
        },
      ],
    },
    {
      name: L('Tareas', 'Tarefas', 'Devoirs', 'Hausaufgaben'),
      color: '#43a047',
      pages: [
        {
          title: L('Para entregar', 'Para entregar', 'À rendre', 'Abzugeben'),
          html: tag('todo', L('Tarea 1 · fecha de entrega', 'Tarefa 1 · data de entrega', 'Devoir 1 · date de remise', 'Aufgabe 1 · Abgabedatum')) + tag('todo', L('Tarea 2 · fecha de entrega', 'Tarefa 2 · data de entrega', 'Devoir 2 · date de remise', 'Aufgabe 2 · Abgabedatum')),
        },
      ],
    },
    {
      name: L('Exámenes', 'Exames', 'Contrôles', 'Prüfungen'),
      color: '#e53935',
      pages: [
        {
          title: L('Repaso', 'Repaso', 'Révisions', 'Wiederholung'),
          html:
            p(hint(L('Usa Ver ▸ Resumen de etiquetas para reunir lo importante y las dudas de todas las páginas.', 'Usa Ver ▸ Resumo de etiquetas para reunir o importante e as dúbidas de todas as páxinas.', 'Utilise Affichage ▸ Résumé des balises pour réunir l’essentiel et les questions de toutes les pages.', 'Mit Ansicht ▸ Tag-Übersicht sammelst du Wichtiges und Fragen aus allen Seiten.'))) +
            tasks([L('Releer los apuntes', 'Reler os apuntamentos', 'Relire les notes', 'Notizen durchlesen'), L('Hacer un esquema', 'Facer un esquema', 'Faire un schéma', 'Eine Übersicht erstellen'), L('Resolver las dudas', 'Resolver as dúbidas', 'Résoudre les questions', 'Fragen klären')]),
        },
      ],
    },
  ]
}

function labNotebook(L: L): SectionSpec[] {
  const q = L('Pregunta', 'Pregunta', 'Question', 'Frage')
  return [
    {
      name: L('Prácticas', 'Prácticas', 'Travaux pratiques', 'Versuche'),
      color: '#00897b',
      pages: [
        {
          title: L('Normas de seguridad', 'Normas de seguridade', 'Règles de sécurité', 'Sicherheitsregeln'),
          html:
            tag('remember', L('Bata, gafas y pelo recogido', 'Bata, lentes e pelo recollido', 'Blouse, lunettes et cheveux attachés', 'Kittel, Schutzbrille, Haare zusammenbinden')) +
            tag('remember', L('No comer ni beber en el laboratorio', 'Non comer nin beber no laboratorio', 'Ne pas manger ni boire au laboratoire', 'Im Labor nicht essen und trinken')) +
            tag('remember', L('Avisar al profesor de cualquier accidente', 'Avisar ao profesor de calquera accidente', 'Prévenir le professeur en cas d’accident', 'Jeden Unfall sofort der Lehrkraft melden')),
        },
        {
          title: L('Práctica 1', 'Práctica 1', 'TP 1', 'Versuch 1'),
          html:
            h2(L('Objetivo', 'Obxectivo', 'Objectif', 'Ziel')) +
            p(hint(L('¿Qué queremos averiguar?', 'Que queremos descubrir?', 'Que voulons-nous découvrir ?', 'Was wollen wir herausfinden?'))) +
            h2(L('Hipótesis', 'Hipótese', 'Hypothèse', 'Hypothese')) +
            p(hint(L('Creemos que… porque…', 'Cremos que… porque…', 'Nous pensons que… parce que…', 'Wir vermuten, dass … weil …'))) +
            h2(L('Materiales', 'Materiais', 'Matériel', 'Material')) +
            ul([L('Material 1', 'Material 1', 'Matériel 1', 'Material 1'), L('Material 2', 'Material 2', 'Matériel 2', 'Material 2')]) +
            h2(L('Procedimiento', 'Procedemento', 'Protocole', 'Durchführung')) +
            ol([L('Paso 1', 'Paso 1', 'Étape 1', 'Schritt 1'), L('Paso 2', 'Paso 2', 'Étape 2', 'Schritt 2')]) +
            h2(L('Datos', 'Datos', 'Données', 'Messwerte')) +
            table([
              [L('Medida', 'Medida', 'Mesure', 'Messung'), L('Valor', 'Valor', 'Valeur', 'Wert'), L('Unidad', 'Unidade', 'Unité', 'Einheit')],
              ['1', '', ''],
              ['2', '', ''],
              ['3', '', ''],
            ]) +
            h2(L('Resultados y conclusiones', 'Resultados e conclusións', 'Résultats et conclusions', 'Ergebnisse und Schlussfolgerungen')) +
            p(hint(L('¿Se cumple la hipótesis? Dibuja la gráfica con el lápiz o pega una foto.', 'Cúmprese a hipótese? Debuxa a gráfica co lapis ou pega unha foto.', 'L’hypothèse est-elle vérifiée ? Trace le graphique au stylet ou colle une photo.', 'Stimmt die Hypothese? Zeichne das Diagramm mit dem Stift oder füge ein Foto ein.'))) +
            tag('question', `${q} 1`),
        },
      ],
    },
    {
      name: L('Fórmulas y datos', 'Fórmulas e datos', 'Formules et données', 'Formeln und Daten'),
      color: '#3949ab',
      pages: [
        {
          title: L('Fórmulas', 'Fórmulas', 'Formules', 'Formeln'),
          html: `<p><span data-equation="" data-latex="v = \\frac{d}{t}"></span></p><p><span data-equation="" data-latex="\\rho = \\frac{m}{V}"></span></p>`,
        },
      ],
    },
  ]
}

function readingJournal(L: L): SectionSpec[] {
  return [
    {
      name: L('Libro 1', 'Libro 1', 'Livre 1', 'Buch 1'),
      color: '#8e24aa',
      pages: [
        {
          title: L('Ficha del libro', 'Ficha do libro', 'Fiche du livre', 'Steckbrief des Buches'),
          html: table([
            [L('Dato', 'Dato', 'Information', 'Angabe'), ''],
            [L('Título', 'Título', 'Titre', 'Titel'), ''],
            [L('Autor o autora', 'Autor ou autora', 'Auteur', 'Autor/in'), ''],
            [L('Género', 'Xénero', 'Genre', 'Gattung'), ''],
            [L('Empecé / terminé', 'Comecei / rematei', 'Commencé / terminé', 'Begonnen / beendet'), ''],
          ]),
        },
        {
          title: L('Capítulos 1–3', 'Capítulos 1–3', 'Chapitres 1 à 3', 'Kapitel 1–3'),
          html:
            h2(L('Resumen', 'Resumo', 'Résumé', 'Zusammenfassung')) +
            p(hint(L('¿Qué ha pasado?', 'Que pasou?', 'Que s’est-il passé ?', 'Was ist passiert?'))) +
            h2(L('Personajes', 'Personaxes', 'Personnages', 'Figuren')) +
            ul([L('Nombre: cómo es', 'Nome: como é', 'Nom : comment il est', 'Name: wie er/sie ist')]) +
            h2(L('Citas', 'Citas', 'Citations', 'Zitate')) +
            `<blockquote><p>${hint(L('Copia una frase que te haya gustado (página).', 'Copia unha frase que che gustase (páxina).', 'Recopie une phrase que tu as aimée (page).', 'Schreibe einen Satz ab, der dir gefallen hat (Seite).'))}</p></blockquote>` +
            tag('question', L('¿Qué crees que pasará después?', 'Que cres que pasará despois?', 'Que va-t-il se passer ensuite, à ton avis ?', 'Was passiert wohl als Nächstes?')) +
            tag('important', L('Tema principal', 'Tema principal', 'Thème principal', 'Hauptthema')),
        },
        {
          title: L('Valoración final', 'Valoración final', 'Avis final', 'Abschließende Bewertung'),
          html: p(L('Puntuación: ☆☆☆☆☆', 'Puntuación: ☆☆☆☆☆', 'Note : ☆☆☆☆☆', 'Bewertung: ☆☆☆☆☆')) + p(hint(L('¿Lo recomendarías? ¿Por qué?', 'Recomendaríalo? Por que?', 'Le recommanderais-tu ? Pourquoi ?', 'Würdest du es empfehlen? Warum?'))),
        },
      ],
    },
    {
      name: L('Vocabulario', 'Vocabulario', 'Vocabulaire', 'Wortschatz'),
      color: '#fb8c00',
      pages: [
        {
          title: L('Palabras nuevas', 'Palabras novas', 'Mots nouveaux', 'Neue Wörter'),
          html: table([
            [L('Palabra', 'Palabra', 'Mot', 'Wort'), L('Significado', 'Significado', 'Sens', 'Bedeutung'), L('Página', 'Páxina', 'Page', 'Seite')],
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
