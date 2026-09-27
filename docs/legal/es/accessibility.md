# Declaración de accesibilidad

{{owner.name}} se compromete a hacer accesible {{siteName}} de conformidad con el Real Decreto 1112/2018, de 7 de septiembre, sobre accesibilidad de los sitios web y aplicaciones para dispositivos móviles del sector público, que transpone la Directiva (UE) 2016/2102.

Esta declaración se aplica al sitio web y aplicación {{siteName}} ({{siteUrl}}) y a las instalaciones que se publiquen sin modificaciones. {{#if accessibility.complaintBody}}{{else}}El titular no forma parte del sector público, por lo que el Real Decreto 1112/2018 no le es de aplicación obligatoria: esta declaración se ofrece voluntariamente y sigue su modelo. Cuando un centro educativo o una Administración pública publica su propia instalación, debe elaborar su propia declaración a partir de esta.{{/if}}

## Situación de cumplimiento

{{#if accessibility.status=full}}Este sitio web es **plenamente conforme** con el Real Decreto 1112/2018.{{/if}}{{#if accessibility.status=partial}}Este sitio web es **parcialmente conforme** con el Real Decreto 1112/2018 y con la norma UNE-EN 301 549:2022 (que incorpora el nivel AA de las Pautas WCAG 2.1) debido a la falta de conformidad de los aspectos que se indican a continuación.{{/if}}{{#if accessibility.status=none}}Este sitio web **no es conforme** con el Real Decreto 1112/2018. Los aspectos no accesibles se indican a continuación.{{/if}}

La relación siguiente procede de una revisión preliminar y está pendiente de confirmar mediante una auditoría completa con la metodología de la norma UNE-EN 301 549.

## Contenido no accesible

### Falta de conformidad con el Real Decreto 1112/2018

- **Hoja de cálculo.** La cuadrícula se dibuja en un lienzo (canvas): los lectores de pantalla no pueden recorrer las celdas como una tabla, y la ortografía del navegador no está disponible en el editor de celdas (WCAG 1.3.1, 4.1.2).
- **Dibujo.** El editor de dibujo funciona sobre un lienzo: las formas no se exponen a las tecnologías de apoyo, no tienen alternativa textual y su creación y edición requieren un dispositivo apuntador (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Diagramas y presentaciones.** Las formas y conectores son gráficos SVG sin nombre accesible completo; mover, conectar y redimensionar formas depende principalmente del ratón o de la pantalla táctil (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Procesador de textos.** Las marcas de ortografía y gramática, la autoría por colores y los cursores de otras personas se muestran solo visualmente y no se anuncian a los lectores de pantalla (WCAG 1.3.1, 1.4.1, 4.1.3).
- **Colaboración.** La llegada de colaboradores, sus selecciones y los cambios que realizan en tiempo real no se comunican mediante mensajes de estado accesibles (WCAG 4.1.3).
- **Editor de ecuaciones y teclado virtual** (componente de terceros): algunos controles no tienen nombre accesible en todos los idiomas (WCAG 4.1.2).
- **Archivos generados.** Los PDF creados con la función de imprimir del navegador pueden no estar etiquetados, y las imágenes exportadas no incluyen texto alternativo (WCAG 1.1.1, 1.3.1).
- **Dictado y lectura en voz alta.** Dependen de las funciones de voz del navegador y no están disponibles en todos los navegadores ni idiomas.

### Carga desproporcionada

No se invoca.

### Contenido que no entra en el ámbito de la legislación aplicable

- Los documentos creados por las personas usuarias y los archivos que abren, que son contenidos de terceros que no están bajo el control del titular.
- Los servicios y sitios de terceros enlazados o utilizados opcionalmente (Nextcloud, LanguageTool, asistentes de inteligencia artificial).

## Preparación de la presente declaración

- Fecha de elaboración: {{accessibility.preparedOn}}.
- Método: {{#if accessibility.method=audit}}auditoría externa{{else}}autoevaluación realizada por el titular{{/if}}.
{{#if accessibility.reviewedOn}}- Última revisión: {{accessibility.reviewedOn}}.
{{/if}}
## Funciones de accesibilidad disponibles

El botón *Accesibilidad* (o `Alt+Mayús+A`) permite elegir tipos de letra de lectura (OpenDyslexic, Atkinson Hyperlegible), tamaño del texto, interlineado y espaciado, temas oscuros y de alto contraste, reducción del movimiento, puntero grande, contorno de foco grueso, regla y máscara de lectura, lectura en voz alta y dictado. La interfaz se puede usar con el teclado (`F10` para la barra de menús) e incluye un enlace para saltar al contenido.

## Observaciones y datos de contacto

Puedes realizar comunicaciones sobre requisitos de accesibilidad (artículo 10.2.a del Real Decreto 1112/2018), por ejemplo:

- informar sobre cualquier posible incumplimiento por parte de este sitio web;
- transmitir otras dificultades de acceso al contenido;
- formular cualquier otra consulta o sugerencia de mejora;
- solicitar información accesible sobre contenidos excluidos del ámbito de aplicación o declarados no accesibles,

escribiendo a {{accessibility.contactEmail}}. Las comunicaciones se responderán en el plazo máximo de veinte días hábiles.

## Procedimiento de aplicación

{{#if accessibility.complaintBody}}Si, una vez realizada una solicitud de información accesible o una queja, esta hubiera sido desestimada, no se estuviera de acuerdo con la decisión adoptada o la respuesta no cumpliera los requisitos del artículo 12.5 del Real Decreto 1112/2018, la persona interesada podrá iniciar una reclamación ante {{accessibility.complaintBody}}, conforme al artículo 13 del Real Decreto 1112/2018 y a la Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común de las Administraciones Públicas.{{else}}Como el titular no forma parte del sector público, no existe un procedimiento administrativo de reclamación frente a él. Si la respuesta no te resulta satisfactoria, puedes volver a dirigirte al titular. Si utilizas {{siteName}} a través de un centro educativo público o de una Administración que publica su propia instalación, puedes presentar la queja o reclamación ante su unidad responsable de accesibilidad (en Galicia, la de la Consellería competente en educación), conforme a los artículos 12 y 13 del Real Decreto 1112/2018.{{/if}} El Observatorio de Accesibilidad Web de la Administración General del Estado ofrece información sobre la accesibilidad del sector público.
