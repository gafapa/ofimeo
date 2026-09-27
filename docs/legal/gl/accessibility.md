# Declaración de accesibilidade

{{owner.name}} comprométese a facer accesible {{siteName}} de conformidade co Real decreto 1112/2018, do 7 de setembro, sobre accesibilidade dos sitios web e aplicacións para dispositivos móbiles do sector público, que traspón a Directiva (UE) 2016/2102.

Esta declaración aplícase ao sitio web e aplicación {{siteName}} ({{siteUrl}}) e ás instalacións que se publiquen sen modificacións. {{#if accessibility.complaintBody}}{{else}}O titular non forma parte do sector público, polo que o Real decreto 1112/2018 non lle é de aplicación obrigatoria: esta declaración ofrécese voluntariamente e segue o seu modelo. Cando un centro educativo ou unha Administración pública publica a súa propia instalación, debe elaborar a súa propia declaración a partir desta.{{/if}}

## Situación de cumprimento

{{#if accessibility.status=full}}Este sitio web é **plenamente conforme** co Real decreto 1112/2018.{{/if}}{{#if accessibility.status=partial}}Este sitio web é **parcialmente conforme** co Real decreto 1112/2018 e coa norma UNE-EN 301 549:2022 (que incorpora o nivel AA das Pautas WCAG 2.1) debido á falta de conformidade dos aspectos que se indican a continuación.{{/if}}{{#if accessibility.status=none}}Este sitio web **non é conforme** co Real decreto 1112/2018. Os aspectos non accesibles indícanse a continuación.{{/if}}

A relación seguinte procede dunha revisión preliminar e está pendente de confirmar mediante unha auditoría completa coa metodoloxía da norma UNE-EN 301 549.

## Contido non accesible

### Falta de conformidade co Real decreto 1112/2018

- **Folla de cálculo.** A grade debúxase nun lenzo (canvas): os lectores de pantalla non poden percorrer as celas como unha táboa, e a ortografía do navegador non está dispoñible no editor de celas (WCAG 1.3.1, 4.1.2).
- **Debuxo.** O editor de debuxo funciona sobre un lenzo: as formas non se expoñen ás tecnoloxías de apoio, non teñen alternativa textual e a súa creación e edición requiren un dispositivo apuntador (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Diagramas e presentacións.** As formas e os conectores son gráficos SVG sen nome accesible completo; mover, conectar e redimensionar formas depende principalmente do rato ou da pantalla táctil (WCAG 1.1.1, 2.1.1, 4.1.2).
- **Procesador de textos.** As marcas de ortografía e gramática, a autoría por cores e os cursores doutras persoas móstranse só visualmente e non se anuncian aos lectores de pantalla (WCAG 1.3.1, 1.4.1, 4.1.3).
- **Colaboración.** A chegada de colaboradores, as súas seleccións e os cambios que realizan en tempo real non se comunican mediante mensaxes de estado accesibles (WCAG 4.1.3).
- **Editor de ecuacións e teclado virtual** (compoñente de terceiros): algúns controis non teñen nome accesible en todos os idiomas (WCAG 4.1.2).
- **Ficheiros xerados.** Os PDF creados coa función de imprimir do navegador poden non estar etiquetados, e as imaxes exportadas non inclúen texto alternativo (WCAG 1.1.1, 1.3.1).
- **Ditado e lectura en voz alta.** Dependen das funcións de voz do navegador e non están dispoñibles en todos os navegadores nin idiomas.

### Carga desproporcionada

Non se invoca.

### Contido que non entra no ámbito da lexislación aplicable

- Os documentos creados polas persoas usuarias e os ficheiros que abren, que son contidos de terceiros que non están baixo o control do titular.
- Os servizos e sitios de terceiros ligados ou utilizados opcionalmente (Nextcloud, LanguageTool, asistentes de intelixencia artificial).

## Preparación da presente declaración

- Data de elaboración: {{accessibility.preparedOn}}.
- Método: {{#if accessibility.method=audit}}auditoría externa{{else}}autoavaliación realizada polo titular{{/if}}.
{{#if accessibility.reviewedOn}}- Última revisión: {{accessibility.reviewedOn}}.
{{/if}}
## Funcións de accesibilidade dispoñibles

O botón *Accesibilidade* (ou `Alt+Maiús+A`) permite escoller tipos de letra de lectura (OpenDyslexic, Atkinson Hyperlegible), tamaño do texto, entreliñado e espazamento, temas escuros e de alto contraste, redución do movemento, punteiro grande, contorno de foco groso, regra e máscara de lectura, lectura en voz alta e ditado. A interface pódese usar co teclado (`F10` para a barra de menús) e inclúe unha ligazón para saltar ao contido.

## Observacións e datos de contacto

Podes realizar comunicacións sobre requisitos de accesibilidade (artigo 10.2.a do Real decreto 1112/2018), por exemplo:

- informar sobre calquera posible incumprimento por parte deste sitio web;
- transmitir outras dificultades de acceso ao contido;
- formular calquera outra consulta ou suxestión de mellora;
- solicitar información accesible sobre contidos excluídos do ámbito de aplicación ou declarados non accesibles,

escribindo a {{accessibility.contactEmail}}. As comunicacións responderanse no prazo máximo de vinte días hábiles.

## Procedemento de aplicación

{{#if accessibility.complaintBody}}Se, unha vez realizada unha solicitude de información accesible ou unha queixa, esta fose desestimada, non se estivese de acordo coa decisión adoptada ou a resposta non cumprise os requisitos do artigo 12.5 do Real decreto 1112/2018, a persoa interesada poderá iniciar unha reclamación ante {{accessibility.complaintBody}}, conforme ao artigo 13 do Real decreto 1112/2018 e á Lei 39/2015, do 1 de outubro, do procedemento administrativo común das administracións públicas.{{else}}Como o titular non forma parte do sector público, non existe un procedemento administrativo de reclamación fronte a el. Se a resposta non che resulta satisfactoria, podes volver dirixirte ao titular. Se utilizas {{siteName}} a través dun centro educativo público ou dunha Administración que publica a súa propia instalación, podes presentar a queixa ou reclamación ante a súa unidade responsable de accesibilidade (en Galicia, a da consellería competente en educación), conforme aos artigos 12 e 13 do Real decreto 1112/2018.{{/if}} O Observatorio de Accesibilidade Web da Administración xeral do Estado ofrece información sobre a accesibilidade do sector público.
