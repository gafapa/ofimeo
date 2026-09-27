# Política de privacidad

{{siteName}} está diseñado para que el titular no reciba tus documentos ni tus datos: todo se guarda en tu dispositivo y se intercambia, cifrado, directamente con las personas con quienes compartes. Esta política explica qué datos existen, dónde están y quién puede tratarlos, conforme a los artículos 13 y 14 del Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD).

## 1. Información básica

| Epígrafe | Información |
| --- | --- |
| Responsable | {{owner.name}} (datos en el apartado 2) |
| Finalidad | Poner a disposición la aplicación web y proteger la seguridad del sitio. El titular no trata el contenido de los documentos. |
| Legitimación | Interés legítimo en la seguridad del sitio o, si el titular es una Administración pública, cumplimiento de una misión de interés público (art. 6.1.f o 6.1.e RGPD). |
| Destinatarios | Proveedor de alojamiento ({{hosting.provider}}). La colaboración se apoya en servicios de terceros que actúan bajo su propia responsabilidad (apartado 6). |
| Transferencias | Posibles transferencias a Estados Unidos y a otros países (apartado 9). |
| Derechos | Acceso, rectificación, supresión, oposición, limitación y portabilidad, y reclamación ante la Agencia Española de Protección de Datos (apartado 10). |
| Menores | Ver apartados 11 y 12 y la [Información para centros educativos](schools.md). |

## 2. Responsable del tratamiento

