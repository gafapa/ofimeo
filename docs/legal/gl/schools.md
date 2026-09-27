# Información para centros educativos

Guía para equipos directivos, coordinación TIC e delegados de protección de datos (DPD) dos centros e administracións educativas que queiran usar {{siteName}}: que datos se tratan, onde están, quen é responsable, que riscos hai e como configuralo. Inclúe un modelo de entrada para o rexistro de actividades de tratamento e un texto informativo para as familias.

## 1. Resumo para a dirección

- {{siteName}} é unha aplicación web estática: non ten contas, nin servidor de aplicación, nin base de datos central. O titular do sitio non recibe os documentos nin os datos do alumnado.
- Os documentos gárdanse no navegador de cada dispositivo e sincronízanse directamente entre os navegadores de quen colabora, cifrados de extremo a extremo.
- Para que os navegadores se atopen úsanse, por defecto, relays Nostr públicos e servidores STUN de terceiros, que ven enderezos IP e mensaxes de conexión cifradas, pero non o contido. O centro pode substituílos polo seu propio relay.
- As funcións que envían datos a terceiros (LanguageTool, asistentes de IA mediante WebMCP) están desactivadas por defecto. O ditado depende do navegador.
- Na actividade docente, o responsable do tratamento é o centro ou a Administración educativa (disposición adicional vixésimo terceira da Lei orgánica 2/2006, de educación, e art. 6.1.e RXPD).

## 2. Fluxos de datos

```text
 Navegador do alumno ◄── WebRTC cifrado (DTLS), directo ──► Navegador do docente
        │                                                         │
        ├── Sinalización cifrada ──► relays Nostr (públicos ou do centro)
        ├── Consulta de enderezo IP ──► servidores STUN/TURN (públicos ou do centro)
        ├── Descarga da aplicación ──► servidor web (GitHub Pages ou do centro)
        └── Opcional: Nextcloud do centro · LanguageTool · asistente de IA
```

| Dato | Onde se garda | Quen accede | Observacións |
| --- | --- | --- | --- |
| Contido de documentos, comentarios, versións e autoría | Navegador de cada participante (IndexedDB) | Participantes coa ligazón | Non pasa por ningún servidor do titular |
| Nome ou pseudónimo e cor | Navegador; envíase aos colaboradores | Participantes | Recomendable usar nome de pía, iniciais ou pseudónimo |
| Enderezo IP | Non se garda na aplicación | Outros participantes, relays, servidores STUN/TURN, servidor web | Inherente ás conexións directas |
| Claves de acceso | Nas ligazóns (tras `#`) e no navegador | Quen teña a ligazón | As ligazóns equivalen a contrasinais |
| Credenciais de Nextcloud | Navegador (localStorage) | Só o navegador e o servidor Nextcloud | Usar contrasinais de aplicación, nunca o principal |
| Texto revisado por LanguageTool | Servidor LanguageTool configurado | Operador do servidor | Desactivado por defecto |
| Contido lido por un asistente de IA | Provedor do asistente | Provedor | Desactivado por defecto |

## 3. Papel de cada parte

| Parte | Papel en protección de datos |
| --- | --- |
| Centro ou Administración educativa | Responsable do tratamento dos datos do alumnado e do profesorado na actividade docente. Decide o uso, a configuración e as normas. |
| Profesorado | Actúa por conta do centro, seguindo as súas instrucións. |
| Titular deste sitio ({{owner.name}}) | Pon á disposición o programa. Non accede ao contido dos documentos, polo que non é encargado do tratamento respecto deles. É responsable unicamente dos rexistros técnicos do aloxamento web. |
| Centro que publica a súa propia instalación | Responsable tamén do servidor web, dos seus rexistros e dos textos legais da súa instalación. |
| Operador do relay e TURN do centro | O centro ou a Administración, como responsable (ou o seu provedor, como encargado). |
| Relays públicos e servidores STUN | Terceiros independentes, sen contrato co titular nin co centro. Recoméndase substituílos. |
| Nextcloud, LanguageTool, asistentes de IA | A entidade que presta cada servizo, segundo o contrato ou as condicións que o centro teña con ela. |

