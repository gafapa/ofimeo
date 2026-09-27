# Política de privacidade

{{siteName}} está deseñado para que o titular non reciba os teus documentos nin os teus datos: todo se garda no teu dispositivo e se intercambia, cifrado, directamente coas persoas coas que compartes. Esta política explica que datos existen, onde están e quen pode tratalos, conforme aos artigos 13 e 14 do Regulamento (UE) 2016/679 (RXPD) e á Lei orgánica 3/2018 (LOPDGDD).

## 1. Información básica

| Epígrafe | Información |
| --- | --- |
| Responsable | {{owner.name}} (datos no apartado 2) |
| Finalidade | Pór á disposición a aplicación web e protexer a seguranza do sitio. O titular non trata o contido dos documentos. |
| Lexitimación | Interese lexítimo na seguranza do sitio ou, se o titular é unha Administración pública, cumprimento dunha misión de interese público (art. 6.1.f ou 6.1.e RXPD). |
| Destinatarios | Provedor de aloxamento ({{hosting.provider}}). A colaboración apóiase en servizos de terceiros que actúan baixo a súa propia responsabilidade (apartado 6). |
| Transferencias | Posibles transferencias aos Estados Unidos e a outros países (apartado 9). |
| Dereitos | Acceso, rectificación, supresión, oposición, limitación e portabilidade, e reclamación ante a Axencia Española de Protección de Datos (apartado 10). |
| Menores | Ver os apartados 11 e 12 e a [Información para centros educativos](schools.md). |

## 2. Responsable do tratamento