- Titular: {{owner.name}}
- NIF/CIF: {{owner.nif}}
- Domicilio: {{owner.address}}
- Correo electrónico para cuestiones de privacidad: {{privacyEmail}}
- Delegado de Protección de Datos: {{#if dpo.email}}{{dpo.name}}, {{dpo.email}}{{else}}no se ha designado, por no ser obligatorio para el titular (art. 37 RGPD y art. 34 LOPDGDD); las consultas sobre protección de datos se atienden en {{privacyEmail}}{{/if}}

Cuando un centro educativo, una Administración educativa u otra entidad publica su propia instalación de {{siteName}}, esa entidad es la responsable del tratamiento en su instalación y debe adaptar esta política con sus datos.

## 3. Cómo funciona {{siteName}} y qué datos recibe el titular

{{siteName}} es un sitio web estático: el servidor solo entrega los archivos de la aplicación, que después funciona en tu navegador, incluso sin conexión. No hay cuentas de usuario ni servidor de aplicación propio.

- **El titular no recibe** el contenido de los documentos, los comentarios, el historial de versiones, los nombres que escriben las personas usuarias, las claves de los enlaces ni las credenciales de servicios externos.
- **Lo único que llega a un servidor contratado por el titular** son los datos técnicos que cualquier navegador envía al descargar una página: dirección IP, fecha y hora, dirección solicitada, navegador y sistema operativo (user agent) y página de procedencia. Los registra el proveedor de alojamiento para servir el sitio y protegerlo frente a abusos.
- {{siteName}} no utiliza cookies, analítica, publicidad, perfiles ni decisiones automatizadas.

## 4. Datos que se guardan en tu dispositivo

La aplicación guarda en el almacenamiento de tu navegador (IndexedDB, localStorage y la caché del service worker) la información necesaria para funcionar. Esta información no se envía al titular. El detalle figura en la [Política de cookies y almacenamiento local](cookies.md).

| Información | Contenido | Quién puede verla |
| --- | --- | --- |
| Documentos | Texto, tablas, dibujos, imágenes, comentarios, sugerencias, historial de versiones y autoría (nombre y color de quien escribió cada parte) | Tú y las personas con las que compartes el documento |
| Índice de documentos | Títulos, fechas, claves de acceso de cada documento y, si lo vinculas, la ruta del archivo en Nextcloud | Solo tú |
| Tu identidad en la aplicación | El nombre que escribes y un color | Tú y tus colaboradores |
| Preferencias | Idioma, accesibilidad, ortografía, diccionario personal, zoom | Solo tú |
| Credenciales de Nextcloud (opcional) | Dirección del servidor, usuario y contraseña de aplicación | Solo tú; se envían únicamente a ese servidor |
| Copias de seguridad (opcional) | Archivos `.ofimeo-backup` que descargas, opcionalmente cifrados con contraseña, o que se guardan en tu Nextcloud si activas la copia automática | Quien tenga el archivo (y, si está cifrado, la contraseña) |
| Caché de la aplicación | Archivos del programa para usarlo sin conexión | No contiene datos personales |

En el uso personal o doméstico, este tratamiento lo realizas tú en tu propio dispositivo. En el uso escolar, corresponde al centro o a la Administración educativa (apartado 12).

## 5. Colaboración: qué ven otras personas

- **Enlaces para compartir.** Cada enlace contiene, después del signo `#`, las claves del documento. Los navegadores no envían esa parte del enlace a ningún servidor, pero cualquiera que tenga el enlace puede acceder al documento con el permiso que este otorga (editar, comentar, ver o hacer una copia). Trátalo como una contraseña.
- **Datos que reciben tus colaboradores:** el contenido del documento, sus comentarios, versiones y autoría, el nombre y el color que hayas elegido, tu presencia (cursor, selección, página o diapositiva que estás viendo) y, por la propia naturaleza de las conexiones directas, la dirección IP de tu conexión.
- **Transmisión.** Los datos viajan directamente entre navegadores por WebRTC, cifrados con DTLS; los mensajes para establecer la conexión se cifran con la clave del documento. Los cambios se firman digitalmente, de modo que solo quien tiene el permiso de edición puede modificar el documento.
- **Copias.** Cada participante conserva una copia completa del documento en su navegador. Borrar tu copia no borra las de los demás.
- Recomendación: usa tu nombre de pila, iniciales o un seudónimo y no incluyas en documentos compartidos datos especialmente sensibles (salud, datos de terceros, etc.).

## 6. Terceros que intervienen

| Servicio | Datos a los que accede | Papel | Ubicación |
| --- | --- | --- | --- |
| Alojamiento web: {{hosting.provider}} | Datos técnicos de la descarga (IP, fecha, dirección, navegador) | Encargado del tratamiento del titular o responsable independiente, según sus condiciones: {{hosting.privacyUrl}} | {{hosting.country}} |
| Relays públicos Nostr (señalización) | Dirección IP, momento de conexión, mensajes de señalización cifrados, un identificador de sala derivado del documento y claves públicas efímeras. No pueden leer los documentos | Terceros independientes, sin relación contractual con el titular | Distintos países, dentro y fuera del Espacio Económico Europeo |
| Servidores STUN (por defecto, Google LLC y Cloudflare, Inc.) | Dirección IP y puerto, para averiguar la dirección pública de tu conexión | Terceros independientes | Estados Unidos y otros países |
| Navegadores de tus colaboradores | Lo indicado en el apartado 5, incluida tu dirección IP | Personas usuarias | Donde se encuentren |
| Relay y servidor TURN del centro (opcional) | Dirección IP, momento de conexión, tráfico cifrado | El centro o la Administración que lo gestiona, como responsable | Según su instalación |
| Nextcloud (opcional) | Los archivos que abres o guardas y tus credenciales | La entidad que gestiona ese servidor | Según el servidor |
| Servidor LanguageTool (opcional, desactivado por defecto) | El texto de los párrafos que se revisan | La entidad que gestiona el servidor que indiques | Según el servidor |
| Dictado y lectura en voz alta del navegador | Según el navegador, el audio del dictado o el texto leído pueden enviarse al fabricante del navegador | El fabricante del navegador, según sus condiciones | Según el fabricante |
| Asistentes de IA mediante WebMCP (opcional, desactivado por defecto) | El contenido del documento abierto que el asistente lea o modifique | El proveedor del asistente que elijas, según sus condiciones. Ver la [Nota sobre inteligencia artificial](ai.md) | Según el proveedor |

Los relays públicos y los servidores STUN se usan porque {{siteName}} no tiene servidor propio. Se pueden sustituir por servidores propios añadiendo `?relays=wss://…` a la dirección, o usando el relay del centro.

## 7. Finalidades y bases jurídicas

| Tratamiento | Finalidad | Base jurídica |
| --- | --- | --- |
| Registros técnicos del alojamiento | Entregar la aplicación y proteger el sitio frente a ataques y abusos | Interés legítimo del titular (art. 6.1.f RGPD; considerando 49) o, si es una Administración pública, misión de interés público (art. 6.1.e) |
| Almacenamiento en tu dispositivo | Que la aplicación funcione y guarde tus documentos y preferencias | Lo realizas tú; en el ámbito escolar, lo determina el centro (apartado 12) |
| Colaboración con otras personas | Editar documentos en común | Tu decisión de compartir el enlace y, en el ámbito escolar, la función educativa (apartado 12) |
| Servicios opcionales (Nextcloud, LanguageTool, asistentes de IA) | Los que tú actives | Tu decisión de activarlos; el tratamiento lo realiza el proveedor del servicio bajo su responsabilidad |

## 8. Conservación

- Registros técnicos del alojamiento: durante el plazo que fije el proveedor para fines de seguridad, conforme a su política de privacidad.
- Datos en tu dispositivo: hasta que los borres (desde la pantalla de inicio o borrando los datos del sitio en el navegador). El historial de versiones y la autoría forman parte de cada documento y se conservan mientras se conserve el documento en algún navegador.
- Relays y servidores STUN/TURN: según la configuración de cada operador. Los mensajes de señalización son de uso momentáneo.

## 9. Destinatarios y transferencias internacionales

El titular no cede ni vende datos. El proveedor de alojamiento puede tratar los datos técnicos en {{hosting.country}}; la transferencia se ampara en {{hosting.transfers}} o en las garantías que establezcan sus condiciones.

Los relays públicos y los servidores STUN pueden estar fuera del Espacio Económico Europeo. Tu navegador se conecta a ellos directamente para encontrar a tus colaboradores; el titular no tiene relación contractual con sus operadores. Para evitar estas conexiones, utiliza un relay y un servidor TURN propios, ubicados en la Unión Europea (recomendado para centros educativos).

## 10. Tus derechos

Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad (arts. 15 a 22 RGPD) escribiendo a {{privacyEmail}}, indicando qué derecho ejerces y acreditando tu identidad. Responderemos en el plazo de un mes (art. 12.3 RGPD).

Ten en cuenta que el titular no dispone de tus documentos ni de los datos guardados en tu navegador: puedes consultarlos, descargarlos, corregirlos o borrarlos directamente en la aplicación. Para los datos de otros servicios (alojamiento, relays, Nextcloud, LanguageTool, asistentes de IA) puedes dirigirte también a sus responsables.

Si consideras que no se han atendido tus derechos, puedes presentar una reclamación ante la Agencia Española de Protección de Datos (C/ Jorge Juan, 6, 28001 Madrid, https://www.aepd.es). {{#if dpo.email}}Antes, si lo deseas, puedes dirigirte al Delegado de Protección de Datos ({{dpo.email}}).{{/if}}

## 11. Menores de edad

{{siteName}} se utiliza sobre todo en centros educativos y por menores de edad. Por eso:

- La aplicación no pide registro ni datos personales y el titular no recopila datos de las personas usuarias más allá de los registros técnicos del alojamiento.
- Los derechos de los menores de 14 años pueden ejercerlos sus madres, padres o tutores legales (art. 12.6 LOPDGDD). Cuando un servicio opcional de terceros requiera consentimiento, los menores de 14 años necesitan el de sus madres, padres o tutores (art. 7 LOPDGDD y art. 8 RGPD).
- Recomendamos que los menores usen solo los servicios opcionales (LanguageTool, asistentes de IA, dictado) bajo la supervisión del profesorado o de su familia y conforme a lo que decida su centro.
- No deben publicarse en documentos compartidos imágenes ni datos personales de otras personas sin su autorización o la de sus representantes (art. 92 LOPDGDD).

## 12. Uso en centros educativos

Cuando el profesorado o un centro utiliza {{siteName}} en su actividad docente, el responsable de los datos del alumnado tratados en esa actividad es el centro o la Administración educativa de la que depende, en el ejercicio de la función educativa (disposición adicional vigesimotercera de la Ley Orgánica 2/2006, de Educación, y art. 6.1.e RGPD). El titular de este sitio no accede a esos datos y, por tanto, no actúa como encargado del tratamiento respecto del contenido de los documentos.

Recomendamos a los centros incluir esta actividad en su registro de actividades de tratamiento (art. 30 RGPD y art. 31 LOPDGDD), informar a las familias y aplicar la configuración recomendada. Los centros que publiquen su propia instalación son responsables de ella. La [Información para centros educativos](schools.md) incluye un modelo de registro y un texto para las familias.

## 13. Seguridad

- **Cifrado de extremo a extremo** de la colaboración: los mensajes de conexión se cifran con la clave del documento, que solo está en el enlace, y los datos viajan por canales WebRTC cifrados (DTLS).
- **Firmas digitales (Ed25519)**: los cambios del documento y de los comentarios se firman y los demás navegadores rechazan los que no llevan una firma válida, de modo que un enlace de lectura o de comentario no permite editar.
- **Sin copia central**: no hay un servidor con los documentos de todas las personas usuarias que pueda sufrir una brecha.
- La aplicación se sirve por HTTPS y sus actualizaciones llegan del mismo sitio por HTTPS.
- La seguridad de tu dispositivo depende de ti: bloquea el equipo, no compartas el perfil del navegador y, en ordenadores compartidos, borra tus documentos y cierra la sesión de Nextcloud al terminar.
- Para comunicar una vulnerabilidad, consulta el archivo `/.well-known/security.txt` de este sitio.

## 14. Cambios en esta política

Podemos actualizar esta política para reflejar cambios en la aplicación o en la normativa. La versión vigente es la publicada en esta página, con su fecha de actualización. Si un cambio afecta de forma relevante al tratamiento de datos, lo indicaremos en la aplicación.