## 4. Modelo de entrada no rexistro de actividades de tratamento

Modelo orientativo para o rexistro previsto no artigo 30 do RXPD e no artigo 31 da LOPDGDD. Debe adaptalo o DPD do centro ou da Administración.

| Campo | Contido proposto |
| --- | --- |
| Actividade de tratamento | Elaboración e edición colaborativa de documentos didácticos con {{siteName}} |
| Responsable | [Centro educativo / Consellería ou órgano titular], cos seus datos de contacto |
| Delegado de Protección de Datos | [Datos do DPD do centro ou da Administración educativa] |
| Finalidade | Realización de actividades de ensino e aprendizaxe: redacción, corrección, comentario e entrega de traballos; traballo en grupo |
| Base xurídica | Art. 6.1.e RXPD (misión de interese público) en relación coa disposición adicional vixésimo terceira da Lei orgánica 2/2006, de educación |
| Categorías de interesados | Alumnado, profesorado |
| Categorías de datos | Nome ou pseudónimo; contido de traballos e comentarios; correccións e valoracións; historial de versións e autoría; enderezo IP de conexión. Non deben incluírse categorías especiais de datos |
| Destinatarios | Outros participantes do documento; operadores de relays e servidores STUN/TURN (públicos ou do centro); servidor Nextcloud do centro, se se usa. Non se prevén cesións |
| Transferencias internacionais | Ningunha se se usan relay, TURN e servidor web propios na UE; noutro caso, posibles transferencias a relays públicos e servidores STUN fóra do EEE |
| Prazo de supresión | O que fixe o centro (por exemplo, ao finalizar o curso ou o prazo de reclamación das cualificacións); os documentos bórranse de cada dispositivo |
| Medidas de seguranza | Cifrado de extremo a extremo; sinatura dixital dos cambios; ligazóns con permisos (editar, comentar, ver); dispositivos con contas individuais; medidas do Esquema Nacional de Seguridad (Real decreto 311/2022) nos servidores propios |

## 5. Riscos e medidas

| Risco | Medidas recomendadas |
| --- | --- |
| Terceiros ven os enderezos IP e os horarios de conexión | Usar o relay e o servidor TURN do centro e o parámetro `?relay=` nas ligazóns |
| Unha ligazón chega a persoas non autorizadas | Compartir ligazóns polas canles oficiais (aula virtual); darlle ao alumnado ligazóns de ver ou comentar cando abonde; se se filtra, *Arquivo → Facer unha copia* e deixar de usar o orixinal |
| Perda de traballos gardados só no navegador | Usar o Nextcloud do centro, a función *Entregar* e descargas periódicas; instalar a aplicación |
| Dispositivos compartidos (aulas de informática, carros de portátiles) | Contas ou perfís de navegador individuais; quitar os documentos e pechar a sesión de Nextcloud ao rematar |
| Exposición de datos persoais do alumnado | Usar nomes de pía, iniciais ou pseudónimos; non tratar datos de saúde, informes psicopedagóxicos ou de necesidades educativas en documentos compartidos, senón nos sistemas oficiais |
| Servizos opcionais que envían contido a terceiros | Manter desactivados LanguageTool e os asistentes de IA, ou usar servidores do centro; valorar o ditado do navegador |
| Menores de 14 anos e servizos de terceiros | Non activar servizos que requiran o seu consentimento sen o das súas familias (art. 7 LOPDGDD) |

O DPD debe valorar se é necesaria unha avaliación de impacto (art. 35 RXPD e lista de tratamentos da AEPD), especialmente se se activan servizos de terceiros ou se usa de forma xeneralizada con menores.

## 6. Configuración recomendada

