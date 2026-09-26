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

[Ver de novo a visita guiada](action:tour)`,
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
- Os documentos creados antes de que existisen as ligazóns con permisos só se poden compartir con ligazóns de edición. Usa Arquivo ▸ Facer unha copia para ter todos os tipos de ligazón.`,
  },
  offline: {
    title: 'Traballar sen conexión e onde se gardan os teus datos',
    keywords: 'sen conexión internet instalar aplicación pwa almacenamento indexeddb datos do navegador borrar perdidos dispositivo ordenador',
    body: `Os teus documentos gárdanse **neste navegador, neste dispositivo** (no seu almacenamento IndexedDB). Non se soben a ningún servidor. O estado de gardado da barra de estado indica **Gardado neste navegador**.

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

**Para o profesorado.**
- Dálle a cada alumno a súa propia ficha cunha ligazón **Fai unha copia** (ver [Compartir](help:sharing)).
- Crea unha ligazón de subida («Só subida») no teu Nextcloud e dálla á clase.
- Abre os PDF do alumnado, ou os ZIP de entrega, en [Ofimeo PDF](help:pdf) para corrixilos.
- Para cuestionarios, usa [Ofimeo Formularios](help:forms).`,
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

O departamento de informática atopa a guía de instalación na documentación do proxecto (docs/relay.md).`,
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

## Ficheiros
Abre e descarga Word (.docx) e OpenDocument (.odt); tamén abre .html, .txt e .md. Imprime ou garda como PDF con Arquivo ▸ Imprimir.`,
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
- Comparte o PDF para corrixilo en equipo ou para que o alumno lea as túas anotacións.

## Ficheiros
Arquivo ▸ Descargar como garda o **PDF con anotacións**: «editable» mantenas como anotacións que outros lectores de PDF poden cambiar, «acoplado» débuxaas nas páxinas. A entrega inclúe os dous.`,
  },
}

export default articles
