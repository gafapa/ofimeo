# Política de cookies y almacenamiento local

{{siteName}} no utiliza cookies ni ninguna tecnología de seguimiento, analítica o publicidad. Solo guarda en tu navegador la información estrictamente necesaria para que la aplicación funcione, y esa información no se envía al titular.

## 1. Qué son las cookies y el almacenamiento local

Las cookies y otras tecnologías de almacenamiento (localStorage, IndexedDB, Cache Storage) permiten a un sitio web guardar información en el dispositivo de la persona usuaria. El artículo 22.2 de la Ley 34/2002 (LSSI-CE) exige informar y obtener el consentimiento para usarlas, salvo cuando sean estrictamente necesarias para prestar un servicio expresamente solicitado por la persona usuaria.

## 2. Qué almacenamiento utiliza {{siteName}}

Todo el almacenamiento es propio (no hay almacenamiento de terceros), se guarda solo en tu navegador y dura hasta que lo borres.

| Categoría | Nombre técnico | Finalidad |
| --- | --- | --- |
| Documentos | IndexedDB `ofimeo:<id>` y `ofimeo:<id>:comments` | Contenido de cada documento, comentarios, historial de versiones y autoría |
| Registro de cambios firmados | IndexedDB `ofimeo-kv` | Permite reenviar a otros participantes los cambios de documentos abiertos con enlaces de lectura o de comentario |
| Índice de documentos | localStorage `ofimeo:docs` | Lista de tus documentos: título, fecha, claves de acceso y archivo vinculado en Nextcloud |
| Organización local | localStorage `ofimeo:library`; IndexedDB `ofimeo-library` | Carpetas y etiquetas de tus documentos, índice para buscar en su texto y tus propias plantillas |
| Copias de seguridad | localStorage `ofimeo:backup` | Fecha de la última copia, recordatorio y copia automática en Nextcloud, si la activas |
| Relay del centro | localStorage `ofimeo:school-relay` | Dirección del relay del centro y configuración de conexión que este facilita |
| Identidad | localStorage `ofimeo:user`, `ofimeo:writer-user-id` | Nombre y color que ven tus colaboradores; identificador técnico para la autoría |
| Preferencias | localStorage `ofimeo:language`, `ofimeo:a11y`, `ofimeo:spelling`, `ofimeo:spelling-dictionary:<idioma>`, `ofimeo:zoom`, `ofimeo:home-view`, `wo-template-lang`, `diagram-libraries` | Idioma, accesibilidad, ortografía y diccionario personal, zoom, idioma de las plantillas y bibliotecas de formas elegidas |
| Asistentes de IA (solo si lo activas) | localStorage `ofimeo:webmcp` | Que has permitido a los asistentes de IA usar los documentos abiertos en este navegador (WebMCP; desactivado por defecto). Ver la [Nota sobre inteligencia artificial](ai.md) |
| Nextcloud (solo si lo configuras) | sessionStorage/localStorage `ofimeo:nextcloud`; localStorage `ofimeo:nextcloud-server`, `ofimeo:nextcloud-folder`, `ofimeo:nextcloud-format`, `ofimeo:nextcloud-share` | Servidor, usuario y contraseña de aplicación, última carpeta y formato usados |
| Funcionamiento sin conexión | Service worker y Cache Storage `workbox-precache-*`, `excalidraw-fonts`, `spelling`, `diagram-libs-*` | Archivos de la aplicación, tipos de letra, diccionarios y formas para usarla sin conexión |

Los nombres técnicos pueden cambiar entre versiones; las categorías y finalidades se mantienen. Las claves `ofimeo` provienen del nombre técnico del proyecto.

## 3. Por qué no hay aviso de cookies

Todo este almacenamiento es estrictamente necesario para prestar el servicio que solicitas (editar, guardar y compartir tus documentos, recordar tus preferencias y usar la aplicación sin conexión) y está exento de consentimiento según el artículo 22.2 de la LSSI-CE y la Guía sobre el uso de las cookies de la Agencia Española de Protección de Datos. No se usa para analítica, publicidad ni perfiles, y no se comparte con el titular ni con terceros.

El servidor de alojamiento no instala cookies en este sitio. Si en el futuro se incorporase algún almacenamiento no exento, se solicitaría tu consentimiento antes de utilizarlo.

## 4. Cómo consultar y borrar el almacenamiento

- **Un documento:** en la pantalla de inicio, abre el menú ⋮ del documento y elige *Quitar de este navegador*. Se borra de este navegador; las copias de tus colaboradores no se ven afectadas.
- **Credenciales de Nextcloud:** en la cuenta de Nextcloud, *Cerrar sesión*.
- **Todo:** en la configuración del navegador, borra los datos del sitio (en Chrome y Edge, *Configuración → Privacidad y seguridad → Cookies y datos de sitios*; en Firefox, *Ajustes → Privacidad y seguridad → Cookies y datos del sitio*; en Safari, *Ajustes → Privacidad → Gestionar datos de sitios web*).

Atención: borrar los datos del sitio elimina tus documentos de este dispositivo de forma irreversible. Descárgalos o guárdalos en Nextcloud antes.

En la navegación privada o de incógnito, el navegador borra todo este almacenamiento al cerrar la ventana.

## 5. Más información

Consulta la [Política de privacidad](privacy.md) para saber qué datos existen y quién puede tratarlos.