1. **Servidor propio.** Publicar {{siteName}} nun servidor do centro ou da Consellería (idealmente no mesmo enderezo que Nextcloud) e adaptar os textos legais desa instalación (ficheiro `legal.config.json`).
2. **Relay do centro.** Instalar o relay de {{siteName}} (Nostr + STUN/TURN) na rede do centro e usar ligazóns con `?relay=https://relay.centro.example`, para non depender de relays públicos.
3. **Nextcloud do centro** para abrir, gardar e entregar traballos.
4. **LanguageTool desactivado**, ou apuntando a un servidor do centro ou da Administración.
5. **Asistentes de IA (WebMCP) desactivados.** Se se usan, só con provedores contratados pola Administración, sen datos persoais do alumnado e coas precaucións da [Nota sobre intelixencia artificial](ai.md).
6. **Ditado.** Informar de que, nalgúns navegadores, o audio procésao o fabricante do navegador; usalo só cando sexa necesario.
7. **Rexistro e información.** Incluír o tratamento no rexistro de actividades e informar as familias (apartado 7).
8. **Formación** do profesorado e do alumnado sobre o uso seguro das ligazóns e a competencia dixital (art. 83 LOPDGDD).

## 7. Texto modelo de información ás familias

> **Información sobre o uso da aplicación {{siteName}}**
>
> O centro [nome do centro] utiliza nas súas actividades de ensino a aplicación {{siteName}}, que permite ao alumnado e ao profesorado crear e editar documentos en común desde o navegador.
>
> **Responsable:** [centro educativo / Consellería], [enderezo e correo]. **Delegado de Protección de Datos:** [contacto].
>
> **Finalidade e base xurídica:** realización de actividades educativas, en exercicio da función educativa (art. 6.1.e RXPD e disposición adicional vixésimo terceira da Lei orgánica 2/2006, de educación).
>
> **Datos:** nome ou pseudónimo do alumno ou alumna, traballos e comentarios, historial de cambios e enderezo IP de conexión.
>
> **Onde se gardan:** nos dispositivos que se usan na clase e no Nextcloud do centro, se se utiliza. A aplicación non ten servidor central e o seu titular non recibe os documentos. Para conectar os dispositivos utilízase [o servidor do centro / servidores públicos de terceiros, que coñecen o enderezo IP pero non o contido].
>
> **Destinatarios:** o profesorado e os compañeiros e compañeiras cos que se comparte cada documento. Non se ceden datos a terceiros.
>
> **Conservación:** [ata o final do curso / prazo que fixe o centro].
>
> **Dereitos:** poden exercer os dereitos de acceso, rectificación, supresión, oposición e limitación ante o centro ([correo]) e presentar unha reclamación ante a Axencia Española de Protección de Datos (www.aepd.es).
>
> **Uso na casa:** os documentos gárdanse no navegador do dispositivo. Recomendamos non usar o nome completo en documentos compartidos, non compartir as ligazóns fóra do grupo e non activar servizos externos (corrector en liña, asistentes de intelixencia artificial) sen supervisión.

## 8. Normativa de referencia

- Regulamento (UE) 2016/679, xeral de protección de datos (RXPD).
- Lei orgánica 3/2018, de protección de datos persoais e garantía dos dereitos dixitais (LOPDGDD): arts. 7 (menores), 12.6, 31, 34, 83 (educación dixital), 84 (protección de menores en internet) e 92.
- Lei orgánica 2/2006, de educación, modificada pola Lei orgánica 3/2020 (LOMLOE): disposición adicional vixésimo terceira.
- Real decreto 311/2022, Esquema Nacional de Seguridad.
- Real decreto 1112/2018, sobre accesibilidade dos sitios web e aplicacións móbiles do sector público.
- Regulamento (UE) 2024/1689, de intelixencia artificial.
- Axencia Española de Protección de Datos: guías para centros educativos (https://www.aepd.es).
