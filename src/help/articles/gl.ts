// Artigos do centro de axuda en galego (tradución de en.ts).
import type { Articles } from './types'

const articles: Articles = {
  'getting-started': {
    title: 'Primeiros pasos',
    keywords: 'comezar inicio empezar benvida pantalla principal novo documento abrir modelo conta',
    body: `Ofimeo é unha suite ofimática que funciona enteira no teu navegador: documentos, follas de cálculo, debuxos, diagramas, presentacións, formularios e corrección de PDF. Non precisas conta e non se instala nada en ningún servidor.

## A pantalla principal
- **Comeza algo novo**: fai clic nunha tarxeta para crear un documento dese tipo.
- **Modelos**: fichas, rúbricas, cadernos de notas, horarios, mapas conceptuais e máis. Fai clic nun para obter a túa propia copia.
- **Abrir ficheiro…**: abre ficheiros de Word, OpenDocument, Excel, CSV, PowerPoint, draw.io, Excalidraw e PDF do teu ordenador.
- **Os teus documentos**: todo o que creaches ou abriches neste navegador, con busca, cartafoles, etiquetas e papeleira (os documentos eliminados gárdanse 30 días).

## O teu nome
Escribe o teu nome na caixa de arriba á dereita (nun móbil ou nunha xanela estreita, toca o botón da persoa de arriba á dereita). Os colaboradores véno xunto ao teu cursor e nos comentarios, e úsase no nome do ficheiro cando entregas un traballo. Abonda co nome ou coas iniciais.

## Importante
- Os documentos gárdanse **só neste navegador**. Le [Traballar sen conexión e onde se gardan os teus datos](help:offline) e fai [copias de seguranza](help:backup).
- Para traballar con outras persoas, envía unha [ligazón para compartir](help:sharing).
- O alumnado entrega os traballos co botón [Entregar](help:handin).

[Ver de novo a visita guiada](action:tour)

## Importar desde Google Drive ou Microsoft 365
**Importar desde unha ligazón…** (pantalla de inicio e menú Ficheiro de cada aplicación) abre ficheiros compartidos desde Documentos, Follas de cálculo, Presentacións e Drive de Google, OneDrive ou SharePoint:
1. Pega a ligazón para compartir. O ficheiro debe estar compartido con **Calquera persoa coa ligazón**, ou tes que poder abrilo coa túa propia conta.
2. Preme o botón de descarga: o teu navegador descarga o ficheiro como Word, Excel ou PowerPoint.
3. Solta o ficheiro descargado na caixa de diálogo (ou escólleo). Ábrese como un documento novo de Ofimeo.

Os navegadores non permiten que as aplicacións web descarguen estes ficheiros directamente, así que o ficheiro pasa polo teu cartafol de Descargas; Ofimeo nunca ve a túa conta de Google ou Microsoft. Se o relé do teu centro o ofrece, **Importar directamente a través do relé do centro** faino nun clic cos ficheiros públicos.`,
  },
  sharing: {
    title: 'Compartir e permisos',
    keywords: 'compartir ligazón enlace convidar colaborar xuntos permiso editar comentar ver só lectura copia ficha código qr alumnos',
    body: `Fai clic en **Compartir** (arriba á dereita en todas as aplicacións) para obter unha ligazón. Quen abre a ligazón entra no documento e os cambios aparecen para todos en tempo real.

## Tipos de ligazón
- **Pode editar**: poden modificar o documento contigo.
- **Pode comentar**: poden ler e engadir comentarios, pero non cambiar o texto.
- **Pode ver**: poden ler o documento e seguir os cambios en directo.
- **Fai unha copia**: cada persoa que a abre obtén a súa propia copia privada. Úsaa para dar unha ficha a cada alumno.

A caixa de diálogo tamén amosa un **código QR**, práctico para tabletas e móbiles na aula.

## Convén saber
- Unha ligazón é como unha chave: quen a ten obtén o seu acceso. Compártea só con quen a precise.
- As ligazóns de lectura e de comentario non se poden converter en ligazóns de edición: os cambios só se aceptan se están asinados coa chave de edición.
- Non hai unha copia central nun servidor. Para recibir os últimos cambios, alguén que teña o documento debe estar conectado ao mesmo tempo. Os cambios feitos sen conexión combínanse sós a próxima vez que coincidades.
- O estado xunto a Compartir di **Só ti** ou cantas persoas hai. Se nunca aparece ninguén, fai a [proba de conexión](help:network).
- Os documentos creados antes de que existisen as ligazóns con permisos só se poden compartir con ligazóns de edición. Usa Arquivo ▸ Facer unha copia para ter todos os tipos de ligazón.

## Chat
- O botón do globo xunto ás persoas do documento (ou \`Alt+Shift+C\`) abre o chat. Un número indica as mensaxes sen ler; vólvese vermello cando alguén te menciona.
- Escribe \`@\` para mencionar a alguén que está aquí. As ligazóns ábrense noutra lapela; o botón da cara sorrinte engade emojis. \`Intro\` envía, \`Maiús+Intro\` comeza unha liña nova e \`Escape\` pecha o chat.
- Quen ten unha ligazón para editar ou comentar pode escribir; quen ten unha ligazón só de lectura só pode ler.
- Docentes (ligazón para editar): o botón ⋯ do chat desactívao neste documento ou borra o seu historial para todos.
- As mensaxes gárdanse co documento neste navegador e nas copias de seguranza, pero non nas versións, nas copias nin nos ficheiros descargados.`,
  },
  offline: {
    title: 'Traballar sen conexión e onde se gardan os teus datos',
    keywords: 'sen conexión internet instalar aplicación pwa almacenamento indexeddb datos do navegador borrar perdidos dispositivo ordenador',
    body: `Os teus documentos gárdanse **neste navegador, neste dispositivo** (no seu almacenamento IndexedDB). Non se soben a ningún servidor (salvo que actives [sincronizar sen estar conectados á vez](help:network), que garda unha copia cifrada). O estado de gardado da barra de estado indica **Gardado neste navegador**.

## Que significa
- Borrar os datos do navegador (historial, cookies e datos de sitios) **elimina os teus documentos**. Fai [copias de seguranza](help:backup) ou gárdaos en [Nextcloud](help:nextcloud).
- Outro navegador ou outro ordenador non ven os teus documentos. Para continuar noutro dispositivo, abre alí a túa ligazón de edición mentres este dispositivo está conectado, ou restaura unha copia de seguranza.
- Ofimeo pídelle ao navegador que protexa o seu almacenamento para que non borre os documentos cando falte espazo. [Almacenamento e copias de seguranza](action:storage) amosa se está protexido e canto espazo se usa.

## Traballar sen conexión
- Despois da primeira visita, toda a suite funciona sen conexión. A pantalla principal amosa **✓ Dispoñible sen conexión** cando está lista.
- Podes instalar Ofimeo como aplicación (menú do navegador ou barra de enderezos ▸ Instalar). Instalada, abre ficheiros de Word, Excel, PowerPoint e outros desde o teu ordenador.
- Crear, editar, abrir e descargar ficheiros non precisa conexión. Os cambios feitos sen conexión envíanse aos colaboradores cando volves estar conectado.
- Nextcloud e o ditado precisan conexión.`,
  },
  backup: {
    title: 'Copias de seguranza e restauración',
    keywords: 'copia de seguranza respaldo restaurar recuperar contrasinal cifrado ofimeo-backup lembrete documentos perdidos cambiar de ordenador',
    body: `Como os documentos están só neste navegador, garda unha copia de seguranza. Abre [Almacenamento e copias de seguranza](action:storage) (icona de disco na pantalla principal, ou Arquivo ▸ Almacenamento e copias de seguranza… en calquera aplicación).

## Facer unha copia
- **Copia de seguranza de todos os documentos** descarga un único ficheiro **.ofimeo-backup** con todos os teus documentos, o seu historial de versións, os comentarios e os teus modelos.
- Podes protexelo cun **contrasinal** (cifrado forte). Faino: o ficheiro contén as chaves para editar os teus documentos. Sen o contrasinal non se pode restaurar.
- Na pantalla principal tamén podes copiar só os documentos seleccionados.

## Restaurar
**Restaurar copia de seguranza** le o ficheiro e combínao: os documentos que xa están aquí actualízanse sen perder nada e os que faltan engádense. Un informe indica que se engadiu e que se combinou. Úsao para levar os teus documentos a outro ordenador ou navegador.

## Lembretes e copia automática
- A pantalla principal avísate cando hai documentos que só están neste navegador e non fixeches copia en 7 días (podes cambiar os días ou desactivalo).
- Cunha conta de [Nextcloud](help:nextcloud), a copia automática sobe unha copia cada poucos días a un cartafol do teu Nextcloud (desactivada por defecto).`,
  },
  nextcloud: {
    title: 'Nextcloud',
    keywords: 'nube servidor webdav gardar abrir sincronizar contrasinal de aplicación acceder conta centro ficheiro',
    body: `Se o teu centro ten un servidor Nextcloud, podes abrir ficheiros del e volver gardalos. O teu navegador comunícase directamente con Nextcloud.

## Conectar a túa conta
Abre [Conta de Nextcloud](action:nextcloud) (botón Nextcloud da pantalla principal, ou Arquivo ▸ Conta de Nextcloud…). Escribe o enderezo do servidor e escolle **Acceder con Nextcloud**, ou usa un **contrasinal de aplicación** (Nextcloud ▸ Configuración persoal ▸ Seguranza ▸ Crear un novo contrasinal de aplicación). Non escribas nunca o teu contrasinal principal. **Probar a conexión** explica que falla se non funciona.

## Abrir e gardar
- **Abrir desde Nextcloud…** (pantalla principal e menú Arquivo) abre un ficheiro como documento novo **vinculado** a el.
- **Gardar en Nextcloud** (\`Ctrl+S\`) actualiza o ficheiro vinculado. **Gardar en Nextcloud como…** escolle cartafol, nome e formato.
- Se mentres tanto o ficheiro cambiou en Nextcloud, escolles entre sobrescribilo, gardar unha copia ou cancelar.
- Gardado automático opcional cada poucos minutos.

## Convén saber
- Só a persoa que vinculou un documento o garda en Nextcloud; a colaboración segue indo directamente entre navegadores.
- Sen conexión, as accións de Nextcloud están desactivadas.
- Se non podes conectar porque o servidor bloquea este sitio, o departamento de informática debe permitilo (CORS). A caixa da conta amosa o que precisan.`,
  },
  handin: {
    title: 'Entregar traballos',
    keywords: 'entregar entrega deberes tarefa profesor alumno zip pdf subir ligazón de subida enviar',
    body: `**Para o alumnado.** Fai clic en **Entregar** (xunto a Compartir). Ofimeo descarga un ficheiro ZIP co teu nome e o título, co documento nos seus formatos orixinais (por exemplo .odt e .docx, ou .pptx e imaxes das diapositivas).

- Se aínda non escribiches o teu nome, pídeseche: vai no nome do ficheiro.
- Sobe ou envía o ZIP ao teu profesor ou profesora como che indicase (aula virtual, correo…).
- **Imprimir / Gardar como PDF** crea un PDF se tamén fai falta: escolle «Gardar como PDF» como impresora.
- **Subir a unha ligazón compartida de Nextcloud…**: se o teu profesor che deu unha ligazón de subida, o ficheiro vai directamente alí. Non precisas conta de Nextcloud.
- **Entregar en Moodle…**: se o teu centro usa Moodle, entrega directamente nunha tarefa. Consulta [Moodle](help:moodle).

**Para o profesorado.**
- Dálle a cada alumno a súa propia ficha cunha ligazón **Fai unha copia** (ver [Compartir](help:sharing)).
- Crea unha ligazón de subida («Só subida») no teu Nextcloud e dálla á clase.
- Abre os PDF do alumnado, ou os ZIP de entrega, en [Ofimeo PDF](help:pdf) para corrixilos.
- Para cuestionarios, usa [Ofimeo Formularios](help:forms).`,
  },
  moodle: {
    title: 'Moodle',
    keywords: 'moodle aula virtual campus tarefa deberes data de entrega prazo nota cualificación comentarios entregar curso',
    body: `Conecta Ofimeo co Moodle do teu centro para ver as túas tarefas na pantalla principal e entregar o teu traballo sen descargar e subir ficheiros.

## Conectar
Abre [Moodle](action:moodle) (botón Moodle da pantalla principal, ou Ficheiro ▸ Conta de Moodle…). Escribe o enderezo de Moodle (pode que o teu centro xa o puxese), o teu usuario e o teu contrasinal, e escolle **Conectar**.
- O teu contrasinal vai só a Moodle, unha vez. Ofimeo garda neste navegador só unha clave de Moodle e o teu nome. **Desconectar** bórraos.
- Se no teu centro se entra en Moodle a través dunha páxina web (Google, Microsoft ou un acceso do centro, «inicio de sesión único»), este tipo de acceso aínda non funciona en Ofimeo. Ofimeo avísate cando o detecta. Entrega co [Entregar](help:handin) habitual e sube o ficheiro en Moodle.

## Tarefas de Moodle
O panel **Tarefas de Moodle** da pantalla principal mostra as tarefas dos teus cursos. Primeiro as pendentes, ordenadas por data de entrega. Despois as entregadas e cualificadas.
- Abre unha tarefa para ler a súa descrición, descargar os seus ficheiros (**Abrir en Ofimeo** crea a túa propia copia) e ver a data de entrega, o último día para entregar, o teu estado, a túa nota e os comentarios do profesor cando se publiquen.
- **Actualizar** renova a lista. Sen conexión ves a última lista, coa hora en que se actualizou.
- A lista só informa. Traballa na tarefa no propio Moodle cando non se entrega como ficheiro.

## Entregar en Moodle
En calquera aplicación, escolle **Entregar** (ou Ficheiro ▸ Entregar en Moodle…):
1. Escolle a tarefa. Só aparecen as tarefas abertas que admiten ficheiros.
2. Escolle o formato. Ofimeo propón un que a tarefa acepta. Ofrécese PDF nas aplicacións que o exportan; se non, usa **Un ficheiro deste dispositivo…**.
3. Se a tarefa ten unha declaración de entrega, léa e márcaa.
4. Escolle **Entregar**. Ofimeo sube o ficheiro e gárdao como a túa entrega. Se a tarefa ten botón de enviar, ademais envíaa para cualificar.

Se volves entregar mentres a tarefa está aberta, substitúese o teu ficheiro. Se Moodle rexeita o ficheiro (demasiado grande, tipo non admitido, demasiados ficheiros), a mensaxe di por que.

## Privacidade
O teu traballo de Moodle vai só ao Moodle do teu centro, directamente desde este navegador ou a través do relé propio do teu centro. Nunca se envía ás persoas coas que compartes documentos.`,
  },
  network: {
    title: 'Redes de centros: proba de conexión e repetidor',
    keywords: 'rede wifi devasa cortalumes filtro bloqueado só ti non conecta repetidor relé relay turn stun nostr departamento de informática proxy',
    body: `Os colaboradores conéctanse directamente entre si. Os repetidores públicos só serven para atoparse. Algunhas redes de centros bloquéano: entón o estado queda en **Só ti**.

## Proba de conexión
Abre [Axuda ▸ Proba de conexión…](action:connection) ou fai clic no estado de conexión xunto a Compartir. Comproba a conexión a Internet, os repetidores, se son posibles as conexións directas e como está conectada cada persoa do documento. Remata cun diagnóstico en linguaxe clara. **Copiar informe** copia os detalles para o departamento de informática.

## Causas habituais
- Un filtro de contidos bloquea os repetidores públicos.
- Unha devasa estrita bloquea as conexións directas.
- A wifi illa os dispositivos entre si.

## Ofimeo Relay
Para estas redes, un centro pode executar **Ofimeo Relay**, un pequeno programa para a súa propia rede (Windows, macOS, Linux ou Raspberry Pi). Axuda a que os dispositivos se atopen e se conecten.
- Pega o seu enderezo na proba de conexión, ou abre unha ligazón con **?relay=** e o seu enderezo. O navegador lémbrao.
- As ligazóns para compartir inclúen o repetidor, así que o alumnado recíbeo ao abrir a ligazón.
- Podes escoller usar só o repetidor do centro.

## Sincronizar sen estar conectados á vez
Normalmente os cambios só viaxan mentres dúas persoas teñen o documento aberto á vez. Con **sincronizar sen estar conectados á vez**, unha copia cifrada dos cambios agarda polos demais: un alumno edita na clase e continúa na casa, e o docente corrixe pola noite.
- Actívao na proba de conexión, en **Sincronizar sen estar conectados á vez**: no relé do centro (se garda copias) ou nun cartafol de Nextcloud. O teu centro pode activalo para todos.
- O estado xunto ao de gardado mostra **Sincronizado en …** cando os teus cambios están gardados, ou **Agardando para sincronizar** se non tes conexión (envíanse despois).
- Todo se cifra no teu navegador coa clave da ligazón do documento. O relé ou Nextcloud só ven datos cifrados, o seu tamaño e cando cambian.
- As ligazóns de só lectura descargan os cambios pero nunca poden subir ningún. En Nextcloud, usa un cartafol compartido coas demais persoas.
- As copias do relé do centro bórranse tras un tempo sen cambios (180 días de forma predeterminada).

O departamento de informática atopa a guía de instalación na documentación do proxecto (docs/relay.md).`,
  },
  'school-setup': {
    title: 'Para administradores: instalar Ofimeo nun centro',
    keywords: 'administrador departamento informática instalar despregar servidor docker raspberry windows configuración ofimeo.config.json bloqueado establéceo o teu centro logotipo idioma webmcp modelos ocultar aplicacións',
    body: `Un centro pode ter a súa propia copia de Ofimeo na súa rede e configurala para todos cun só ficheiro, **ofimeo.config.json**.

## Formas de instalalo
- **Docker**: un contedor coa aplicación e Ofimeo Relay (o Dockerfile e docker-compose.yml están no proxecto).
- **Só Ofimeo Relay** nun servidor Windows, un equipo Linux ou unha Raspberry Pi: tamén pode servir a aplicación.
- **Calquera servidor web** (nginx, Apache, IIS): copia os ficheiros compilados. A aplicación non ten parte de servidor.

## A configuración do centro
[Axuda ▸ Para administradores…](action:admin) abre un formulario que crea ofimeo.config.json. Establece:
- o nome e o logotipo do centro, que se mostran na pantalla de inicio;
- o idioma da interface por defecto e o idioma dos documentos novos;
- o relé do centro, outros relés e se se poden usar servidores públicos;
- onde poden agardar os cambios cifrados para quen non está conectado;
- os servidores Nextcloud que se ofrecen ao conectarse;
- se se permiten asistentes de IA (WebMCP) e que aplicacións e modelos se ofrecen;
- os contactos de privacidade do centro, que se mostran enriba das ligazóns legais.

Pon o ficheiro xunto a index.html (ou dállo a Ofimeo Relay con **--school-config**). Cada navegador aplícao ao abrir Ofimeo e garda unha copia para traballar sen conexión.

## Axustes bloqueados
Os axustes que o centro bloquea mostran **Establéceo o teu centro** e non se poden cambiar no navegador: o idioma da interface, o interruptor de asistentes de IA, o relé do centro e os servidores Nextcloud.

A guía paso a paso para o departamento de informática está na documentación do proxecto (docs/deploy-school.md).`,
  },
  privacy: {
    title: 'Privacidade',
    keywords: 'privacidade protección de datos rxpd datos persoais alumnado menores cookies rastrexo seguro cifrado',
    body: `Ofimeo está deseñado para que ninguén, agás ti e as persoas coas que compartes, reciba os teus documentos.

- **Sen contas, sen cookies, sen analítica, sen publicidade.** O sitio só entrega o programa, que despois funciona no teu navegador.
- **Os teus documentos quedan no teu dispositivo** (no navegador). As preferencias, o teu nome e as credenciais de Nextcloud tamén se gardan só aquí.
- **Ao compartir**, os colaboradores reciben o documento, os seus comentarios e versións, o nome que escribiches e, como a conexión é directa, o teu enderezo IP. Os datos viaxan cifrados directamente entre navegadores. Os repetidores públicos só ven mensaxes de conexión cifradas.
- **As ligazóns son chaves**: quen ten unha ligazón obtén o seu acceso. Non publiques ligazóns de edición.
- **Nextcloud**: o teu contrasinal só se envía ao teu servidor Nextcloud.
- **O ditado** usa o recoñecemento de voz do navegador, que pode enviar o audio ao servizo do fabricante do navegador.

## Consellos para a aula
- Usa o nome, as iniciais ou un alcume.
- Non poñas datos persoais sensibles (saúde, asuntos familiares) en documentos compartidos.

Le a [política de privacidade](legal:privacy) completa e a [información para centros educativos](legal:schools).`,
  },
  shortcuts: {
    title: 'Atallos de teclado',
    keywords: 'teclado atallos teclas combinacións ctrl comando mac f1 f10',
    body: `Estas teclas funcionan en todas as aplicacións (en Mac, usa ⌘ en lugar de Ctrl):

- \`Ctrl+O\` abrir un ficheiro, \`Ctrl+P\` imprimir, \`Ctrl+S\` gardar en Nextcloud (o teu traballo sempre se garda no navegador de todos os xeitos)
- \`Ctrl+Z\` desfacer, \`Ctrl+Y\` refacer
- \`Ctrl+X\` cortar, \`Ctrl+C\` copiar, \`Ctrl+V\` pegar, \`Ctrl+A\` seleccionar todo
- \`Ctrl+F\` buscar
- \`F10\` ou \`Alt+Maiús+M\` ir á barra de menús; despois usa as frechas, \`Intro\` e \`Esc\`
- \`Ctrl+/\` ou \`F1\` ver todos os atallos da aplicación que estás a usar
- \`Alt+Maiús+A\` panel de accesibilidade, \`Alt+Maiús+R\` ler en voz alta, \`Alt+Maiús+D\` ditado

En Ofimeo Documentos e Ofimeo Follas de cálculo, \`Ctrl+H\` abre buscar e substituír.

Os menús amosan o atallo de cada orde ao seu carón.

[Ver os atallos desta aplicación](action:shortcuts)`,
  },
  accessibility: {
    title: 'Accesibilidade',
    keywords: 'accesibilidade dislexia fonte letra grande texto zoom contraste tema escuro lector de pantalla ler en voz alta ditado voz teclado movemento',
    body: `Abre o [panel de accesibilidade](action:accessibility) co botón de accesibilidade ou \`Alt+Maiús+A\`. Os axustes gárdanse neste navegador e aplícanse a toda a suite; os teus documentos non cambian.

- **Fontes de lectura**: OpenDyslexic ou Atkinson Hyperlegible para a interface e, se queres, para o texto dos documentos.
- **Tamaño do texto** da interface, e **entreliñado e espazamento entre letras** para ler.
- **Temas**: claro, escuro, segundo o sistema e dous temas de alto contraste.
- **Reducir o movemento**, **punteiro do rato grande**, **contorno de foco groso**.
- **Regra de lectura** ou **máscara de foco** que seguen o punteiro e o cursor de texto.
- **Ler en voz alta** (\`Alt+Maiús+R\`): le a selección, o parágrafo ou todo o documento coas voces do navegador.
- **Ditado** (\`Alt+Maiús+D\`): escribe o que dis. Precisa conexión e un navegador compatible (Chrome, Edge).
- **Teclado**: todo se pode usar co teclado. \`F10\` leva á barra de menús e ao premer \`Tab\` aparece unha ligazón «Saltar ao contido». Consulta [Atallos de teclado](help:shortcuts).

O idioma da interface cámbiase na pantalla principal ou no panel.`,
  },
  spelling: {
    title: 'Ortografía e gramática',
    keywords: 'ortografía corrector gramática dicionario idioma gralla erro subliñado f7 revisar',
    body: `Todas as aplicacións revisan a ortografía (subliñado ondulado vermello) e a gramática (azul) mentres escribes, no idioma do documento. A revisión faise no teu navegador: o texto non se envía a ningures, agás que escollas un servidor LanguageTool no procesador de textos.

## Onde
- **Documentos**: todo o documento. Fai clic dereito nunha palabra subliñada para ver suxestións.
- **Follas de cálculo**: a cela que editas. As fórmulas e os números non se revisan.
- **Presentacións e Diagramas**: etiquetas e caixas de texto mentres escribes, e notas do orador.
- **Formularios**: títulos, descricións e opcións. As respostas escritas revísanse se o formulario o permite (**Configuración ▸ Permitir o corrector ortográfico a quen responde**: activado nas enquisas, desactivado nos cuestionarios, onde podería revelar respostas).
- **PDF**: caixas de texto, comentarios e respostas.
- **Debuxo**: o texto que escribes.

## Diálogo de ortografía e gramática
**Ferramentas ▸ Ortografía e gramática…** (\`F7\`) percorre os erros un a un: todas as celas de todas as follas, todas as diapositivas e as súas notas, todas as páxinas dun diagrama, todas as preguntas dun formulario, todas as caixas de texto e comentarios dun PDF e todos os textos dun debuxo. Mostra onde está cada un (por exemplo «Folla1 · B3») e selecciónao. **Cambiar** ou **Cambiar todo** corríxeo, **Ignorar** sáltao e **Engadir ao dicionario** acepta a palabra desde entón.

## Idioma e dicionario
- **Ferramentas ▸ Idioma** fixa o idioma do documento (inglés dos EUA ou do Reino Unido, español de varios países, galego, francés, alemán). Gárdase co documento, así que todos o revisan no mesmo idioma.
- **Ferramentas ▸ Dicionario persoal…** mostra as palabras que engadiches. Compártense en todas as aplicacións e documentos deste navegador.
- **Ferramentas ▸ Revisar a ortografía ao escribir** / **Revisar a gramática ao escribir** quitan os subliñados en todas as aplicacións.`,
  },
  writer: {
    title: 'Ofimeo Documentos (textos)',
    keywords: 'procesador de textos documento word docx odt páxina índice táboa de contidos cita bibliografía comentario suxestións control de cambios revisar corrixir',
    body: `Un procesador de textos con páxinas reais, coma os que xa coñeces.

## Escribir
- Usa os menús (Arquivo, Editar, Ver, Inserir, Formato, Táboa, Referencias, Ferramentas, Revisar) e a barra de ferramentas. Co botón dereito tes máis opcións.
- Os estilos de parágrafo (Título, Encabezados…) dan estrutura e alimentan a **táboa de contidos** (Inserir ou Referencias ▸ Táboa de contidos).
- **Referencias** ten citas e bibliografía en estilo APA, MLA ou Chicago.
- O tamaño de páxina, as marxes e a orientación están en Arquivo ▸ Configurar páxina…

## Revisar (o profesorado corrixindo traballos)
- **Comentarios**: selecciona texto e preme \`Ctrl+Alt+M\` (ou Revisar ▸ Comentario). As persoas con ligazón de comentario tamén poden comentar.
- **Suxestións**: cambia o modo de **Edición** a **Suxestións**. Os teus cambios quedan marcados e o autor acéptaos ou rexéitaos.
- Revisar ▸ Amosar autoría colorea o texto segundo quen o escribiu.

## Gráficos
**Inserir ▸ Gráfico…** engade un gráfico de columnas, barras, liñas, áreas, circular, de anel ou de dispersión. Colle os datos dunha folla de cálculo da túa biblioteca (escolle a folla e o intervalo) ou escríbeos na pequena táboa. Un gráfico **ligado** a unha folla de cálculo actualízase só cando esa folla cambia neste navegador; **Actualizar desde a orixe** (no gráfico ou no seu menú contextual) faino ao momento. O documento garda unha copia dos datos, así que todos ven o gráfico aínda que non teñan a folla. Arrastra a esquina para cambiar o tamaño; fai dobre clic para modificalo ou engadir un pé de figura. Os ficheiros de Word consérvano como gráfico real.

## Combinar correspondencia
**Ferramentas ▸ Combinar correspondencia…** crea unha carta, diploma ou boletín por cada fila dunha táboa:
1. Escolle os datos: unha folla de cálculo da túa biblioteca ou un ficheiro CSV, Excel ou OpenDocument, a folla e a fila cos nomes dos campos.
2. Fai clic nun campo para inserilo onde está o cursor, por exemplo «Nome». **Texto condicional…** engade texto só cando un campo ten un valor (por exemplo "se Nota é Aprobado").
3. Se queres, deixa só algunhas filas co filtro.
4. Marca **Amosar os datos dun rexistro** e usa as frechas para revisar cada un.
5. Crea un **Documento novo** con todos (un por páxina), un **PDF** ou un **ZIP** de ficheiros Word ou PDF co nome dun campo.

Os ficheiros de Word conservan os campos (MERGEFIELD), así que o modelo tamén funciona en Word.

## Ficheiros
Abre e descarga Word (.docx) e OpenDocument (.odt); tamén abre Word 97-2003 (.doc), RTF, .html, .txt e Markdown (.md, con títulos, listas, ligazóns, código e táboas), e descarga Markdown. Se un ficheiro ten algo que Ofimeo non pode traer (por exemplo caixas de texto ou notas ao final dun .doc), unha mensaxe indícao unha vez. Imprime ou garda como PDF con Arquivo ▸ Imprimir. Ver ▸ Zoom (ou \`Ctrl++\`, \`Ctrl+-\`, \`Ctrl+0\`) cambia o zoom.`,
  },
  sheet: {
    title: 'Ofimeo Follas de cálculo',
    keywords: 'folla de cálculo excel xlsx ods csv fórmula función gráfico táboa dinámica celas caderno de notas',
    body: `Follas de cálculo con fórmulas, gráficos e varias follas.

- Escribe \`=\` para comezar unha fórmula, por exemplo =SUM(B2:B30) ou =AVERAGE(C2:C30). Hai centos de funcións.
- **Inserir ▸ Gráfico…** crea un gráfico de columnas, barras, liñas, circular ou de dispersión a partir das celas seleccionadas. Os gráficos actualízanse cando cambian os valores.
- **Datos** ten ordenar, filtros, validación e **Táboa dinámica…**.
- **Formato** ten formatos de número, combinar celas e formato condicional; os bordos están na barra de ferramentas.
- A barra de estado amosa a suma, a media e a conta das celas seleccionadas.
- Varias persoas poden editar á vez; ves as súas seleccións nas súas cores.

## Lectores de pantalla e teclado
A grella debúxase como unha imaxe, así que **Ver ▸ Vista de táboa accesible** (\`Alt+Maiús+T\`, ou a ligazón «Cambiar á vista de táboa accesible» ao principio da páxina) mostra a folla actual como unha táboa real que os lectores de pantalla poden ler. As frechas moven entre celas e cada cela lese co seu enderezo, o seu valor e a súa fórmula; \`Intro\` ou \`F2\` edítaa, \`Supr\` bórraa, \`Ctrl+Z\` desfai, \`Ctrl+Inicio\` / \`Ctrl+Fin\` van ao principio e ao final dos datos e \`Ctrl+Re Páx\` / \`Ctrl+Av Páx\` cambian de folla. Os cambios chegan aos demais ao momento. Os gráficos aparecen baixo a táboa cun resumo dos seus valores e **Datos do gráfico como táboa** (tamén no menú do botón dereito do gráfico e en Editar cando hai un gráfico seleccionado). Na grella normal lese a cela seleccionada ao moverse, e as frechas pasan dunha lapela de folla a outra.

## Ficheiros
Abre e descarga Excel (.xlsx), OpenDocument (.ods) e CSV. Os gráficos gárdanse como gráficos reais que Excel e LibreOffice poden editar. Imprime ou garda a folla actual como PDF con Arquivo ▸ Imprimir.

Os modelos de caderno de notas, asistencia e rúbrica da pantalla principal están listos para usar.`,
  },
  draw: {
    title: 'Ofimeo Debuxo (encerado)',
    keywords: 'debuxo encerado lousa bosquexo debuxar a man alzada excalidraw choiva de ideas taboleiro formas frechas',
    body: `Un encerado para debuxar a man alzada ou con formas, frechas e texto, só ou coa clase.

- Escolle unha ferramenta na barra do lenzo e arrastra para debuxar. As frechas quedan unidas ás formas que conectan.
- O panel xunto á selección cambia cores, liñas, recheo e fonte.
- Mantén premido \`Espazo\` e arrastra para moverte; \`Ctrl\` e a roda do rato fan zoom.
- Todos os que están no debuxo ven os punteiros e os cambios dos demais en directo.
- Podes pegar ou soltar imaxes no lenzo.

## Ficheiros
Arquivo ▸ Descargar como garda imaxes PNG ou SVG, ou un ficheiro .excalidraw para volver abrilo máis tarde. Arquivo ▸ Exportar imaxe… ofrece máis opcións (fondo, modo escuro, escala).`,
  },
  diagram: {
    title: 'Ofimeo Diagramas',
    keywords: 'diagrama diagrama de fluxo mapa conceptual mapa mental uml rede drawio visio formas conectores organizador liña do tempo',
    body: `Diagramas, diagramas de fluxo e mapas conceptuais, compatibles con draw.io.

- Arrastra formas desde o **panel de formas** ao lenzo, ou fai clic nunha para inserila. O buscador atopa formas polo seu nome.
- Arrastra desde un punto de conexión dunha forma ata outra forma para unilas.
- Fai dobre clic nunha forma para escribir o seu texto.
- O **panel de formato** cambia recheo, liña, texto, frechas, posición e tamaño.
- **Organizar** ten aliñamento, agrupación e deseños automáticos (árbore, círculo…).
- **Ver ▸ Máis formas…** engade bibliotecas como UML, redes, planos de planta, electricidade ou BPMN.
- Un diagrama pode ter varias páxinas (lapelas na parte inferior).

## Ficheiros
Abre e descarga ficheiros de draw.io (.drawio); abre debuxos de Visio (.vsdx). Descarga imaxes PNG ou SVG, ou imprime e garda como PDF.

A pantalla principal ten modelos de mapas conceptuais, liñas do tempo, diagramas de fluxo e organizadores gráficos.`,
  },
  slides: {
    title: 'Ofimeo Presentacións',
    keywords: 'presentación diapositivas powerpoint pptx odp presentar proxector presentador notas animación tema disposición seguir',
    body: `Presentacións para a aula.

- O **panel de diapositivas** da esquerda amosa as diapositivas. Fai clic co botón dereito nunha miniatura para engadir, duplicar, mover ou eliminar unha diapositiva e para cambiar a súa disposición ou o seu fondo.
- Escolle un **tema** e unha **disposición** para cada diapositiva. Fai clic nos marcadores para engadir un título e texto.
- Insire imaxes, formas, táboas e ecuacións. Escribe as **notas do relator** debaixo da diapositiva.
- **Inserir ▸ Gráfico…** engade un gráfico dunha folla de cálculo da túa biblioteca (actualízase cando cambia) ou con datos que escribes. Os ficheiros de PowerPoint consérvano como gráfico real.
- As **animacións** e **transicións** fan aparecer obxectos e diapositivas por quendas.
- **Presentar** amosa as diapositivas a pantalla completa: frechas ou un clic para avanzar, \`L\` para un punteiro láser, \`B\` para unha pantalla negra, \`Esc\` para rematar. A **vista do presentador** amosa as notas e un cronómetro nunha segunda xanela.
- Mentres presentas, o resto de persoas na presentación poden **seguirte** (Seguir o presentador), tamén cunha ligazón de lectura.

## Ficheiros
Abre PowerPoint (.pptx). Descarga PowerPoint (.pptx), OpenDocument (.odp), PDF e imaxes das diapositivas.`,
  },
  forms: {
    title: 'Ofimeo Formularios (formularios e cuestionarios)',
    keywords: 'formulario cuestionario exame proba enquisa preguntas respostas cualificar nota puntuación autoavaliación',
    body: `Formularios, enquisas e cuestionarios que se corrixen sós.

## Para o profesorado
- **Pregunta** engade unha pregunta; escolle o seu tipo: resposta curta, parágrafo, opción múltiple, caixas de verificación, despregable, escala, grella, data, hora ou número. **Sección** crea unha páxina nova.
- Activa **Cuestionario** para fixar as respostas correctas, os puntos e os comentarios. A corrección é automática; os parágrafos corríxense a man.
- **Enviar** dá a ligazón e un código QR para o teu alumnado. Só ven o formulario, non as respostas dos demais.
- As respostas chegan cando o teu navegador (ou o doutro editor) está conectado. Míraas en **Respostas**, con gráficos e estatísticas, e expórtaas a unha folla de cálculo.

## Para o alumnado
- Escribe o teu nome, responde ás preguntas e preme **Enviar**.
- Se non tes conexión, a resposta envíase cando volva.
- Se non hai ningún profesor conectado, usa **Descargar a miña resposta** e entrégalle o ficheiro ao teu profesor.

As respostas cífranse no navegador do alumno: só os editores do formulario poden lelas.`,
  },
  pdf: {
    title: 'Ofimeo PDF (corrixir PDF)',
    keywords: 'pdf corrixir cualificar anotar resaltar bolígrafo selo sinatura nota acrobat entrega zip',
    body: `Corrixe e anota ficheiros PDF, por exemplo os traballos que che entregou o teu alumnado.

- Abre un PDF desde a pantalla principal, desde Arquivo ▸ Abrir…, ou abre un ZIP de entrega: lístanse os PDF que contén.
- Ferramentas: resaltar, subliñar e riscar (selecciona texto), bolígrafo e borrador, caixas de texto, formas, **selos** (visto, cruz, «Ben», unha nota…), **notas adhesivas** e a túa **sinatura**.
- Teclas: \`H\` resaltar, \`P\` bolígrafo, \`T\` caixa de texto, \`N\` nota, \`S\` selo, \`G\` sinatura, \`Esc\` volver a Seleccionar.
- Teclado: escolle unha ferramenta (por exemplo \`T\`, \`N\`, \`R\` ou \`S\`) e preme \`Intro\` para colocala no centro da páxina que estás a ver. No panel Comentarios, **Engadir comentario** fai o mesmo coas notas adhesivas.
- Comparte o PDF para corrixilo en equipo ou para que o alumno lea as túas anotacións.

## Páxinas
O menú **Páxina** (ou o clic dereito nunha miniatura) xira unha páxina á esquerda ou á dereita (\`Ctrl+[\` / \`Ctrl+]\`), sóbea ou báixaa, engade páxinas en branco e elimina páxinas. Arrastra as miniaturas para reordenalas (ou \`Alt+↑\` / \`Alt+↓\` nunha miniatura). As anotacións seguen a súa páxina e Desfacer reverte cada cambio. O PDF descargado respecta a nova orde e o xiro.

## Ficheiros
Arquivo ▸ Descargar como garda o **PDF con anotacións**: «editable» mantenas como anotacións que outros lectores de PDF poden cambiar, «acoplado» débuxaas nas páxinas. A entrega inclúe os dous. As caixas de texto e os selos conservan símbolos como π, √, ≈, → e ✓.

Un **PDF protexido cun contrasinal** pídeo ao abrilo. O documento garda o ficheiro protexido orixinal; o contrasinal non se garda nel nin se envía a ninguén, así que cada persoa que o abre (e ti, nunha lapela nova) volve escribilo. Se cancelas, non se engade nada.`,
  },
  notebook: {
    title: 'Ofimeo Caderno (apuntamentos de clase)',
    keywords: 'caderno onenote apuntamentos notas clase sección páxina subpáxina etiqueta tarefa tinta lapis lapis óptico marcador debuxo laboratorio diario lectura',
    body: `Apuntamentos de clase organizados coma un arquivador: as **seccións** (lapelas de cores) conteñen **páxinas**, e as páxinas poden ter **subpáxinas**.

## Seccións e páxinas
- **Engadir sección** e **Engadir páxina** están no panel da esquerda. Arrastra páxinas e seccións para ordenalas, ou solta unha páxina sobre a lapela doutra sección para movela alí. Co teclado: \`Alt+↑\` / \`Alt+↓\`.
- O botón **⋯** dunha páxina (ou o clic dereito) convértea en subpáxina, móvea a outra sección, expórtaa, imprímea ou elimínaa.
- **Buscar no caderno** (\`Ctrl+F\`) busca nos títulos e no texto de todas as páxinas.
- No móbil, o botón **Seccións e páxinas** da parte superior ábreas coma un panel.

## Escribir
- Cada páxina ten un título, a data en que se creou e texto libre con títulos, listas, listas de comprobación, táboas, imaxes, ligazóns, ecuacións e código.
- Pega ou solta imaxes e ficheiros na páxina: gárdanse no caderno (as imaxes grandes redúcense; os demais ficheiros, ata 5 MB).
- As **etiquetas** marcan un parágrafo como **Tarefa**, **Importante**, **Pregunta** ou **Lembrar** (barra de ferramentas ▸ Etiqueta, ou \`Ctrl+Maiús+1\` a \`4\`). Fai clic na caixa dunha tarefa para marcala. **Resumo de etiquetas** reúne os parágrafos etiquetados de todas as páxinas.

## Debuxar
Escolle **Bolígrafo**, **Marcador** ou **Goma de borrar** na barra de ferramentas (\`Alt+2\`, \`Alt+3\`, \`Alt+4\`; \`Alt+1\` ou \`Esc\` volven a escribir). Cun lapis óptico o trazo é máis groso canto máis apertas. Con **Debuxar ▸ Debuxar co lapis óptico** o lapis óptico sempre debuxa, mentres o dedo ou o rato seleccionan texto. A goma quita trazos enteiros; Desfacer recupéraos.

## En equipo
Comparte o caderno para escribir á vez e ver quen está en cada páxina. Comenta con \`Ctrl+Alt+M\`, entrégao e atopa versións anteriores en Ficheiro ▸ Historial de versións.

## Ficheiros
- Ficheiro ▸ Descargar como: todo o caderno en Word, OpenDocument, PDF, Markdown ou un **ZIP de Markdown** (un cartafol por sección, con imaxes e tinta). **Páxina actual** e **Sección actual** exportan só iso.
- Imprimir (\`Ctrl+P\`) imprime a páxina aberta; **Imprimir sección…** imprime todas as páxinas da sección.
- Ficheiro ▸ Abrir… importa ficheiros Markdown ou un ZIP de Markdown. Un ZIP exportado desde Ofimeo recupera seccións, cores, subpáxinas e tinta. **Importar un cartafol de ficheiros Markdown…** colle un cartafol enteiro. Os ficheiros de OneNote (.one) non se poden importar: expórtaos antes desde OneNote a Word ou PDF.`,
  },
}

export default articles
