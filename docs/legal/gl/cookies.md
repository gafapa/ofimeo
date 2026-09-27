# Política de cookies e almacenamento local

{{siteName}} non utiliza cookies nin ningunha tecnoloxía de seguimento, analítica ou publicidade. Só garda no teu navegador a información estritamente necesaria para que a aplicación funcione, e esa información non se envía ao titular.

## 1. Que son as cookies e o almacenamento local

As cookies e outras tecnoloxías de almacenamento (localStorage, IndexedDB, Cache Storage) permítenlle a un sitio web gardar información no dispositivo da persoa usuaria. O artigo 22.2 da Lei 34/2002 (LSSI-CE) esixe informar e obter o consentimento para usalas, agás cando sexan estritamente necesarias para prestar un servizo expresamente solicitado pola persoa usuaria.

## 2. Que almacenamento utiliza {{siteName}}

Todo o almacenamento é propio (non hai almacenamento de terceiros), gárdase só no teu navegador e dura ata que o borres.

| Categoría | Nome técnico | Finalidade |
| --- | --- | --- |
| Documentos | IndexedDB `ofimeo:<id>` e `ofimeo:<id>:comments` | Contido de cada documento, comentarios, historial de versións e autoría |
| Rexistro de cambios asinados | IndexedDB `ofimeo-kv` | Permite reenviar a outros participantes os cambios de documentos abertos con ligazóns de lectura ou de comentario |
| Índice de documentos | localStorage `ofimeo:docs` | Lista dos teus documentos: título, data, claves de acceso e ficheiro vinculado en Nextcloud |
| Organización local | localStorage `ofimeo:library`; IndexedDB `ofimeo-library` | Cartafoles e etiquetas dos teus documentos, índice para buscar no seu texto e os teus propios modelos |
| Copias de seguranza | localStorage `ofimeo:backup` | Data da última copia, lembrete e copia automática en Nextcloud, se a activas |
| Relay do centro | localStorage `ofimeo:school-relay` | Enderezo do relay do centro e configuración de conexión que este facilita |
| Identidade | localStorage `ofimeo:user`, `ofimeo:writer-user-id` | Nome e cor que ven os teus colaboradores; identificador técnico para a autoría |
| Preferencias | localStorage `ofimeo:language`, `ofimeo:a11y`, `ofimeo:spelling`, `ofimeo:spelling-dictionary:<idioma>`, `ofimeo:zoom`, `ofimeo:home-view`, `wo-template-lang`, `diagram-libraries` | Idioma, accesibilidade, ortografía e dicionario persoal, zoom, idioma dos modelos e bibliotecas de formas escollidas |
| Asistentes de IA (só se o activas) | localStorage `ofimeo:webmcp` | Que permitiches aos asistentes de IA usar os documentos abertos neste navegador (WebMCP; desactivado por defecto). Ver a [Nota sobre intelixencia artificial](ai.md) |
| Nextcloud (só se o configuras) | localStorage `ofimeo:nextcloud`, `ofimeo:nextcloud-server`, `ofimeo:nextcloud-folder`, `ofimeo:nextcloud-format`, `ofimeo:nextcloud-share` | Servidor, usuario e contrasinal de aplicación, último cartafol e formato usados |
| Funcionamento sen conexión | Service worker e Cache Storage `workbox-precache-*`, `excalidraw-fonts`, `spelling`, `diagram-libs-*` | Ficheiros da aplicación, tipos de letra, dicionarios e formas para usala sen conexión |

Os nomes técnicos poden cambiar entre versións; as categorías e finalidades mantéñense. As claves `ofimeo` proveñen do nome técnico do proxecto.

## 3. Por que non hai aviso de cookies

Todo este almacenamento é estritamente necesario para prestar o servizo que solicitas (editar, gardar e compartir os teus documentos, lembrar as túas preferencias e usar a aplicación sen conexión) e está exento de consentimento segundo o artigo 22.2 da LSSI-CE e a Guía sobre o uso das cookies da Axencia Española de Protección de Datos. Non se usa para analítica, publicidade nin perfís, e non se comparte co titular nin con terceiros.

O servidor de aloxamento non instala cookies neste sitio. Se no futuro se incorporase algún almacenamento non exento, solicitaríase o teu consentimento antes de utilizalo.

## 4. Como consultar e borrar o almacenamento

- **Un documento:** na pantalla de inicio, abre o menú ⋮ do documento e escolle *Quitar deste navegador*. Bórrase deste navegador; as copias dos teus colaboradores non se ven afectadas.
- **Credenciais de Nextcloud:** na conta de Nextcloud, *Pechar sesión*.
- **Todo:** na configuración do navegador, borra os datos do sitio (en Chrome e Edge, *Configuración → Privacidade e seguranza → Cookies e datos de sitios*; en Firefox, *Axustes → Privacidade e seguranza → Cookies e datos do sitio*; en Safari, *Axustes → Privacidade → Xestionar datos de sitios web*).

Atención: borrar os datos do sitio elimina os teus documentos deste dispositivo de forma irreversible. Descárgaos ou gárdaos en Nextcloud antes.

Na navegación privada ou de incógnito, o navegador borra todo este almacenamento ao pechar a xanela.

## 5. Máis información

Consulta a [Política de privacidade](privacy.md) para saber que datos existen e quen pode tratalos.
