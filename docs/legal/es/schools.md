# Información para centros educativos

Guía para equipos directivos, coordinación TIC y delegados de protección de datos (DPD) de los centros y Administraciones educativas que quieran usar {{siteName}}: qué datos se tratan, dónde están, quién es responsable, qué riesgos hay y cómo configurarlo. Incluye un modelo de entrada para el registro de actividades de tratamiento y un texto informativo para las familias.

## 1. Resumen para la dirección

- {{siteName}} es una aplicación web estática: no tiene cuentas, ni servidor de aplicación, ni base de datos central. El titular del sitio no recibe los documentos ni los datos del alumnado.
- Los documentos se guardan en el navegador de cada dispositivo y se sincronizan directamente entre los navegadores de quienes colaboran, cifrados de extremo a extremo.
- Para que los navegadores se encuentren se usan, por defecto, relays Nostr públicos y servidores STUN de terceros, que ven direcciones IP y mensajes de conexión cifrados, pero no el contenido. El centro puede sustituirlos por su propio relay.
- Las funciones que envían datos a terceros (LanguageTool, asistentes de IA mediante WebMCP) están desactivadas por defecto. El dictado depende del navegador.
- En la actividad docente, el responsable del tratamiento es el centro o la Administración educativa (disposición adicional vigesimotercera de la Ley Orgánica 2/2006, de Educación, y art. 6.1.e RGPD).

## 2. Flujos de datos

```text
 Navegador del alumno ◄── WebRTC cifrado (DTLS), directo ──► Navegador del docente
        │                                                          │
        ├── Señalización cifrada ──► relays Nostr (públicos o del centro)
        ├── Consulta de dirección IP ──► servidores STUN/TURN (públicos o del centro)
        ├── Descarga de la aplicación ──► servidor web (GitHub Pages o del centro)
        └── Opcional: Nextcloud del centro · LanguageTool · asistente de IA
```

| Dato | Dónde se guarda | Quién accede | Observaciones |
| --- | --- | --- | --- |
| Contenido de documentos, comentarios, versiones y autoría | Navegador de cada participante (IndexedDB) | Participantes con el enlace | No pasa por ningún servidor del titular |
| Nombre o seudónimo y color | Navegador; se envía a los colaboradores | Participantes | Recomendable usar nombre de pila, iniciales o seudónimo |
| Dirección IP | No se guarda en la aplicación | Otros participantes, relays, servidores STUN/TURN, servidor web | Inherente a las conexiones directas |
| Claves de acceso | En los enlaces (tras `#`) y en el navegador | Quien tenga el enlace | Los enlaces equivalen a contraseñas |
| Credenciales de Nextcloud | Navegador (localStorage) | Solo el navegador y el servidor Nextcloud | Usar contraseñas de aplicación, nunca la principal |
| Texto revisado por LanguageTool | Servidor LanguageTool configurado | Operador del servidor | Desactivado por defecto |
| Contenido leído por un asistente de IA | Proveedor del asistente | Proveedor | Desactivado por defecto |

## 3. Papel de cada parte

| Parte | Papel en protección de datos |
| --- | --- |
| Centro o Administración educativa | Responsable del tratamiento de los datos del alumnado y del profesorado en la actividad docente. Decide el uso, la configuración y las normas. |
| Profesorado | Actúa por cuenta del centro, siguiendo sus instrucciones. |
| Titular de este sitio ({{owner.name}}) | Pone a disposición el programa. No accede al contenido de los documentos, por lo que no es encargado del tratamiento respecto de ellos. Es responsable únicamente de los registros técnicos del alojamiento web. |
| Centro que publica su propia instalación | Responsable también del servidor web, de sus registros y de los textos legales de su instalación. |
| Operador del relay y TURN del centro | El centro o la Administración, como responsable (o su proveedor, como encargado). |
| Relays públicos y servidores STUN | Terceros independientes, sin contrato con el titular ni con el centro. Se recomienda sustituirlos. |
| Nextcloud, LanguageTool, asistentes de IA | La entidad que presta cada servicio, según el contrato o las condiciones que el centro tenga con ella. |

## 4. Modelo de entrada en el registro de actividades de tratamiento

Modelo orientativo para el registro previsto en el artículo 30 del RGPD y el artículo 31 de la LOPDGDD. Debe adaptarlo el DPD del centro o de la Administración.

| Campo | Contenido propuesto |
| --- | --- |
| Actividad de tratamiento | Elaboración y edición colaborativa de documentos didácticos con {{siteName}} |
| Responsable | [Centro educativo / Consellería u órgano titular], con sus datos de contacto |
| Delegado de Protección de Datos | [Datos del DPD del centro o de la Administración educativa] |
| Finalidad | Realización de actividades de enseñanza y aprendizaje: redacción, corrección, comentario y entrega de trabajos; trabajo en grupo |
| Base jurídica | Art. 6.1.e RGPD (misión de interés público) en relación con la disposición adicional vigesimotercera de la Ley Orgánica 2/2006, de Educación |
| Categorías de interesados | Alumnado, profesorado |
| Categorías de datos | Nombre o seudónimo; contenido de trabajos y comentarios; correcciones y valoraciones; historial de versiones y autoría; dirección IP de conexión. No deben incluirse categorías especiales de datos |
| Destinatarios | Otros participantes del documento; operadores de relays y servidores STUN/TURN (públicos o del centro); servidor Nextcloud del centro, si se usa. No se prevén cesiones |
| Transferencias internacionales | Ninguna si se usan relay, TURN y servidor web propios en la UE; en otro caso, posibles transferencias a relays públicos y servidores STUN fuera del EEE |
| Plazo de supresión | El que fije el centro (por ejemplo, al finalizar el curso o el plazo de reclamación de las calificaciones); los documentos se borran de cada dispositivo |
| Medidas de seguridad | Cifrado de extremo a extremo; firma digital de los cambios; enlaces con permisos (editar, comentar, ver); dispositivos con cuentas individuales; medidas del Esquema Nacional de Seguridad (Real Decreto 311/2022) en los servidores propios |

