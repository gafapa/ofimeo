// Artículos del centro de ayuda en español (traducción de en.ts).
import type { Articles } from './types'

const articles: Articles = {
  'getting-started': {
    title: 'Primeros pasos',
    keywords: 'empezar inicio comenzar bienvenida pantalla principal nuevo documento abrir plantilla cuenta',
    body: `Ofimeo es una suite ofimática que funciona entera en tu navegador: documentos, hojas de cálculo, dibujos, diagramas, presentaciones, formularios y corrección de PDF. No necesitas cuenta y no se instala nada en ningún servidor.

## La pantalla principal
- **Empieza algo nuevo**: haz clic en una tarjeta para crear un documento de ese tipo.
- **Plantillas**: fichas, rúbricas, cuadernos de notas, horarios, mapas conceptuales y más. Haz clic en una para obtener tu propia copia.
- **Abrir archivo…**: abre archivos de Word, OpenDocument, Excel, CSV, PowerPoint, draw.io, Excalidraw y PDF de tu ordenador.
- **Tus documentos**: todo lo que has creado o abierto en este navegador, con búsqueda, carpetas, etiquetas y papelera (los documentos eliminados se guardan 30 días).

## Tu nombre
Escribe tu nombre en la casilla de arriba a la derecha (en un móvil o en una ventana estrecha, toca el botón de la persona de arriba a la derecha). Los colaboradores lo ven junto a tu cursor y en los comentarios, y se usa en el nombre del archivo cuando entregas un trabajo. Basta con el nombre de pila o las iniciales.

## Importante
- Los documentos se guardan **solo en este navegador**. Lee [Trabajar sin conexión y dónde se guardan tus datos](help:offline) y haz [copias de seguridad](help:backup).
- Para trabajar con otras personas, envía un [enlace para compartir](help:sharing).
- El alumnado entrega los trabajos con el botón [Entregar](help:handin).

[Ver de nuevo la visita guiada](action:tour)

## Importar desde Google Drive o Microsoft 365
**Importar desde un enlace…** (pantalla de inicio y menú Archivo de cada aplicación) abre archivos compartidos desde Documentos, Hojas de cálculo, Presentaciones y Drive de Google, OneDrive o SharePoint:
1. Pega el enlace para compartir. El archivo debe estar compartido con **Cualquier persona con el enlace**, o tienes que poder abrirlo con tu propia cuenta.
2. Pulsa el botón de descarga: tu navegador descarga el archivo como Word, Excel o PowerPoint.
3. Suelta el archivo descargado en el cuadro de diálogo (o elígelo). Se abre como un documento nuevo de Ofimeo.

Los navegadores no permiten que las aplicaciones web descarguen estos archivos directamente, así que el archivo pasa por tu carpeta de Descargas; Ofimeo nunca ve tu cuenta de Google o Microsoft. Si el relé de tu centro lo ofrece, **Importar directamente a través del relé del centro** lo hace en un clic con los archivos públicos.`,
  },
  sharing: {
    title: 'Compartir y permisos',
    keywords: 'compartir enlace invitar colaborar juntos permiso editar comentar ver solo lectura copia ficha código qr alumnos',
    body: `Haz clic en **Compartir** (arriba a la derecha en todas las aplicaciones) para obtener un enlace. Quien abre el enlace entra en el documento y los cambios aparecen para todos en tiempo real.

## Tipos de enlace
- **Puede editar**: pueden modificar el documento contigo.
- **Puede comentar**: pueden leer y añadir comentarios, pero no cambiar el texto.
- **Puede ver**: pueden leer el documento y seguir los cambios en directo.
- **Hace una copia**: cada persona que lo abre obtiene su propia copia privada. Úsalo para dar una ficha a cada alumno.

El cuadro de diálogo también muestra un **código QR**, práctico para tabletas y móviles en clase.

## Conviene saber
- Un enlace es como una llave: quien lo tiene obtiene su acceso. Compártelo solo con quien lo necesite.
- Los enlaces de lectura y de comentario no se pueden convertir en enlaces de edición: los cambios solo se aceptan si están firmados con la clave de edición.
- No hay una copia central en un servidor. Para recibir los últimos cambios, alguien que tenga el documento debe estar conectado a la vez. Los cambios hechos sin conexión se combinan solos la próxima vez que coincidáis.
- El estado junto a Compartir dice **Solo tú** o cuántas personas hay. Si nunca aparece nadie, haz la [prueba de conexión](help:network).
- Los documentos creados antes de que existieran los enlaces con permisos solo se pueden compartir con enlaces de edición. Usa Archivo ▸ Hacer una copia para tener todos los tipos de enlace.

## Chat
- El botón del bocadillo junto a las personas del documento (o \`Alt+Shift+C\`) abre el chat. Un número indica los mensajes sin leer; se vuelve rojo cuando alguien te menciona.
- Escribe \`@\` para mencionar a alguien que está aquí. Los enlaces se abren en otra pestaña; el botón de la cara sonriente añade emojis. \`Intro\` envía, \`Mayús+Intro\` empieza una línea nueva y \`Escape\` cierra el chat.
- Quien tiene un enlace para editar o comentar puede escribir; quien tiene un enlace de solo lectura solo puede leer.
- Docentes (enlace para editar): el botón ⋯ del chat lo desactiva en este documento o borra su historial para todos.
- Los mensajes se guardan con el documento en este navegador y en las copias de seguridad, pero no en las versiones, las copias ni los archivos descargados.`,
  },
  offline: {
    title: 'Trabajar sin conexión y dónde se guardan tus datos',
    keywords: 'sin conexión internet instalar aplicación pwa almacenamiento indexeddb datos del navegador borrar perdidos dispositivo ordenador',
    body: `Tus documentos se guardan **en este navegador, en este dispositivo** (en su almacenamiento IndexedDB). No se suben a ningún servidor (salvo que actives [sincronizar sin estar conectados a la vez](help:network), que guarda una copia cifrada). El estado de guardado de la barra de estado indica **Guardado en este navegador**.

## Qué significa
- Borrar los datos del navegador (historial, cookies y datos de sitios) **elimina tus documentos**. Haz [copias de seguridad](help:backup) o guárdalos en [Nextcloud](help:nextcloud).
- Otro navegador u otro ordenador no ven tus documentos. Para seguir en otro dispositivo, abre allí tu enlace de edición mientras este dispositivo está conectado, o restaura una copia de seguridad.
- Ofimeo pide al navegador que proteja su almacenamiento para que no borre los documentos cuando falte espacio. [Almacenamiento y copias de seguridad](action:storage) muestra si está protegido y cuánto espacio se usa.

## Trabajar sin conexión
- Después de la primera visita, toda la suite funciona sin conexión. La pantalla principal muestra **✓ Disponible sin conexión** cuando está lista.
- Puedes instalar Ofimeo como aplicación (menú del navegador o barra de direcciones ▸ Instalar). Instalada, abre archivos de Word, Excel, PowerPoint y otros desde tu ordenador.
- Crear, editar, abrir y descargar archivos no necesita conexión. Los cambios hechos sin conexión se envían a los colaboradores cuando vuelves a estar conectado.
- Nextcloud y el dictado necesitan conexión.`,
  },
  backup: {
    title: 'Copias de seguridad y restauración',
    keywords: 'copia de seguridad respaldo restaurar recuperar contraseña cifrado ofimeo-backup recordatorio documentos perdidos cambiar de ordenador',
    body: `Como los documentos están solo en este navegador, guarda una copia de seguridad. Abre [Almacenamiento y copias de seguridad](action:storage) (icono de disco en la pantalla principal, o Archivo ▸ Almacenamiento y copias de seguridad… en cualquier aplicación).

## Hacer una copia
- **Copia de seguridad de todos los documentos** descarga un único archivo **.ofimeo-backup** con todos tus documentos, su historial de versiones, los comentarios y tus plantillas.
- Puedes protegerlo con una **contraseña** (cifrado fuerte). Hazlo: el archivo contiene las claves para editar tus documentos. Sin la contraseña no se puede restaurar.
- En la pantalla principal también puedes copiar solo los documentos seleccionados.

## Restaurar
**Restaurar copia de seguridad** lee el archivo y lo combina: los documentos que ya están aquí se actualizan sin perder nada y los que faltan se añaden. Un informe indica qué se añadió y qué se combinó. Úsalo para llevar tus documentos a otro ordenador o navegador.

## Recordatorios y copia automática
- La pantalla principal te avisa cuando hay documentos que solo están en este navegador y no has hecho copia en 7 días (puedes cambiar los días o desactivarlo).
- Con una cuenta de [Nextcloud](help:nextcloud), la copia automática sube una copia cada pocos días a una carpeta de tu Nextcloud (desactivada por defecto).`,
  },
  nextcloud: {
    title: 'Nextcloud',
    keywords: 'nube servidor webdav guardar abrir sincronizar contraseña de aplicación iniciar sesión cuenta centro archivo',
    body: `Si tu centro tiene un servidor Nextcloud, puedes abrir archivos de él y volver a guardarlos. Tu navegador se comunica directamente con Nextcloud.

## Conectar tu cuenta
Abre [Cuenta de Nextcloud](action:nextcloud) (botón Nextcloud de la pantalla principal, o Archivo ▸ Cuenta de Nextcloud…). Escribe la dirección del servidor y elige **Iniciar sesión con Nextcloud**, o usa una **contraseña de aplicación** (Nextcloud ▸ Configuración personal ▸ Seguridad ▸ Crear nueva contraseña de aplicación). No escribas nunca tu contraseña principal. **Probar la conexión** explica qué falla si no funciona.

## Abrir y guardar
- **Abrir desde Nextcloud…** (pantalla principal y menú Archivo) abre un archivo como documento nuevo **vinculado** a él.
- **Guardar en Nextcloud** (\`Ctrl+S\`) actualiza el archivo vinculado. **Guardar en Nextcloud como…** elige carpeta, nombre y formato.
- Si mientras tanto el archivo cambió en Nextcloud, eliges entre sobrescribirlo, guardar una copia o cancelar.
- Guardado automático opcional cada pocos minutos.

## Conviene saber
- Solo la persona que vinculó un documento lo guarda en Nextcloud; la colaboración sigue yendo directamente entre navegadores.
- Sin conexión, las acciones de Nextcloud están desactivadas.
- Si no puedes conectar porque el servidor bloquea este sitio, el departamento de informática debe permitirlo (CORS). El cuadro de la cuenta muestra lo que necesitan.`,
  },
  handin: {
    title: 'Entregar trabajos',
    keywords: 'entregar entrega deberes tarea profesor alumno zip pdf subir enlace de subida enviar',
    body: `**Para el alumnado.** Haz clic en **Entregar** (junto a Compartir). Ofimeo descarga un archivo ZIP con tu nombre y el título, con el documento en sus formatos originales (por ejemplo .odt y .docx, o .pptx e imágenes de las diapositivas).

- Si aún no has escrito tu nombre, se te pide: va en el nombre del archivo.
- Sube o envía el ZIP a tu profesor o profesora como te haya indicado (aula virtual, correo…).
- **Imprimir / Guardar como PDF** crea un PDF si también hace falta: elige «Guardar como PDF» como impresora.
- **Subir a un enlace compartido de Nextcloud…**: si tu profesor te dio un enlace de subida, el archivo va directamente allí. No necesitas cuenta de Nextcloud.
- **Entregar en Moodle…**: si tu centro usa Moodle, entrega directamente en una tarea. Consulta [Moodle](help:moodle).

**Para el profesorado.**
- Da a cada alumno su propia ficha con un enlace **Hace una copia** (ver [Compartir](help:sharing)).
- Crea un enlace de subida («Solo subida») en tu Nextcloud y dáselo a la clase.
- Abre los PDF del alumnado, o los ZIP de entrega, en [Ofimeo PDF](help:pdf) para corregirlos.
- Para cuestionarios, usa [Ofimeo Formularios](help:forms).`,
  },
  moodle: {
    title: 'Moodle',
    keywords: 'moodle aula virtual campus tarea deberes fecha de entrega plazo nota calificación comentarios entregar curso',
    body: `Conecta Ofimeo con el Moodle de tu centro para ver tus tareas en la pantalla principal y entregar tu trabajo sin descargar y subir archivos.

## Conectar
Abre [Moodle](action:moodle) (botón Moodle de la pantalla principal, o Archivo ▸ Cuenta de Moodle…). Escribe la dirección de Moodle (puede que tu centro ya la haya puesto), tu usuario y tu contraseña, y elige **Conectar**.
- Tu contraseña va solo a Moodle, una vez. Ofimeo guarda en este navegador solo una clave de Moodle y tu nombre. **Desconectar** los borra.
- Si en tu centro se entra en Moodle a través de una página web (Google, Microsoft o un acceso del centro, «inicio de sesión único»), este tipo de acceso todavía no funciona en Ofimeo. Ofimeo te avisa cuando lo detecta. Entrega con el [Entregar](help:handin) habitual y sube el archivo en Moodle.

## Tareas de Moodle
El panel **Tareas de Moodle** de la pantalla principal muestra las tareas de tus cursos. Primero las pendientes, ordenadas por fecha de entrega. Después las entregadas y calificadas.
- Abre una tarea para leer su descripción, descargar sus archivos (**Abrir en Ofimeo** crea tu propia copia) y ver la fecha de entrega, el último día para entregar, tu estado, tu nota y los comentarios del profesor cuando se publiquen.
- **Actualizar** renueva la lista. Sin conexión ves la última lista, con la hora en que se actualizó.
- La lista solo informa. Trabaja en la tarea en el propio Moodle cuando no se entrega como archivo.

## Entregar en Moodle
En cualquier aplicación, elige **Entregar** (o Archivo ▸ Entregar en Moodle…):
1. Elige la tarea. Solo aparecen las tareas abiertas que admiten archivos.
2. Elige el formato. Ofimeo propone uno que la tarea acepta. Se ofrece PDF en las aplicaciones que lo exportan; si no, usa **Un archivo de este dispositivo…**.
3. Si la tarea tiene una declaración de entrega, léela y márcala.
4. Elige **Entregar**. Ofimeo sube el archivo y lo guarda como tu entrega. Si la tarea tiene botón de enviar, además la envía para calificar.

Si vuelves a entregar mientras la tarea está abierta, se sustituye tu archivo. Si Moodle rechaza el archivo (demasiado grande, tipo no admitido, demasiados archivos), el mensaje dice por qué.

## Privacidad
Tu trabajo de Moodle va solo al Moodle de tu centro, directamente desde este navegador o a través del relé propio de tu centro. Nunca se envía a las personas con las que compartes documentos.`,
  },
  network: {
    title: 'Redes de centros: prueba de conexión y relé',
    keywords: 'red wifi cortafuegos filtro bloqueado solo tú no conecta relé relay turn stun nostr departamento de informática proxy',
    body: `Los colaboradores se conectan directamente entre sí. Los relés públicos solo sirven para encontrarse. Algunas redes de centros lo bloquean: entonces el estado se queda en **Solo tú**.

## Prueba de conexión
Abre [Ayuda ▸ Prueba de conexión…](action:connection) o haz clic en el estado de conexión junto a Compartir. Comprueba la conexión a Internet, los relés, si son posibles las conexiones directas y cómo está conectada cada persona del documento. Termina con un diagnóstico en lenguaje claro. **Copiar informe** copia los detalles para el departamento de informática.

## Causas habituales
- Un filtro de contenidos bloquea los relés públicos.
- Un cortafuegos estricto bloquea las conexiones directas.
- La wifi aísla los dispositivos entre sí.

## Ofimeo Relay
Para estas redes, un centro puede ejecutar **Ofimeo Relay**, un pequeño programa para su propia red (Windows, macOS, Linux o Raspberry Pi). Ayuda a que los dispositivos se encuentren y se conecten.
- Pega su dirección en la prueba de conexión, o abre un enlace con **?relay=** y su dirección. El navegador la recuerda.
- Los enlaces para compartir incluyen el relé, así que el alumnado lo recibe al abrir el enlace.
- Puedes elegir usar solo el relé del centro.

## Sincronizar sin estar conectados a la vez
Normalmente los cambios solo viajan mientras dos personas tienen el documento abierto a la vez. Con **sincronizar sin estar conectados a la vez**, una copia cifrada de los cambios espera a los demás: un alumno edita en clase y sigue en casa, y el docente corrige por la noche.
- Actívalo en la prueba de conexión, en **Sincronizar sin estar conectados a la vez**: en el relé del centro (si guarda copias) o en una carpeta de Nextcloud. Tu centro puede activarlo para todos.
- El estado junto al de guardado muestra **Sincronizado en …** cuando tus cambios están guardados, o **Esperando para sincronizar** si no tienes conexión (se envían después).
- Todo se cifra en tu navegador con la clave del enlace del documento. El relé o Nextcloud solo ven datos cifrados, su tamaño y cuándo cambian.
- Los enlaces de solo lectura descargan los cambios pero nunca pueden subir ninguno. En Nextcloud, usa una carpeta compartida con las demás personas.
- Las copias del relé del centro se borran tras un tiempo sin cambios (180 días de forma predeterminada).

El departamento de informática encuentra la guía de instalación en la documentación del proyecto (docs/relay.md).`,
  },
  'school-setup': {
    title: 'Para administradores: instalar Ofimeo en un centro',
    keywords: 'administrador departamento informática instalar desplegar servidor docker raspberry windows configuración ofimeo.config.json bloqueado lo establece tu centro logotipo idioma webmcp plantillas ocultar aplicaciones',
    body: `Un centro puede tener su propia copia de Ofimeo en su red y configurarla para todos con un solo archivo, **ofimeo.config.json**.

## Formas de instalarlo
- **Docker**: un contenedor con la aplicación y Ofimeo Relay (el Dockerfile y docker-compose.yml están en el proyecto).
- **Solo Ofimeo Relay** en un servidor Windows, un equipo Linux o una Raspberry Pi: también puede servir la aplicación.
- **Cualquier servidor web** (nginx, Apache, IIS): copia los archivos compilados. La aplicación no tiene parte de servidor.

## La configuración del centro
[Ayuda ▸ Para administradores…](action:admin) abre un formulario que crea ofimeo.config.json. Establece:
- el nombre y el logotipo del centro, que se muestran en la pantalla de inicio;
- el idioma de la interfaz por defecto y el idioma de los documentos nuevos;
- el relé del centro, otros relés y si se pueden usar servidores públicos;
- dónde pueden esperar los cambios cifrados para quien no está conectado;
- los servidores Nextcloud que se ofrecen al conectarse;
- si se permiten asistentes de IA (WebMCP) y qué aplicaciones y plantillas se ofrecen;
- los contactos de privacidad del centro, que se muestran encima de los enlaces legales.

Pon el archivo junto a index.html (o dáselo a Ofimeo Relay con **--school-config**). Cada navegador lo aplica al abrir Ofimeo y guarda una copia para trabajar sin conexión.

## Ajustes bloqueados
Los ajustes que el centro bloquea muestran **Lo establece tu centro** y no se pueden cambiar en el navegador: el idioma de la interfaz, el interruptor de asistentes de IA, el relé del centro y los servidores Nextcloud.

La guía paso a paso para el departamento de informática está en la documentación del proyecto (docs/deploy-school.md).`,
  },
  privacy: {
    title: 'Privacidad',
    keywords: 'privacidad protección de datos rgpd datos personales alumnado menores cookies rastreo seguro cifrado',
    body: `Ofimeo está diseñado para que nadie, salvo tú y las personas con quienes compartes, reciba tus documentos.

- **Sin cuentas, sin cookies, sin analítica, sin publicidad.** El sitio solo entrega el programa, que después funciona en tu navegador.
- **Tus documentos se quedan en tu dispositivo** (en el navegador). Las preferencias, tu nombre y las credenciales de Nextcloud también se guardan solo aquí.
- **Al compartir**, los colaboradores reciben el documento, sus comentarios y versiones, el nombre que escribiste y, como la conexión es directa, tu dirección IP. Los datos viajan cifrados directamente entre navegadores. Los relés públicos solo ven mensajes de conexión cifrados.
- **Los enlaces son llaves**: quien tiene un enlace obtiene su acceso. No publiques enlaces de edición.
- **Nextcloud**: tu contraseña solo se envía a tu servidor Nextcloud.
- **El dictado** usa el reconocimiento de voz del navegador, que puede enviar el audio al servicio del fabricante del navegador.

## Consejos para clase
- Usa el nombre de pila, las iniciales o un apodo.
- No pongas datos personales sensibles (salud, asuntos familiares) en documentos compartidos.

Lee la [política de privacidad](legal:privacy) completa y la [información para centros educativos](legal:schools).`,
  },
  shortcuts: {
    title: 'Atajos de teclado',
    keywords: 'teclado atajos teclas combinaciones ctrl comando mac f1 f10',
    body: `Estas teclas funcionan en todas las aplicaciones (en Mac, usa ⌘ en lugar de Ctrl):

- \`Ctrl+O\` abrir un archivo, \`Ctrl+P\` imprimir, \`Ctrl+S\` guardar en Nextcloud (tu trabajo siempre se guarda en el navegador de todas formas)
- \`Ctrl+Z\` deshacer, \`Ctrl+Y\` rehacer
- \`Ctrl+X\` cortar, \`Ctrl+C\` copiar, \`Ctrl+V\` pegar, \`Ctrl+A\` seleccionar todo
- \`Ctrl+F\` buscar
- \`F10\` o \`Alt+Mayús+M\` ir a la barra de menús; después usa las flechas, \`Intro\` y \`Esc\`
- \`Ctrl+/\` o \`F1\` ver todos los atajos de la aplicación que estás usando
- \`Alt+Mayús+A\` panel de accesibilidad, \`Alt+Mayús+R\` leer en voz alta, \`Alt+Mayús+D\` dictado

En Ofimeo Documentos y Ofimeo Hojas de cálculo, \`Ctrl+H\` abre buscar y reemplazar.

Los menús muestran el atajo de cada orden a su lado.

[Ver los atajos de esta aplicación](action:shortcuts)`,
  },
  accessibility: {
    title: 'Accesibilidad',
    keywords: 'accesibilidad dislexia fuente letra grande texto zoom contraste tema oscuro lector de pantalla leer en voz alta dictado voz teclado movimiento',
    body: `Abre el [panel de accesibilidad](action:accessibility) con el botón de accesibilidad o \`Alt+Mayús+A\`. Los ajustes se guardan en este navegador y se aplican a toda la suite; tus documentos no cambian.

- **Fuentes de lectura**: OpenDyslexic o Atkinson Hyperlegible para la interfaz y, si quieres, para el texto de los documentos.
- **Tamaño del texto** de la interfaz, e **interlineado y espaciado entre letras** para leer.
- **Temas**: claro, oscuro, según el sistema y dos temas de alto contraste.
- **Reducir movimiento**, **puntero del ratón grande**, **contorno de foco grueso**.
- **Regla de lectura** o **máscara de enfoque** que siguen al puntero y al cursor de texto.
- **Leer en voz alta** (\`Alt+Mayús+R\`): lee la selección, el párrafo o todo el documento con las voces del navegador.
- **Dictado** (\`Alt+Mayús+D\`): escribe lo que dices. Necesita conexión y un navegador compatible (Chrome, Edge).
- **Teclado**: todo se puede usar con el teclado. \`F10\` lleva a la barra de menús y al pulsar \`Tab\` aparece un enlace «Saltar al contenido». Consulta [Atajos de teclado](help:shortcuts).

El idioma de la interfaz se cambia en la pantalla principal o en el panel.`,
  },
  spelling: {
    title: 'Ortografía y gramática',
    keywords: 'ortografía corrector gramática diccionario idioma errata falta subrayado f7 revisar',
    body: `Todas las aplicaciones revisan la ortografía (subrayado ondulado rojo) y la gramática (azul) mientras escribes, en el idioma del documento. La revisión se hace en tu navegador: el texto no se envía a ningún sitio, salvo que elijas un servidor LanguageTool en el procesador de textos.

## Dónde
- **Documentos**: todo el documento. Haz clic derecho en una palabra subrayada para ver sugerencias.
- **Hojas de cálculo**: la celda que editas. Las fórmulas y los números no se revisan.
- **Presentaciones y Diagramas**: etiquetas y cuadros de texto mientras escribes, y notas del orador.
- **Formularios**: títulos, descripciones y opciones. Las respuestas escritas se revisan si el formulario lo permite (**Configuración ▸ Permitir el corrector ortográfico a quienes responden**: activado en encuestas, desactivado en cuestionarios, donde podría revelar respuestas).
- **PDF**: cuadros de texto, comentarios y respuestas.
- **Dibujo**: el texto que escribes.

## Diálogo de ortografía y gramática
**Herramientas ▸ Ortografía y gramática…** (\`F7\`) recorre los errores uno a uno: todas las celdas de todas las hojas, todas las diapositivas y sus notas, todas las páginas de un diagrama, todas las preguntas de un formulario, todos los cuadros de texto y comentarios de un PDF y todos los textos de un dibujo. Muestra dónde está cada uno (por ejemplo «Hoja1 · B3») y lo selecciona. **Cambiar** o **Cambiar todo** lo corrige, **Omitir** lo salta y **Añadir al diccionario** acepta la palabra desde entonces.

## Idioma y diccionario
- **Herramientas ▸ Idioma** fija el idioma del documento (inglés de EE. UU. o del Reino Unido, español de varios países, gallego, francés, alemán). Se guarda con el documento, así que todos lo revisan en el mismo idioma.
- **Herramientas ▸ Diccionario personal…** muestra las palabras que añadiste. Se comparten en todas las aplicaciones y documentos de este navegador.
- **Herramientas ▸ Revisar la ortografía al escribir** / **Revisar la gramática al escribir** quitan los subrayados en todas las aplicaciones.`,
  },
  writer: {
    title: 'Ofimeo Documentos (textos)',
    keywords: 'procesador de textos documento word docx odt página índice cita bibliografía comentario sugerencias control de cambios revisar corregir',
    body: `Un procesador de textos con páginas reales, como los que ya conoces.

## Escribir
- Usa los menús (Archivo, Editar, Ver, Insertar, Formato, Tabla, Referencias, Herramientas, Revisar) y la barra de herramientas. Con el botón derecho tienes más opciones.
- Los estilos de párrafo (Título, Encabezados…) dan estructura y alimentan la **tabla de contenido** (Insertar o Referencias ▸ Tabla de contenido).
- **Referencias** tiene citas y bibliografía en estilo APA, MLA o Chicago.
- El tamaño de página, los márgenes y la orientación están en Archivo ▸ Configurar página…

## Revisar (el profesorado corrigiendo trabajos)
- **Comentarios**: selecciona texto y pulsa \`Ctrl+Alt+M\` (o Revisar ▸ Comentario). Las personas con enlace de comentario también pueden comentar.
- **Sugerencias**: cambia el modo de **Edición** a **Sugerencias**. Tus cambios quedan marcados y el autor los acepta o rechaza.
- Revisar ▸ Mostrar autoría colorea el texto según quién lo escribió.

## Gráficos
**Insertar ▸ Gráfico…** añade un gráfico de columnas, barras, líneas, áreas, circular, de anillo o de dispersión. Toma los datos de una hoja de cálculo de tu biblioteca (elige la hoja y el rango) o escríbelos en la pequeña tabla. Un gráfico **vinculado** a una hoja de cálculo se actualiza solo cuando esa hoja cambia en este navegador; **Actualizar desde el origen** (en el gráfico o en su menú contextual) lo hace al momento. El documento guarda una copia de los datos, así que todos ven el gráfico aunque no tengan la hoja. Arrastra la esquina para cambiar su tamaño; haz doble clic para modificarlo o añadir un pie de figura. Los archivos de Word lo conservan como gráfico real.

## Combinar correspondencia
**Herramientas ▸ Combinar correspondencia…** crea una carta, diploma o boletín por cada fila de una tabla:
1. Elige los datos: una hoja de cálculo de tu biblioteca o un archivo CSV, Excel u OpenDocument, la hoja y la fila con los nombres de los campos.
2. Haz clic en un campo para insertarlo donde está el cursor, por ejemplo «Nombre». **Texto condicional…** añade texto solo cuando un campo tiene un valor (por ejemplo "si Nota es Aprobado").
3. Si quieres, deja solo algunas filas con el filtro.
4. Marca **Mostrar los datos de un registro** y usa las flechas para revisar cada uno.
5. Crea un **Documento nuevo** con todos (uno por página), un **PDF** o un **ZIP** de archivos Word o PDF con el nombre de un campo.

Los archivos de Word conservan los campos (MERGEFIELD), así que la plantilla también funciona en Word.

## Archivos
Abre y descarga Word (.docx) y OpenDocument (.odt); también abre Word 97-2003 (.doc), RTF, .html, .txt y Markdown (.md, con títulos, listas, enlaces, código y tablas), y descarga Markdown. Si un archivo tiene algo que Ofimeo no puede traer (por ejemplo cuadros de texto o notas al final de un .doc), un mensaje lo indica una vez. Imprime o guarda como PDF con Archivo ▸ Imprimir. Ver ▸ Zoom (o \`Ctrl++\`, \`Ctrl+-\`, \`Ctrl+0\`) cambia el zoom.`,
  },
  sheet: {
    title: 'Ofimeo Hojas de cálculo',
    keywords: 'hoja de cálculo excel xlsx ods csv fórmula función gráfico tabla dinámica celdas cuaderno de notas',
    body: `Hojas de cálculo con fórmulas, gráficos y varias hojas.

- Escribe \`=\` para empezar una fórmula, por ejemplo =SUM(B2:B30) o =AVERAGE(C2:C30). Hay cientos de funciones.
- **Insertar ▸ Gráfico…** crea un gráfico de columnas, barras, líneas, circular o de dispersión a partir de las celdas seleccionadas. Los gráficos se actualizan cuando cambian los valores.
- **Datos** tiene ordenar, filtros, validación y **Tabla dinámica…**.
- **Formato** tiene formatos de número, combinar celdas y formato condicional; los bordes están en la barra de herramientas.
- La barra de estado muestra la suma, el promedio y el recuento de las celdas seleccionadas.
- Varias personas pueden editar a la vez; ves sus selecciones en sus colores.

## Lectores de pantalla y teclado
La cuadrícula se dibuja como una imagen, así que **Ver ▸ Vista de tabla accesible** (\`Alt+Mayús+T\`, o el enlace «Cambiar a la vista de tabla accesible» al principio de la página) muestra la hoja actual como una tabla real que los lectores de pantalla pueden leer. Las flechas mueven entre celdas y cada celda se lee con su dirección, su valor y su fórmula; \`Intro\` o \`F2\` la edita, \`Supr\` la borra, \`Ctrl+Z\` deshace, \`Ctrl+Inicio\` / \`Ctrl+Fin\` van al principio y al final de los datos y \`Ctrl+Re Pág\` / \`Ctrl+Av Pág\` cambian de hoja. Los cambios llegan a los demás al momento. Los gráficos aparecen bajo la tabla con un resumen de sus valores y **Datos del gráfico como tabla** (también en el menú del botón derecho del gráfico y en Editar cuando hay un gráfico seleccionado). En la cuadrícula normal se lee la celda seleccionada al moverse, y las flechas pasan de una pestaña de hoja a otra.

## Archivos
Abre y descarga Excel (.xlsx), OpenDocument (.ods) y CSV. Los gráficos se guardan como gráficos reales que Excel y LibreOffice pueden editar. Imprime o guarda la hoja actual como PDF con Archivo ▸ Imprimir.

Las plantillas de cuaderno de notas, asistencia y rúbrica de la pantalla principal están listas para usar.`,
  },
  draw: {
    title: 'Ofimeo Dibujo (pizarra)',
    keywords: 'dibujo pizarra boceto dibujar a mano alzada excalidraw lluvia de ideas tablero formas flechas',
    body: `Una pizarra para dibujar a mano alzada o con formas, flechas y texto, solo o con la clase.

- Elige una herramienta en la barra del lienzo y arrastra para dibujar. Las flechas se quedan unidas a las formas que conectan.
- El panel junto a la selección cambia colores, líneas, relleno y fuente.
- Mantén pulsado \`Espacio\` y arrastra para moverte; \`Ctrl\` y la rueda del ratón hacen zoom.
- Todos los que están en el dibujo ven los punteros y los cambios de los demás en directo.
- Puedes pegar o soltar imágenes en el lienzo.

## Archivos
Archivo ▸ Descargar como guarda imágenes PNG o SVG, o un archivo .excalidraw para volver a abrirlo más tarde. Archivo ▸ Exportar imagen… ofrece más opciones (fondo, modo oscuro, escala).`,
  },
  diagram: {
    title: 'Ofimeo Diagramas',
    keywords: 'diagrama diagrama de flujo mapa conceptual mapa mental uml red drawio visio formas conectores organizador línea de tiempo',
    body: `Diagramas, diagramas de flujo y mapas conceptuales, compatibles con draw.io.

- Arrastra formas desde el **panel de formas** al lienzo, o haz clic en una para insertarla. El buscador encuentra formas por su nombre.
- Arrastra desde un punto de conexión de una forma hasta otra forma para unirlas.
- Haz doble clic en una forma para escribir su texto.
- El **panel de formato** cambia relleno, línea, texto, flechas, posición y tamaño.
- **Organizar** tiene alineación, agrupación y diseños automáticos (árbol, círculo…).
- **Ver ▸ Más formas…** añade bibliotecas como UML, redes, planos de planta, electricidad o BPMN.
- Un diagrama puede tener varias páginas (pestañas en la parte inferior).

## Archivos
Abre y descarga archivos de draw.io (.drawio); abre dibujos de Visio (.vsdx). Descarga imágenes PNG o SVG, o imprime y guarda como PDF.

La pantalla principal tiene plantillas de mapas conceptuales, líneas de tiempo, diagramas de flujo y organizadores gráficos.`,
  },
  slides: {
    title: 'Ofimeo Presentaciones',
    keywords: 'presentación diapositivas powerpoint pptx odp presentar proyector moderador notas animación tema diseño seguir',
    body: `Presentaciones para el aula.

- El **panel de diapositivas** de la izquierda muestra las diapositivas. Haz clic con el botón derecho en una miniatura para añadir, duplicar, mover o eliminar una diapositiva y para cambiar su disposición o su fondo.
- Elige un **tema** y una **disposición** para cada diapositiva. Haz clic en los marcadores para añadir un título y texto.
- Inserta imágenes, formas, tablas y ecuaciones. Escribe las **notas del orador** debajo de la diapositiva.
- **Insertar ▸ Gráfico…** añade un gráfico de una hoja de cálculo de tu biblioteca (se actualiza cuando cambia) o con datos que escribes. Los archivos de PowerPoint lo conservan como gráfico real.
- Las **animaciones** y **transiciones** hacen aparecer objetos y diapositivas por turnos.
- **Presentar** muestra las diapositivas a pantalla completa: flechas o un clic para avanzar, \`L\` para un puntero láser, \`B\` para una pantalla negra, \`Esc\` para terminar. La **vista del presentador** muestra las notas y un cronómetro en una segunda ventana.
- Mientras presentas, el resto de personas en la presentación pueden **seguirte** (Seguir al presentador), también con un enlace de lectura.

## Archivos
Abre PowerPoint (.pptx). Descarga PowerPoint (.pptx), OpenDocument (.odp), PDF e imágenes de las diapositivas.`,
  },
  forms: {
    title: 'Ofimeo Formularios (formularios y cuestionarios)',
    keywords: 'formulario cuestionario examen prueba encuesta preguntas respuestas calificar nota puntuación autoevaluación',
    body: `Formularios, encuestas y cuestionarios que se corrigen solos.

## Para el profesorado
- **Pregunta** añade una pregunta; elige su tipo: respuesta corta, párrafo, opción múltiple, casillas, desplegable, escala, cuadrícula, fecha, hora o número. **Sección** crea una página nueva.
- Activa **Cuestionario** para fijar las respuestas correctas, los puntos y los comentarios. La corrección es automática; los párrafos se corrigen a mano.
- **Enviar** da el enlace y un código QR para tu alumnado. Solo ven el formulario, no las respuestas de los demás.
- Las respuestas llegan cuando tu navegador (o el de otro editor) está conectado. Míralas en **Respuestas**, con gráficos y estadísticas, y expórtalas a una hoja de cálculo.

## Para el alumnado
- Escribe tu nombre, responde a las preguntas y pulsa **Enviar**.
- Si no tienes conexión, la respuesta se envía cuando vuelva.
- Si no hay ningún profesor conectado, usa **Descargar mi respuesta** y entrega el archivo a tu profesor.

Las respuestas se cifran en el navegador del alumno: solo los editores del formulario pueden leerlas.`,
  },
  pdf: {
    title: 'Ofimeo PDF (corregir PDF)',
    keywords: 'pdf corregir calificar anotar resaltar lápiz sello firma nota acrobat entrega zip',
    body: `Corrige y anota archivos PDF, por ejemplo los trabajos que te entregó tu alumnado.

- Abre un PDF desde la pantalla principal, desde Archivo ▸ Abrir…, o abre un ZIP de entrega: se listan los PDF que contiene.
- Herramientas: resaltar, subrayar y tachar (selecciona texto), bolígrafo y borrador, cuadros de texto, formas, **sellos** (visto, cruz, «Bien», una nota…), **notas adhesivas** y tu **firma**.
- Teclas: \`H\` resaltar, \`P\` bolígrafo, \`T\` cuadro de texto, \`N\` nota, \`S\` sello, \`G\` firma, \`Esc\` volver a Seleccionar.
- Teclado: elige una herramienta (por ejemplo \`T\`, \`N\`, \`R\` o \`S\`) y pulsa \`Intro\` para colocarla en el centro de la página que estás viendo. En el panel Comentarios, **Añadir comentario** hace lo mismo con las notas adhesivas.
- Comparte el PDF para corregirlo en equipo o para que el alumno lea tus anotaciones.

## Páginas
El menú **Página** (o el clic derecho en una miniatura) gira una página a la izquierda o a la derecha (\`Ctrl+[\` / \`Ctrl+]\`), la sube o la baja, añade páginas en blanco y elimina páginas. Arrastra las miniaturas para reordenarlas (o \`Alt+↑\` / \`Alt+↓\` en una miniatura). Las anotaciones siguen a su página y Deshacer revierte cada cambio. El PDF descargado respeta el nuevo orden y el giro.

## Archivos
Archivo ▸ Descargar como guarda el **PDF con anotaciones**: «editable» las mantiene como anotaciones que otros lectores de PDF pueden cambiar, «acoplado» las dibuja en las páginas. La entrega incluye ambos. Los cuadros de texto y los sellos conservan símbolos como π, √, ≈, → y ✓.

Un **PDF protegido con contraseña** la pide al abrirlo. El documento guarda el archivo protegido original; la contraseña no se guarda en él ni se envía a nadie, así que cada persona que lo abre (y tú, en una pestaña nueva) la vuelve a escribir. Si cancelas, no se añade nada.`,
  },
  notebook: {
    title: 'Ofimeo Cuaderno (apuntes de clase)',
    keywords: 'cuaderno onenote apuntes notas clase sección página subpágina etiqueta tarea pendiente tinta lápiz lápiz óptico resaltador dibujo laboratorio diario lectura',
    body: `Apuntes de clase organizados como un archivador: las **secciones** (pestañas de colores) contienen **páginas**, y las páginas pueden tener **subpáginas**.

## Secciones y páginas
- **Añadir sección** y **Añadir página** están en el panel de la izquierda. Arrastra páginas y secciones para ordenarlas, o suelta una página sobre la pestaña de otra sección para moverla allí. Con el teclado: \`Alt+↑\` / \`Alt+↓\`.
- El botón **⋯** de una página (o el clic derecho) la convierte en subpágina, la mueve a otra sección, la exporta, la imprime o la elimina.
- **Buscar en el cuaderno** (\`Ctrl+F\`) busca en los títulos y el texto de todas las páginas.
- En el móvil, el botón **Secciones y páginas** de la parte superior las abre como un panel.

## Escribir
- Cada página tiene un título, la fecha en que se creó y texto libre con títulos, listas, listas de comprobación, tablas, imágenes, enlaces, ecuaciones y código.
- Pega o suelta imágenes y archivos en la página: se guardan en el cuaderno (las imágenes grandes se reducen; los demás archivos, hasta 5 MB).
- Las **etiquetas** marcan un párrafo como **Tarea**, **Importante**, **Pregunta** o **Recordar** (barra de herramientas ▸ Etiqueta, o \`Ctrl+Mayús+1\` a \`4\`). Haz clic en la casilla de una tarea para marcarla. **Resumen de etiquetas** reúne los párrafos etiquetados de todas las páginas.

## Dibujar
Elige **Bolígrafo**, **Resaltador** o **Borrador** en la barra de herramientas (\`Alt+2\`, \`Alt+3\`, \`Alt+4\`; \`Alt+1\` o \`Esc\` vuelven a escribir). Con un lápiz óptico el trazo es más grueso cuanto más aprietas. Con **Dibujar ▸ Dibujar con el lápiz óptico** el lápiz óptico siempre dibuja, mientras el dedo o el ratón seleccionan texto. El borrador quita trazos enteros; Deshacer los recupera.

## En equipo
Comparte el cuaderno para escribir a la vez y ver quién está en cada página. Comenta con \`Ctrl+Alt+M\`, entrégalo y encuentra versiones anteriores en Archivo ▸ Historial de versiones.

## Archivos
- Archivo ▸ Descargar como: todo el cuaderno en Word, OpenDocument, PDF, Markdown o un **ZIP de Markdown** (una carpeta por sección, con imágenes y tinta). **Página actual** y **Sección actual** exportan solo eso.
- Imprimir (\`Ctrl+P\`) imprime la página abierta; **Imprimir sección…** imprime todas las páginas de la sección.
- Archivo ▸ Abrir… importa archivos Markdown o un ZIP de Markdown. Un ZIP exportado desde Ofimeo recupera secciones, colores, subpáginas y tinta. **Importar una carpeta de archivos Markdown…** toma una carpeta entera. Los archivos de OneNote (.one) no se pueden importar: expórtalos antes desde OneNote a Word o PDF.`,
  },
}

export default articles