- Titular: {{owner.name}}
- NIF/CIF: {{owner.nif}}
- Domicilio: {{owner.address}}
- Correo electrónico para cuestións de privacidade: {{privacyEmail}}
- Delegado de Protección de Datos: {{#if dpo.email}}{{dpo.name}}, {{dpo.email}}{{else}}non se designou, por non ser obrigatorio para o titular (art. 37 RXPD e art. 34 LOPDGDD); as consultas sobre protección de datos atenderanse en {{privacyEmail}}{{/if}}

Cando un centro educativo, unha Administración educativa ou outra entidade publica a súa propia instalación de {{siteName}}, esa entidade é a responsable do tratamento na súa instalación e debe adaptar esta política cos seus datos.

## 3. Como funciona {{siteName}} e que datos recibe o titular

{{siteName}} é un sitio web estático: o servidor só entrega os ficheiros da aplicación, que despois funciona no teu navegador, mesmo sen conexión. Non hai contas de usuario nin servidor de aplicación propio.

- **O titular non recibe** o contido dos documentos, os comentarios, o historial de versións, os nomes que escriben as persoas usuarias, as claves das ligazóns nin as credenciais de servizos externos.
- **O único que chega a un servidor contratado polo titular** son os datos técnicos que calquera navegador envía ao descargar unha páxina: enderezo IP, data e hora, enderezo solicitado, navegador e sistema operativo (user agent) e páxina de procedencia. Rexístraos o provedor de aloxamento para servir o sitio e protexelo fronte a abusos.
- {{siteName}} non utiliza cookies, analítica, publicidade, perfís nin decisións automatizadas.

## 4. Datos que se gardan no teu dispositivo

A aplicación garda no almacenamento do teu navegador (IndexedDB, localStorage e a caché do service worker) a información necesaria para funcionar. Esta información non se envía ao titular. O detalle figura na [Política de cookies e almacenamento local](cookies.md).

| Información | Contido | Quen pode vela |
| --- | --- | --- |
| Documentos | Texto, táboas, debuxos, imaxes, comentarios, suxestións, historial de versións e autoría (nome e cor de quen escribiu cada parte) | Ti e as persoas coas que compartes o documento |
| Índice de documentos | Títulos, datas, claves de acceso de cada documento e, se o vinculas, a ruta do ficheiro en Nextcloud | Só ti |
| A túa identidade na aplicación | O nome que escribes e unha cor | Ti e os teus colaboradores |
| Preferencias | Idioma, accesibilidade, ortografía, dicionario persoal, zoom | Só ti |
| Credenciais de Nextcloud (opcional) | Enderezo do servidor, usuario e contrasinal de aplicación | Só ti; envíanse unicamente a ese servidor |
| Copias de seguranza (opcional) | Ficheiros `.ofimeo-backup` que descargas, opcionalmente cifrados con contrasinal, ou que se gardan no teu Nextcloud se activas a copia automática | Quen teña o ficheiro (e, se está cifrado, o contrasinal) |
| Caché da aplicación | Ficheiros do programa para usalo sen conexión | Non contén datos persoais |

No uso persoal ou doméstico, este tratamento realízalo ti no teu propio dispositivo. No uso escolar, correspóndelle ao centro ou á Administración educativa (apartado 12).

## 5. Colaboración: que ven outras persoas

- **Ligazóns para compartir.** Cada ligazón contén, despois do signo `#`, as claves do documento. Os navegadores non envían esa parte da ligazón a ningún servidor, pero calquera que teña a ligazón pode acceder ao documento co permiso que esta outorga (editar, comentar, ver ou facer unha copia). Trátaa como un contrasinal.
- **Datos que reciben os teus colaboradores:** o contido do documento, os seus comentarios, versións e autoría, o nome e a cor que escolliches, a túa presenza (cursor, selección, páxina ou diapositiva que estás a ver) e, pola propia natureza das conexións directas, o enderezo IP da túa conexión.
- **Transmisión.** Os datos viaxan directamente entre navegadores por WebRTC, cifrados con DTLS; as mensaxes para establecer a conexión cífranse coa clave do documento. Os cambios asínanse dixitalmente, de modo que só quen ten o permiso de edición pode modificar o documento.
- **Copias.** Cada participante conserva unha copia completa do documento no seu navegador. Borrar a túa copia non borra as dos demais.
- Recomendación: usa o teu nome de pía, iniciais ou un pseudónimo e non inclúas en documentos compartidos datos especialmente sensibles (saúde, datos de terceiros etc.).

## 6. Terceiros que interveñen

| Servizo | Datos aos que accede | Papel | Localización |
| --- | --- | --- | --- |
| Aloxamento web: {{hosting.provider}} | Datos técnicos da descarga (IP, data, enderezo, navegador) | Encargado do tratamento do titular ou responsable independente, segundo as súas condicións: {{hosting.privacyUrl}} | {{hosting.country}} |
| Relays públicos Nostr (sinalización) | Enderezo IP, momento de conexión, mensaxes de sinalización cifradas, un identificador de sala derivado do documento e claves públicas efémeras. Non poden ler os documentos | Terceiros independentes, sen relación contractual co titular | Distintos países, dentro e fóra do Espazo Económico Europeo |
| Servidores STUN (por defecto, Google LLC e Cloudflare, Inc.) | Enderezo IP e porto, para descubrir o enderezo público da túa conexión | Terceiros independentes | Estados Unidos e outros países |
| Navegadores dos teus colaboradores | O indicado no apartado 5, incluído o teu enderezo IP | Persoas usuarias | Onde se atopen |
| Relay e servidor TURN do centro (opcional) | Enderezo IP, momento de conexión, tráfico cifrado | O centro ou a Administración que o xestiona, como responsable | Segundo a súa instalación |
| Nextcloud (opcional) | Os ficheiros que abres ou gardas e as túas credenciais | A entidade que xestiona ese servidor | Segundo o servidor |
| Servidor LanguageTool (opcional, desactivado por defecto) | O texto dos parágrafos que se revisan | A entidade que xestiona o servidor que indiques | Segundo o servidor |
| Ditado e lectura en voz alta do navegador | Segundo o navegador, o audio do ditado ou o texto lido poden enviarse ao fabricante do navegador | O fabricante do navegador, segundo as súas condicións | Segundo o fabricante |
| Asistentes de IA mediante WebMCP (opcional, desactivado por defecto) | O contido do documento aberto que o asistente lea ou modifique | O provedor do asistente que escollas, segundo as súas condicións. Ver a [Nota sobre intelixencia artificial](ai.md) | Segundo o provedor |

Os relays públicos e os servidores STUN úsanse porque {{siteName}} non ten servidor propio. Pódense substituír por servidores propios engadindo `?relays=wss://…` ao enderezo, ou usando o relay do centro.

## 7. Finalidades e bases xurídicas

| Tratamento | Finalidade | Base xurídica |
| --- | --- | --- |
| Rexistros técnicos do aloxamento | Entregar a aplicación e protexer o sitio fronte a ataques e abusos | Interese lexítimo do titular (art. 6.1.f RXPD; considerando 49) ou, se é unha Administración pública, misión de interese público (art. 6.1.e) |
| Almacenamento no teu dispositivo | Que a aplicación funcione e garde os teus documentos e preferencias | Realízalo ti; no ámbito escolar, determínao o centro (apartado 12) |
| Colaboración con outras persoas | Editar documentos en común | A túa decisión de compartir a ligazón e, no ámbito escolar, a función educativa (apartado 12) |
| Servizos opcionais (Nextcloud, LanguageTool, asistentes de IA) | Os que ti actives | A túa decisión de activalos; o tratamento realízao o provedor do servizo baixo a súa responsabilidade |

## 8. Conservación

- Rexistros técnicos do aloxamento: durante o prazo que fixe o provedor para fins de seguranza, conforme á súa política de privacidade.
- Datos no teu dispositivo: ata que os borres (desde a pantalla de inicio ou borrando os datos do sitio no navegador). O historial de versións e a autoría forman parte de cada documento e consérvanse mentres se conserve o documento nalgún navegador.
- Relays e servidores STUN/TURN: segundo a configuración de cada operador. As mensaxes de sinalización son de uso momentáneo.

## 9. Destinatarios e transferencias internacionais

O titular non cede nin vende datos. O provedor de aloxamento pode tratar os datos técnicos en {{hosting.country}}; a transferencia ampárase en {{hosting.transfers}} ou nas garantías que establezan as súas condicións.

Os relays públicos e os servidores STUN poden estar fóra do Espazo Económico Europeo. O teu navegador conéctase a eles directamente para atopar os teus colaboradores; o titular non ten relación contractual cos seus operadores. Para evitar estas conexións, utiliza un relay e un servidor TURN propios, situados na Unión Europea (recomendado para centros educativos).

## 10. Os teus dereitos

Podes exercer os dereitos de acceso, rectificación, supresión, oposición, limitación do tratamento e portabilidade (arts. 15 a 22 RXPD) escribindo a {{privacyEmail}}, indicando que dereito exerces e acreditando a túa identidade. Responderemos no prazo dun mes (art. 12.3 RXPD).

Ten en conta que o titular non dispón dos teus documentos nin dos datos gardados no teu navegador: podes consultalos, descargalos, corrixilos ou borralos directamente na aplicación. Para os datos doutros servizos (aloxamento, relays, Nextcloud, LanguageTool, asistentes de IA) podes dirixirte tamén aos seus responsables.

Se consideras que non se atenderon os teus dereitos, podes presentar unha reclamación ante a Axencia Española de Protección de Datos (C/ Jorge Juan, 6, 28001 Madrid, https://www.aepd.es). {{#if dpo.email}}Antes, se o desexas, podes dirixirte ao delegado de protección de datos ({{dpo.email}}).{{/if}}

## 11. Menores de idade

{{siteName}} utilízase sobre todo en centros educativos e por menores de idade. Por iso:

- A aplicación non pide rexistro nin datos persoais e o titular non recolle datos das persoas usuarias máis alá dos rexistros técnicos do aloxamento.
- Os dereitos dos menores de 14 anos poden exercelos as súas nais, pais ou titores legais (art. 12.6 LOPDGDD). Cando un servizo opcional de terceiros requira consentimento, os menores de 14 anos necesitan o das súas nais, pais ou titores (art. 7 LOPDGDD e art. 8 RXPD).
- Recomendamos que os menores usen só os servizos opcionais (LanguageTool, asistentes de IA, ditado) baixo a supervisión do profesorado ou da súa familia e conforme ao que decida o seu centro.
- Non deben publicarse en documentos compartidos imaxes nin datos persoais doutras persoas sen a súa autorización ou a dos seus representantes (art. 92 LOPDGDD).

## 12. Uso en centros educativos

Cando o profesorado ou un centro utiliza {{siteName}} na súa actividade docente, o responsable dos datos do alumnado tratados nesa actividade é o centro ou a Administración educativa da que depende, no exercicio da función educativa (disposición adicional vixésimo terceira da Lei orgánica 2/2006, de educación, e art. 6.1.e RXPD). O titular deste sitio non accede a eses datos e, polo tanto, non actúa como encargado do tratamento respecto do contido dos documentos.

Recomendámoslles aos centros incluír esta actividade no seu rexistro de actividades de tratamento (art. 30 RXPD e art. 31 LOPDGDD), informar as familias e aplicar a configuración recomendada. Os centros que publiquen a súa propia instalación son responsables dela. A [Información para centros educativos](schools.md) inclúe un modelo de rexistro e un texto para as familias.

## 13. Seguranza

- **Cifrado de extremo a extremo** da colaboración: as mensaxes de conexión cífranse coa clave do documento, que só está na ligazón, e os datos viaxan por canles WebRTC cifradas (DTLS).
- **Sinaturas dixitais (Ed25519)**: os cambios do documento e dos comentarios asínanse e os demais navegadores rexeitan os que non levan unha sinatura válida, de modo que unha ligazón de lectura ou de comentario non permite editar.
- **Sen copia central**: non hai un servidor cos documentos de todas as persoas usuarias que poida sufrir unha brecha.
- A aplicación sérvese por HTTPS e as súas actualizacións chegan do mesmo sitio por HTTPS.
- A seguranza do teu dispositivo depende de ti: bloquea o equipo, non compartas o perfil do navegador e, en ordenadores compartidos, borra os teus documentos e pecha a sesión de Nextcloud ao rematar.
- Para comunicar unha vulnerabilidade, consulta o ficheiro `/.well-known/security.txt` deste sitio.

## 14. Cambios nesta política

Podemos actualizar esta política para reflectir cambios na aplicación ou na normativa. A versión vixente é a publicada nesta páxina, coa súa data de actualización. Se un cambio afecta de forma relevante ao tratamento de datos, indicarémolo na aplicación.
