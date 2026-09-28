// Form templates (Ofimeo Forms): self-assessment, review quiz (with answer
// key), family survey and peer-assessment rubric, in es, gl, fr and de.

import { createForm, type AnswerKey, type FormFile, type Item, type Settings } from '../apps/forms/model'
import { pick, type Lang } from './types'

type Q = Partial<Item> & { kind: 'section' | 'question' }

const opts = (prefix: string, labels: string[]) => labels.map((label, i) => ({ id: `${prefix}${i + 1}`, label }))
const key = (k: Partial<AnswerKey>): AnswerKey => ({ correct: [], rows: {}, feedbackCorrect: '', feedbackWrong: '', optionFeedback: {}, ...k })

function build(id: string, L: ReturnType<typeof pick>, name: string): { items: Q[]; settings: Partial<Settings>; answers?: Record<string, AnswerKey> } {
  const levels = [L('Nunca', 'Nunca', 'Jamais', 'Nie', 'Never'), L('A veces', 'Ás veces', 'Parfois', 'Manchmal', 'Sometimes'), L('A menudo', 'A miúdo', 'Souvent', 'Oft', 'Often'), L('Siempre', 'Sempre', 'Toujours', 'Immer', 'Always')]
  switch (id) {
    case 'form-self-assessment':
      return {
        settings: { description: L('Reflexiona con sinceridad sobre tu trabajo en esta unidad. No hay respuestas buenas ni malas.', 'Reflexiona con sinceridade sobre o teu traballo nesta unidade. Non hai respostas boas nin malas.', 'Réfléchis honnêtement à ton travail pendant cette séquence. Il n’y a pas de bonnes ou de mauvaises réponses.', 'Denke ehrlich über deine Arbeit in dieser Einheit nach. Es gibt keine richtigen oder falschen Antworten.', 'Think honestly about your work during this unit. There are no right or wrong answers.'), collectGroup: true },
        items: [
          { kind: 'section', id: 's1', title: L('Mi trabajo', 'O meu traballo', 'Mon travail', 'Meine Arbeit', 'My work') },
          { kind: 'question', id: 'q1', type: 'grid', title: L('¿Con qué frecuencia…?', 'Con que frecuencia…?', 'À quelle fréquence… ?', 'Wie oft …?', 'How often…?'), rows: opts('r', [L('He entregado las tareas a tiempo', 'Entreguei as tarefas a tempo', 'J’ai rendu mes devoirs à temps', 'Ich habe die Aufgaben pünktlich abgegeben', 'I handed in my homework on time'), L('He participado en clase', 'Participei na clase', 'J’ai participé en classe', 'Ich habe im Unterricht mitgearbeitet', 'I took part in class'), L('He ayudado a mis compañeros', 'Axudei os meus compañeiros', 'J’ai aidé mes camarades', 'Ich habe meinen Mitschülern geholfen', 'I helped my classmates'), L('He pedido ayuda cuando la necesitaba', 'Pedín axuda cando a precisaba', 'J’ai demandé de l’aide quand j’en avais besoin', 'Ich habe um Hilfe gebeten, wenn ich sie brauchte', 'I asked for help when I needed it')]), options: opts('c', levels), required: true },
          { kind: 'question', id: 'q2', type: 'scale', title: L('¿Cuánto crees que has aprendido?', 'Canto cres que aprendiches?', 'Combien penses-tu avoir appris ?', 'Wie viel hast du deiner Meinung nach gelernt?', 'How much do you think you learned?'), min: 1, max: 5, minLabel: L('Poco', 'Pouco', 'Peu', 'Wenig', 'A little'), maxLabel: L('Mucho', 'Moito', 'Beaucoup', 'Viel', 'A lot'), required: true },
          { kind: 'section', id: 's2', title: L('Lo que aprendí', 'O que aprendín', 'Ce que j’ai appris', 'Was ich gelernt habe', 'What I learned') },
          { kind: 'question', id: 'q3', type: 'paragraph', title: L('¿Qué es lo más importante que has aprendido?', 'Que é o máis importante que aprendiches?', 'Quelle est la chose la plus importante que tu as apprise ?', 'Was ist das Wichtigste, das du gelernt hast?', 'What is the most important thing you learned?') },
          { kind: 'question', id: 'q4', type: 'paragraph', title: L('¿Qué te ha resultado más difícil y cómo lo mejorarías?', 'Que che resultou máis difícil e como o mellorarías?', 'Qu’est-ce qui a été le plus difficile et comment t’améliorerais-tu ?', 'Was fiel dir am schwersten und wie würdest du dich verbessern?', 'What was the hardest part, and how would you improve?') },
          { kind: 'question', id: 'q5', type: 'choice', title: L('¿Qué nota te pondrías?', 'Que nota te porías?', 'Quelle note te donnerais-tu ?', 'Welche Note würdest du dir geben?', 'What grade would you give yourself?'), options: opts('o', ['1–4', '5–6', '7–8', '9–10']) },
        ],
      }
    case 'form-review-quiz':
      return {
        settings: { description: L('Cuestionario de repaso con corrección automática. Al terminar, tu profesor publicará la nota y la retroalimentación.', 'Cuestionario de repaso con corrección automática. Ao rematar, o teu profesor publicará a nota e a retroalimentación.', 'Quiz de révision corrigé automatiquement. Ton professeur publiera ensuite la note et les commentaires.', 'Wiederholungsquiz mit automatischer Korrektur. Deine Lehrkraft gibt danach Note und Rückmeldung frei.', 'Review quiz that grades itself. Your teacher will then publish the grade and the feedback.'), quiz: true, release: 'immediate', showCorrect: true, collectGroup: true },
        items: [
          { kind: 'question', id: 'q1', type: 'choice', title: L('¿Cuál es la capital de Portugal?', 'Cal é a capital de Portugal?', 'Quelle est la capitale du Portugal ?', 'Was ist die Hauptstadt Portugals?', 'What is the capital of Portugal?'), options: opts('o', ['Oporto', L('Lisboa', 'Lisboa', 'Lisbonne', 'Lissabon', 'Lisbon'), 'Coímbra', 'Braga']), required: true, points: 1, shuffle: true },
          { kind: 'question', id: 'q2', type: 'checkbox', title: L('¿Cuáles de estos números son primos?', 'Cales destes números son primos?', 'Lesquels de ces nombres sont premiers ?', 'Welche dieser Zahlen sind Primzahlen?', 'Which of these numbers are prime?'), options: opts('o', ['2', '9', '11', '15', '17']), required: true, points: 2 },
          { kind: 'question', id: 'q3', type: 'number', title: L('Calcula el resultado', 'Calcula o resultado', 'Calcule le résultat', 'Berechne das Ergebnis', 'Work out the result'), description: L('Escribe el número decimal (con dos decimales).', 'Escribe o número decimal (con dous decimais).', 'Écris le nombre décimal (deux décimales).', 'Gib die Dezimalzahl an (zwei Nachkommastellen).', 'Write the decimal number (two decimal places).'), equation: '\\frac{3}{4}+\\frac{1}{2}', required: true, points: 2 },
          { kind: 'question', id: 'q4', type: 'short', title: L('¿Qué gas absorben las plantas en la fotosíntesis?', 'Que gas absorben as plantas na fotosíntese?', 'Quel gaz les plantes absorbent-elles pendant la photosynthèse ?', 'Welches Gas nehmen Pflanzen bei der Photosynthese auf?', 'Which gas do plants take in during photosynthesis?'), required: true, points: 1 },
          { kind: 'question', id: 'q5', type: 'dropdown', title: L('¿En qué año llegó el ser humano a la Luna?', 'En que ano chegou o ser humano á Lúa?', 'En quelle année l’être humain a-t-il marché sur la Lune ?', 'In welchem Jahr betrat der Mensch den Mond?', 'In what year did humans walk on the Moon?'), options: opts('o', ['1959', '1969', '1979', '1989']), points: 1 },
          { kind: 'question', id: 'q6', type: 'paragraph', title: L('Explica con tus palabras qué es el ciclo del agua.', 'Explica coas túas palabras que é o ciclo da auga.', 'Explique avec tes mots ce qu’est le cycle de l’eau.', 'Erkläre mit eigenen Worten, was der Wasserkreislauf ist.', 'Explain in your own words what the water cycle is.'), points: 3 },
        ],
        answers: {
          q1: key({ correct: ['o2'], feedbackWrong: L('Repasa las capitales europeas.', 'Repasa as capitais europeas.', 'Révise les capitales européennes.', 'Wiederhole die europäischen Hauptstädte.', 'Review the European capitals.') }),
          q2: key({ correct: ['o1', 'o3', 'o5'], feedbackWrong: L('Un número primo solo es divisible por 1 y por sí mismo.', 'Un número primo só é divisible por 1 e por si mesmo.', 'Un nombre premier n’est divisible que par 1 et par lui-même.', 'Eine Primzahl ist nur durch 1 und sich selbst teilbar.', 'A prime number can only be divided by 1 and by itself.') }),
          q3: key({ value: 1.25, tolerance: 0.01, feedbackCorrect: '3/4 + 1/2 = 5/4 = 1,25', feedbackWrong: '3/4 + 1/2 = 3/4 + 2/4 = 5/4 = 1,25' }),
          q4: key({ correct: [L('dióxido de carbono', 'dióxido de carbono', 'dioxyde de carbone', 'Kohlendioxid', 'carbon dioxide'), 'CO2'] }),
          q5: key({ correct: ['o2'] }),
        },
      }
    case 'form-family-survey':
      return {
        settings: { description: L('Queremos conocer vuestra opinión para mejorar. La encuesta es breve y solo el equipo docente verá las respuestas.', 'Queremos coñecer a vosa opinión para mellorar. A enquisa é breve e só o equipo docente verá as respostas.', 'Nous souhaitons connaître votre avis pour nous améliorer. L’enquête est courte et seule l’équipe pédagogique verra les réponses.', 'Wir möchten Ihre Meinung erfahren, um uns zu verbessern. Die Umfrage ist kurz; nur das Lehrerteam sieht die Antworten.', 'We would like to know your opinion so that we can improve. The survey is short, and only the teaching staff will see the answers.'), collectGroup: true, onePerBrowser: true, confirmation: L('¡Gracias por vuestra participación!', 'Grazas pola vosa participación!', 'Merci de votre participation !', 'Vielen Dank für Ihre Teilnahme!', 'Thank you for taking part!') },
        items: [
          { kind: 'question', id: 'q1', type: 'scale', title: L('Satisfacción general con el centro', 'Satisfacción xeral co centro', 'Satisfaction générale à l’égard de l’établissement', 'Allgemeine Zufriedenheit mit der Schule', 'Overall satisfaction with the school'), min: 1, max: 5, minLabel: L('Nada satisfecho', 'Nada satisfeito', 'Pas du tout satisfait', 'Gar nicht zufrieden', 'Not at all satisfied'), maxLabel: L('Muy satisfecho', 'Moi satisfeito', 'Très satisfait', 'Sehr zufrieden', 'Very satisfied'), required: true },
          { kind: 'question', id: 'q2', type: 'choice', title: L('¿Cómo preferís recibir la información del centro?', 'Como preferides recibir a información do centro?', 'Comment préférez-vous recevoir les informations ?', 'Wie möchten Sie Informationen der Schule erhalten?', 'How do you prefer to receive information?'), options: opts('o', [L('Correo electrónico', 'Correo electrónico', 'Courriel', 'E-Mail', 'Email'), L('Aplicación del centro', 'Aplicación do centro', 'Application de l’établissement', 'Schul-App', 'School app'), L('Nota en papel', 'Nota en papel', 'Mot sur papier', 'Zettel', 'Paper note'), L('Reunión presencial', 'Reunión presencial', 'Réunion en personne', 'Persönliches Treffen', 'Face-to-face meeting')]), required: true },
          { kind: 'question', id: 'q3', type: 'checkbox', title: L('¿En qué actividades os gustaría participar?', 'En que actividades vos gustaría participar?', 'À quelles activités aimeriez-vous participer ?', 'An welchen Aktivitäten würden Sie gern teilnehmen?', 'Which activities would you like to take part in?'), options: opts('o', [L('Talleres', 'Obradoiros', 'Ateliers', 'Workshops', 'Workshops'), L('Excursiones', 'Excursións', 'Sorties', 'Ausflüge', 'Trips'), L('Fiestas del centro', 'Festas do centro', 'Fêtes de l’école', 'Schulfeste', 'School celebrations'), L('Escuela de familias', 'Escola de familias', 'École des parents', 'Elternabende', 'Parenting workshops')]) },
          { kind: 'question', id: 'q4', type: 'dropdown', title: L('Mejor horario para reuniones', 'Mellor horario para reunións', 'Meilleur horaire pour les réunions', 'Beste Zeit für Treffen', 'Best time for meetings'), options: opts('o', ['9:00–11:00', '12:00–14:00', '16:00–18:00', '18:00–20:00']) },
          { kind: 'question', id: 'q5', type: 'date', title: L('Fecha preferida para la reunión de tutoría', 'Data preferida para a reunión de titoría', 'Date préférée pour le rendez-vous avec le professeur principal', 'Wunschtermin für das Elterngespräch', 'Preferred date for the meeting with the class tutor') },
          { kind: 'question', id: 'q6', type: 'paragraph', title: L('Sugerencias', 'Suxestións', 'Suggestions', 'Anregungen', 'Suggestions') },
        ],
      }
    default:
      // form-peer-rubric
      return {
        settings: { description: L('Evalúa el trabajo de tu compañero o compañera con respeto y argumentos. Solo el profesorado verá tus respuestas.', 'Avalía o traballo do teu compañeiro ou compañeira con respecto e argumentos. Só o profesorado verá as túas respostas.', 'Évalue le travail de ton ou ta camarade avec respect et arguments. Seuls les enseignants verront tes réponses.', 'Bewerte die Arbeit deiner Mitschülerin oder deines Mitschülers respektvoll und begründet. Nur die Lehrkräfte sehen deine Antworten.', 'Assess your classmate’s work respectfully and give reasons. Only the teachers will see your answers.'), collectGroup: true },
        items: [
          { kind: 'question', id: 'q1', type: 'short', title: L('Nombre del compañero o compañera evaluado', 'Nome do compañeiro ou compañeira avaliado', 'Nom du ou de la camarade évalué(e)', 'Name der bewerteten Person', 'Name of the classmate you are assessing'), required: true },
          { kind: 'question', id: 'q2', type: 'grid', title: name, description: L('1 = insuficiente · 4 = excelente', '1 = insuficiente · 4 = excelente', '1 = insuffisant · 4 = excellent', '1 = unzureichend · 4 = ausgezeichnet', '1 = insufficient · 4 = excellent'), rows: opts('r', [L('Contenido', 'Contido', 'Contenu', 'Inhalt', 'Content'), L('Organización', 'Organización', 'Organisation', 'Aufbau', 'Organisation'), L('Expresión oral', 'Expresión oral', 'Expression orale', 'Mündlicher Ausdruck', 'Speaking'), L('Trabajo en equipo', 'Traballo en equipo', 'Travail d’équipe', 'Teamarbeit', 'Teamwork'), L('Uso del tiempo', 'Uso do tempo', 'Gestion du temps', 'Zeitmanagement', 'Time management')]), options: opts('c', ['1', '2', '3', '4']), required: true },
          { kind: 'question', id: 'q3', type: 'paragraph', title: L('Un punto fuerte', 'Un punto forte', 'Un point fort', 'Eine Stärke', 'A strength'), required: true },
          { kind: 'question', id: 'q4', type: 'paragraph', title: L('Una propuesta de mejora', 'Unha proposta de mellora', 'Une piste d’amélioration', 'Ein Verbesserungsvorschlag', 'Something to improve'), required: true },
        ],
      }
  }
}

export function createFormTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const { items, settings, answers } = build(id, pick(lang), name)
  const file: FormFile = { format: 'ofimeo-form', version: 1, title: name, settings, items, answers }
  return createForm(file)
}