## 5. Riesgos y medidas

| Riesgo | Medidas recomendadas |
| --- | --- |
| Terceros ven las direcciones IP y los horarios de conexión | Usar el relay y el servidor TURN del centro y el parámetro `?relay=` en los enlaces |
| Un enlace llega a personas no autorizadas | Compartir enlaces por los canales oficiales (aula virtual); dar al alumnado enlaces de ver o comentar cuando baste; si se filtra, *Archivo → Hacer una copia* y dejar de usar el original |
| Pérdida de trabajos guardados solo en el navegador | Usar Nextcloud del centro, la función *Entregar* y descargas periódicas; instalar la aplicación |
| Dispositivos compartidos (aulas de informática, carros de portátiles) | Cuentas o perfiles de navegador individuales; quitar los documentos y cerrar la sesión de Nextcloud al terminar |
| Exposición de datos personales del alumnado | Usar nombres de pila, iniciales o seudónimos; no tratar datos de salud, informes psicopedagógicos o de necesidades educativas en documentos compartidos, sino en los sistemas oficiales |
| Servicios opcionales que envían contenido a terceros | Mantener desactivados LanguageTool y los asistentes de IA, o usar servidores del centro; valorar el dictado del navegador |
| Menores de 14 años y servicios de terceros | No activar servicios que requieran su consentimiento sin el de sus familias (art. 7 LOPDGDD) |

El DPD debe valorar si es necesaria una evaluación de impacto (art. 35 RGPD y lista de tratamientos de la AEPD), especialmente si se activan servicios de terceros o se usa de forma generalizada con menores.

## 6. Configuración recomendada

1. **Servidor propio.** Publicar {{siteName}} en un servidor del centro o de la Consellería (idealmente en la misma dirección que Nextcloud) y adaptar los textos legales de esa instalación (archivo `legal.config.json`).
2. **Relay del centro.** Instalar el relay de {{siteName}} (Nostr + STUN/TURN) en la red del centro y usar enlaces con `?relay=https://relay.centro.example`, para no depender de relays públicos.
3. **Nextcloud del centro** para abrir, guardar y entregar trabajos.
4. **LanguageTool desactivado**, o apuntando a un servidor del centro o de la Administración.
5. **Asistentes de IA (WebMCP) desactivados.** Si se usan, solo con proveedores contratados por la Administración, sin datos personales del alumnado y con las precauciones de la [Nota sobre inteligencia artificial](ai.md).
6. **Dictado.** Informar de que, en algunos navegadores, el audio lo procesa el fabricante del navegador; usarlo solo cuando sea necesario.
7. **Registro e información.** Incluir el tratamiento en el registro de actividades e informar a las familias (apartado 7).
8. **Formación** del profesorado y del alumnado sobre el uso seguro de los enlaces y la competencia digital (art. 83 LOPDGDD).

## 7. Texto modelo de información a las familias

> **Información sobre el uso de la aplicación {{siteName}}**
>
> El centro [nombre del centro] utiliza en sus actividades de enseñanza la aplicación {{siteName}}, que permite al alumnado y al profesorado crear y editar documentos en común desde el navegador.
>
> **Responsable:** [centro educativo / Consellería], [dirección y correo]. **Delegado de Protección de Datos:** [contacto].
>
> **Finalidad y base jurídica:** realización de actividades educativas, en ejercicio de la función educativa (art. 6.1.e RGPD y disposición adicional vigesimotercera de la Ley Orgánica 2/2006, de Educación).
>
> **Datos:** nombre o seudónimo del alumno o alumna, trabajos y comentarios, historial de cambios y dirección IP de conexión.
>
> **Dónde se guardan:** en los dispositivos que se usan en clase y en el Nextcloud del centro, si se utiliza. La aplicación no tiene servidor central y su titular no recibe los documentos. Para conectar los dispositivos se utiliza [el servidor del centro / servidores públicos de terceros, que conocen la dirección IP pero no el contenido].
>
> **Destinatarios:** el profesorado y los compañeros y compañeras con quienes se comparte cada documento. No se ceden datos a terceros.
>
> **Conservación:** [hasta el final del curso / plazo que fije el centro].
>
> **Derechos:** pueden ejercer los derechos de acceso, rectificación, supresión, oposición y limitación ante el centro ([correo]) y presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).
>
> **Uso en casa:** los documentos se guardan en el navegador del dispositivo. Recomendamos no usar el nombre completo en documentos compartidos, no compartir los enlaces fuera del grupo y no activar servicios externos (corrector en línea, asistentes de inteligencia artificial) sin supervisión.

## 8. Normativa de referencia

- Reglamento (UE) 2016/679, General de Protección de Datos (RGPD).
- Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD): arts. 7 (menores), 12.6, 31, 34, 83 (educación digital), 84 (protección de menores en Internet) y 92.
- Ley Orgánica 2/2006, de Educación, modificada por la Ley Orgánica 3/2020 (LOMLOE): disposición adicional vigesimotercera.
- Real Decreto 311/2022, Esquema Nacional de Seguridad.
- Real Decreto 1112/2018, sobre accesibilidad de los sitios web y aplicaciones móviles del sector público.
- Reglamento (UE) 2024/1689, de Inteligencia Artificial.
- Agencia Española de Protección de Datos: guías para centros educativos (https://www.aepd.es).
