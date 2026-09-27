// Help center articles in English (the source; es, gl, fr and de translate them).
import type { Articles } from './types'

const articles: Articles = {
  'getting-started': {
    title: 'Getting started',
    keywords: 'start begin first welcome home new document open template account login',
    body: `Ofimeo is an office suite that runs entirely in your browser: documents, spreadsheets, drawings, diagrams, presentations, forms and PDF correction. You do not need an account, and nothing is installed on a server.

## The home screen
- **Start something new**: click a card to create a document of that kind.
- **Templates**: worksheets, rubrics, gradebooks, timetables, concept maps and more. Click one to get your own copy.
- **Open file…**: opens Word, OpenDocument, Excel, CSV, PowerPoint, draw.io, Excalidraw and PDF files from your computer.
- **Your documents**: everything you created or opened in this browser, with search, folders, tags and a trash (deleted documents are kept for 30 days).

## Your name
Type your name in the box at the top right (on a phone or in a narrow window, tap the person button at the top right). Collaborators see it next to your cursor and in comments, and it is used for the file name when you hand in work. A first name or initials is enough.

## Important to know
- Documents are stored **in this browser** only. Read [Working offline and where your data is stored](help:offline) and make [backups](help:backup).
- To work with others, send a [sharing link](help:sharing).
- Students hand in work with the [Hand in](help:handin) button.

[Show the welcome tour again](action:tour)

## Import from Google Drive or Microsoft 365
**Import from link…** (home screen, and File menu in every app) opens files shared from Google Docs, Sheets, Slides and Drive, OneDrive or SharePoint:
1. Paste the share link. The file must be shared as **Anyone with the link**, or you must be able to open it with your own account.
2. Click the download button: your browser downloads the file as Word, Excel or PowerPoint.
3. Drop the downloaded file on the dialog (or choose it). It opens as a new Ofimeo document.

Browsers do not let web apps download these files directly, so the file goes through your Downloads folder; Ofimeo never sees your Google or Microsoft account. If your school relay offers it, **Import directly through the school relay** does it in one click for public files.`,
  },
  sharing: {
    title: 'Sharing and permissions',
    keywords: 'share link invite collaborate together permission edit comment view read only copy worksheet qr code students',
    body: `Click **Share** (top right in every app) to get a link. Whoever opens the link joins the document, and changes appear for everyone in real time.

## Kinds of link
- **Can edit**: people can change the document with you.
- **Can comment**: people can read and add comments, but not change the text.
- **Can view**: people can read the document and follow changes live.
- **Makes a copy**: everyone who opens it gets their own private copy. Use it to give each student a worksheet.

The dialog also shows a **QR code**, handy for tablets and phones in class.

## Good to know
- A link is like a key: anyone who has it gets its access. Share it only with the people who need it.
- View and comment links cannot be turned into edit links: changes are only accepted when they are signed with the edit key.
- There is no central copy on a server. To receive the latest changes, someone who has the document must be online at the same time. Edits made offline merge automatically the next time you meet.
- The status next to Share says **Only you** or how many people are here. If others never appear, run the [connection test](help:network).
- Documents made before permission links existed can only be shared with edit links. Use File ▸ Make a copy to get all link kinds.

## Chat
- The speech-bubble button next to the people in the document (or \`Alt+Shift+C\`) opens the chat. A number shows unread messages; it turns red when someone mentions you.
- Type \`@\` to mention someone who is here. Links open in a new tab; the smiley button adds emoji. \`Enter\` sends, \`Shift+Enter\` starts a new line, \`Escape\` closes the chat.
- People with an edit or comment link can write; people with a view link can only read.
- Teachers (edit link): the ⋯ button in the chat turns the chat off for this document or clears its history for everyone.
- Messages are kept with the document in this browser and in backups, but not in versions, copies or downloaded files.`,
  },
  offline: {
    title: 'Working offline and where your data is stored',
    keywords: 'offline internet connection install app pwa storage indexeddb browser data delete cleared lost device computer',
    body: `Your documents are stored **in this browser on this device** (in its IndexedDB storage). They are not uploaded to any server (unless you turn on [sync without being online together](help:network), which keeps an encrypted copy). The save state in the status bar shows **Saved in this browser**.

## What this means
- Clearing the browser data (history, cookies and site data) **deletes your documents**. Make [backups](help:backup) or save to [Nextcloud](help:nextcloud).
- Another browser or another computer does not see your documents. To continue on another device, open your edit link there while this device is online, or restore a backup.
- Ofimeo asks the browser to protect its storage so documents are not deleted when space runs low. [Storage and backup](action:storage) shows whether it is protected and how much space is used.

## Working without a connection
- After the first visit the whole suite works offline. The home screen shows **✓ Available offline** when it is ready.
- You can install Ofimeo as an app (browser menu or address bar ▸ Install). Installed, it opens Word, Excel, PowerPoint and other files from your computer.
- Creating, editing, opening and downloading files need no connection. Changes made offline are sent to collaborators when you are connected again.
- Nextcloud and dictation need a connection.`,
  },
  backup: {
    title: 'Backups and restoring',
    keywords: 'backup restore copy safety password encrypted ofimeo-backup reminder lost documents move computer',
    body: `Because documents live only in this browser, keep a backup. Open [Storage and backup](action:storage) (drive icon on the home screen, or File ▸ Storage and backup… in any app).

## Back up
- **Back up all documents** downloads one **.ofimeo-backup** file with all your documents, their version history, comments and your own templates.
- You can protect it with a **password** (strong encryption). Do so: the file contains the keys to edit your documents. Without the password it cannot be restored.
- On the home screen you can also back up only the selected documents.

## Restore
**Restore backup** reads the file and merges it: documents already here are updated without losing anything, and missing ones are added. A report lists what was added and merged. Use this to move your documents to a new computer or browser.

## Reminders and automatic backup
- The home screen reminds you when documents exist only in this browser and there has been no backup for 7 days (you can change the number of days or turn it off).
- With a [Nextcloud](help:nextcloud) account, the automatic backup uploads a backup every few days to a folder in your Nextcloud (off by default).`,
  },
  nextcloud: {
    title: 'Nextcloud',
    keywords: 'cloud server webdav save open sync app password login account school drive file',
    body: `If your school has a Nextcloud server, you can open files from it and save them back. Your browser talks to Nextcloud directly.

## Connect your account
Open [Nextcloud account](action:nextcloud) (Nextcloud button on the home screen, or File ▸ Nextcloud account…). Enter the server address and choose **Log in with Nextcloud**, or use an **app password** (Nextcloud ▸ Personal settings ▸ Security ▸ Create new app password). Never type your main password. **Test connection** explains what is wrong if it fails.

## Open and save
- **Open from Nextcloud…** (home screen and File menu) opens a file as a new document **linked** to it.
- **Save to Nextcloud** (\`Ctrl+S\`) updates the linked file. **Save to Nextcloud as…** chooses the folder, name and format.
- If the file was changed in Nextcloud meanwhile, you choose to overwrite it, save a copy or cancel.
- Optional autosave every few minutes.

## Good to know
- Only the person who linked a document saves it to Nextcloud; collaboration still goes directly between browsers.
- Offline, the Nextcloud actions are disabled.
- If you cannot connect because the server blocks this site, your IT department must allow it (CORS). The account dialog shows what they need.`,
  },
  handin: {
    title: 'Handing in work',
    keywords: 'hand in submit homework assignment teacher student zip pdf upload file drop deliver',
    body: `**For students.** Click **Hand in** (next to Share). Ofimeo downloads a ZIP file named with your name and the title, with the document in its original formats (for example .odt and .docx, or .pptx and pictures of the slides).

- If you have not typed your name yet, you are asked for it: it goes into the file name.
- Upload or send the ZIP to your teacher the way they asked (virtual classroom, email…).
- **Print / Save as PDF** makes a PDF if one is also needed: choose "Save as PDF" as the printer.
- **Upload to a Nextcloud share link…**: if your teacher gave you an upload link, the file goes straight there. You do not need a Nextcloud account.
- **Hand in to Moodle…**: if your school uses Moodle, hand in straight to an assignment. See [Moodle](help:moodle).

**For teachers.**
- Give each student their own worksheet with a **Makes a copy** link (see [Sharing](help:sharing)).
- Create an upload link ("File drop") in your Nextcloud and give it to the class.
- Open the students' PDFs, or hand-in ZIPs, in [Ofimeo PDF](help:pdf) to correct them.
- For quizzes, use [Ofimeo Forms](help:forms).`,
  },
  moodle: {
    title: 'Moodle',
    keywords: 'moodle virtual classroom campus assignment task homework due date deadline grade feedback submit hand in course aula virtual',
    body: `Connect Ofimeo to your school's Moodle to see your assignments on the home screen and hand in your work without downloading and uploading files.

## Connect
Open [Moodle](action:moodle) (Moodle button on the home screen, or File ▸ Moodle account…). Enter the Moodle address (your school may have filled it in), your username and your password, and choose **Connect**.
- Your password goes only to Moodle, once. Ofimeo keeps only a Moodle key and your name in this browser. **Disconnect** removes them.
- If your school signs in to Moodle through a web page (Google, Microsoft or a school login, "single sign-on"), this kind of sign-in does not work in Ofimeo yet. Ofimeo tells you when it detects it. Hand in with the usual [Hand in](help:handin) and upload the file in Moodle.

## Moodle tasks
The **Moodle tasks** panel on the home screen lists the assignments of your courses. Assignments to do come first, sorted by due date. Handed-in and graded ones come after.
- Open an assignment to read its description, download its files (**Open in Ofimeo** makes your own copy) and see the due date, the last day to hand in, your status, your grade and your teacher's feedback once they are released.
- **Refresh** updates the list. Without a connection you see the last list, with the time it was updated.
- The list only shows information. Work on the assignment in Moodle itself when it is not handed in as a file.

## Hand in to Moodle
In any app, choose **Hand in** (or File ▸ Hand in to Moodle…):
1. Pick the assignment. Only assignments that are open and take files are listed.
2. Choose the format. Ofimeo suggests one the assignment accepts. PDF is offered in the apps that export it; otherwise use **A file from this device…**.
3. If the assignment has a submission statement, read it and tick it.
4. Choose **Hand in**. Ofimeo uploads the file and saves it as your submission. When the assignment has a submit button, it is also submitted for grading.

Handing in again while the assignment is open replaces your file. If Moodle refuses the file (too large, wrong type, too many files), the message says why.

## Privacy
Your Moodle work goes only to your school's Moodle, directly from this browser or through your school's own relay. It is never sent to the people you share documents with.`,
  },
  network: {
    title: 'School networks: connection test and relay',
    keywords: 'network wifi firewall filter blocked only you not connecting relay turn stun nostr it department proxy store forward mailbox sync later asynchronous',
    body: `Collaborators connect directly to each other. Public relays are only used to find each other. Some school networks block this: the status then stays at **Only you**.

## Connection test
Open [Help ▸ Connection test…](action:connection), or click the connection status next to Share. It checks the Internet connection, the relays, whether direct connections are possible and how each person in the document is connected. It ends with a plain-language verdict. **Copy report** copies the details for your IT department.

## Common causes
- A content filter blocks the public relays.
- A strict firewall blocks direct connections.
- The Wi-Fi isolates devices from each other.

## Ofimeo Relay
For these networks a school can run **Ofimeo Relay**, a small program for its own network (Windows, macOS, Linux or Raspberry Pi). It helps devices find and reach each other.
- Paste its address in the connection test, or open a link with **?relay=** and its address. The browser remembers it.
- Share links include the relay, so students get it by opening the link.
- You can choose to use only the school relay.

## Sync without being online together
Normally changes travel only while two people have the document open at the same time. With **sync without being online together**, an encrypted copy of the changes waits for the others: a student edits in class and continues at home, the teacher corrects at night.
- Turn it on in the connection test, under **Sync without being online together**: on the school relay (if it keeps copies) and/or in a Nextcloud folder. Your school may turn it on for everyone.
- The status next to the save state shows **Synced to …** once your changes are stored, or **Waiting to sync** while you are offline (they are sent later).
- Everything is encrypted in your browser with the key in the document link. The relay or Nextcloud only sees encrypted data, its size and when it changes.
- View-only links download changes but can never upload any. For Nextcloud, use a folder shared with the other people.
- Copies on the school relay are deleted after a period without changes (180 days by default).

The IT department finds the installation guide in the project's documentation (docs/relay.md).`,
  },
  'school-setup': {
    title: 'For administrators: installing Ofimeo in a school',
    keywords: 'administrator it department install deploy server docker raspberry windows configuration ofimeo.config.json locked set by your school logo language webmcp templates hide apps',
    body: `A school can run its own copy of Ofimeo on its network and set it up for everyone with one file, **ofimeo.config.json**.

## Ways to install it
- **Docker**: one container with the app and Ofimeo Relay (the Dockerfile and docker-compose.yml are in the project).
- **Ofimeo Relay alone** on a Windows server, a Linux machine or a Raspberry Pi: it can serve the app too.
- **Any web server** (nginx, Apache, IIS): copy the built files. The app has no server part.

## The school configuration
[Help ▸ For administrators…](action:admin) opens a form that writes ofimeo.config.json. It sets:
- the school's name and logo, shown on the home screen;
- the default interface language and the language of new documents;
- the school relay, other relays, and whether public servers may be used;
- where encrypted changes may wait for people who are offline;
- the Nextcloud servers offered when connecting;
- whether AI assistants (WebMCP) are allowed, which apps and templates are offered;
- the school's privacy contacts, shown above the legal links.

Put the file next to index.html (or give it to Ofimeo Relay with **--school-config**). Each browser applies it when Ofimeo opens and keeps a copy for working offline.

## Locked settings
Settings the school locks show **Set by your school** and cannot be changed in the browser: the interface language, the AI assistants switch, the school relay and the Nextcloud servers.

The step-by-step guide for the IT department is in the project's documentation (docs/deploy-school.md).`,
  },
  privacy: {
    title: 'Privacy',
    keywords: 'privacy data protection gdpr personal data students minors cookies tracking safe secure encrypted',
    body: `Ofimeo is designed so that nobody but you and the people you share with receives your documents.

- **No accounts, no cookies, no analytics, no advertising.** The site only delivers the program; it then runs in your browser.
- **Your documents stay on your device** (in the browser). Preferences, your name and Nextcloud credentials are also stored only here.
- **Sharing**: collaborators receive the document, its comments and versions, the name you typed and, because the connection is direct, your IP address. Data travel encrypted directly between browsers. Public relays only see encrypted connection messages.
- **Links are keys**: anyone who has a link gets its access. Do not post edit links publicly.
- **Nextcloud**: your password is only sent to your Nextcloud server.
- **Dictation** uses the browser's speech recognition, which may send the audio to the browser maker's service.

## Tips for class
- Use a first name, initials or a nickname.
- Do not put sensitive personal data (health, family matters) in shared documents.

Read the full [privacy policy](legal:privacy) and the [information for schools](legal:schools).`,
  },
  shortcuts: {
    title: 'Keyboard shortcuts',
    keywords: 'keyboard shortcut keys hotkeys ctrl command mac f1 f10',
    body: `These keys work in every app (on a Mac, use ⌘ instead of Ctrl):

- \`Ctrl+O\` open a file, \`Ctrl+P\` print, \`Ctrl+S\` save to Nextcloud (your work is always saved in the browser anyway)
- \`Ctrl+Z\` undo, \`Ctrl+Y\` redo
- \`Ctrl+X\` cut, \`Ctrl+C\` copy, \`Ctrl+V\` paste, \`Ctrl+A\` select all
- \`Ctrl+F\` find
- \`F10\` or \`Alt+Shift+M\` go to the menu bar; then use the arrow keys, \`Enter\` and \`Escape\`
- \`Ctrl+/\` or \`F1\` show all the shortcuts of the app you are using
- \`Alt+Shift+A\` accessibility panel, \`Alt+Shift+R\` read aloud, \`Alt+Shift+D\` dictation

In Ofimeo Docs and Ofimeo Sheets, \`Ctrl+H\` opens find and replace.

Menus show the shortcut of each command next to it.

[Show the shortcuts of this app](action:shortcuts)`,
  },
  accessibility: {
    title: 'Accessibility',
    keywords: 'accessibility dyslexia font large text zoom contrast dark theme screen reader read aloud dictation voice keyboard motion',
    body: `Open the [Accessibility panel](action:accessibility) with the accessibility button or \`Alt+Shift+A\`. Settings are saved in this browser and apply to the whole suite; your documents do not change.

- **Reading fonts**: OpenDyslexic or Atkinson Hyperlegible for the interface and, optionally, for document text.
- **Text size** of the interface, and **line and letter spacing** for reading.
- **Themes**: light, dark, follow the system, and two high-contrast themes.
- **Reduce motion**, **large mouse pointer**, **thick focus outline**.
- **Reading ruler** or **focus mask** that follows the pointer and the text cursor.
- **Read aloud** (\`Alt+Shift+R\`): reads the selection, the paragraph or the whole document with the browser's voices.
- **Dictation** (\`Alt+Shift+D\`): writes what you say. It needs a connection and a browser that supports it (Chrome, Edge).
- **Keyboard**: everything can be used with the keyboard. \`F10\` goes to the menu bar and a "Skip to content" link appears with \`Tab\`. See [Keyboard shortcuts](help:shortcuts).

The interface language can be changed on the home screen or in the panel.`,
  },
  spelling: {
    title: 'Spelling and grammar',
    keywords: 'spelling spell check checker grammar dictionary language typo misspelled correct f7 underline',
    body: `Every app checks spelling (red wavy underline) and grammar (blue) as you type, in the document's language. The check runs in your browser: the text is never sent anywhere, unless you choose a LanguageTool server in the word processor.

## Where
- **Docs**: the whole document. Right-click an underlined word for suggestions.
- **Sheets**: the cell being edited. Formulas and numbers are skipped.
- **Slides and Diagrams**: labels and text boxes while you type, and speaker notes.
- **Forms**: titles, descriptions and options. Respondents' written answers are checked when the form allows it (**Settings ▸ Allow spell check for respondents**: on for surveys, off for quizzes, where it could give answers away).
- **PDF**: text boxes, comments and replies.
- **Draw**: the text you are typing.

## Spelling and grammar dialog
**Tools ▸ Spelling and grammar…** (\`F7\`) walks through the issues one by one: every cell of every sheet, every slide and its notes, every page of a diagram, every question of a form, every text box and comment of a PDF, every text of a drawing. It shows where each one is (for example "Sheet1 · B3") and selects it. **Change** or **Change all** corrects it, **Ignore** skips it, and **Add to dictionary** accepts the word from then on.

## Language and dictionary
- **Tools ▸ Language** sets the document's language (English US or UK, Spanish of several countries, Galician, French, German). It is saved with the document, so everyone checks it in the same language.
- **Tools ▸ Personal dictionary…** lists the words you added. They are shared by every app and document of this browser.
- **Tools ▸ Check spelling as you type** / **Check grammar as you type** turn the underlines off in every app.`,
  },
  'math-graph': {
    title: 'Math graphs and geometry',
    keywords: 'graphing calculator, function, plot, slider, geogebra, desmos, geometry, midpoint, construction, table of values',
    body: `Insert a **graphing calculator** in a document or a slide with **Insert ▸ Math graph…**. The graph is saved in the document as an editable picture: double click it (or select it and press \`Enter\`) to change it. People with a view link can open it to explore, but not change it.

## Functions and curves
Type one expression per row in **Algebra**:
- Functions: \`y = a x^2 + b\`, \`f(x) = sin(x)\`, \`g(x) = f(x - 1)\`, \`f'(x)\` (derivative)
- Equations and inequalities: \`x^2 + y^2 = 9\`, \`y > x - 1\`, \`x = 3\`
- Curves: \`(cos t, sin t)\` (parametric), \`r = 2cos(3θ)\` (polar)
- Points: \`A = (1, 2)\`

Letters without a value (like \`a\`) become **sliders** when you press \`Enter\`. Press ▶ to animate a slider.

The **Readouts** list roots, minimum and maximum, the y-intercept and where two functions meet, as text (also read by screen readers). **Table** shows a table of values. **Settings** has the window, grid, axes, degrees and the picture size.

## Geometry
In **Geometry**, choose a tool and click on the graph: Point, Segment, Line, Ray, Circle, Polygon, Midpoint, Perpendicular, Parallel, Intersect and Angle. Constructions update when you drag the points. You can also type commands such as \`M = Midpoint(A, B)\` or \`Area(poly1)\`, and change coordinates of free points in the list.

## Keyboard
On the graph: arrow keys move the selected point (select it by its row), trace the selected function or pan; \`+\` and \`-\` zoom; \`0\` resets the view.

## Files
Word and OpenDocument files keep the graph as a picture with the construction in its title, so opening the file again in Ofimeo restores the editable graph. PDF and printing use the picture. **Download SVG** and **Download PNG** save the picture.`,
  },
  writer: {
    title: 'Ofimeo Docs (documents)',
    keywords: 'writer word processor text document docx odt page table of contents citation bibliography comment suggest track changes review correct',
    body: `A word processor with real pages, like the ones you know.

## Writing
- Use the menus (File, Edit, View, Insert, Format, Table, References, Tools, Review) and the toolbar. Right-click for more options.
- Paragraph styles (Title, Headings…) give structure and feed the **table of contents** (Insert or References ▸ Table of contents).
- **References** has citations and a bibliography in APA, MLA or Chicago style.
- Page size, margins and orientation are in File ▸ Page setup…

## Reviewing (teachers correcting work)
- **Comments**: select text and press \`Ctrl+Alt+M\` (or Review ▸ Comment). People with a comment link can comment too.
- **Suggestions**: switch the mode from **Editing** to **Suggesting**. Your changes are marked, and the author accepts or rejects them.
- Review ▸ Show authorship colors the text by who wrote it.

## Charts
**Insert ▸ Chart…** adds a column, bar, line, area, pie, doughnut or scatter chart. Take the data from a spreadsheet of your library (choose the sheet and the range) or type it into the small table. A chart **linked** to a spreadsheet updates by itself when that spreadsheet changes in this browser; **Update from source** (on the chart or in its right-click menu) does it at once. The document keeps a copy of the data, so everyone sees the chart even without the spreadsheet. Drag the corner to resize it; double-click to change it or add a caption. Word files keep it as a real chart.

## Mail merge
**Tools ▸ Mail merge…** makes one letter, certificate or report card per row of a table:
1. Choose the data: a spreadsheet of your library or a CSV, Excel or OpenDocument file, the sheet and the row with the field names.
2. Click a field to insert it where the cursor is, for example «Name». **Conditional text…** adds text only when a field has a value (for example "if Grade is Pass").
3. Optionally keep only some rows with the filter.
4. Tick **Show the data of a record** and use the arrows to check each one.
5. Make a **New document** with all of them (one per page), one **PDF**, or a **ZIP** of Word or PDF files named after a field.

Word files keep the fields (MERGEFIELD), so the template also works in Word.

## Files
Opens and downloads Word (.docx) and OpenDocument (.odt); also opens Word 97-2003 (.doc), RTF, .html, .txt and Markdown (.md, with headings, lists, links, code and tables), and downloads Markdown. If a file has something Ofimeo cannot bring over (for example text boxes or endnotes of a .doc), a message lists it once. Print or save as PDF with File ▸ Print. View ▸ Zoom (or \`Ctrl++\`, \`Ctrl+-\`, \`Ctrl+0\`) changes the zoom.`,
  },
  sheet: {
    title: 'Ofimeo Sheets (spreadsheets)',
    keywords: 'spreadsheet sheet excel xlsx ods csv formula function chart graph pivot cells gradebook',
    body: `Spreadsheets with formulas, charts and several sheets.

- Type \`=\` to start a formula, for example =SUM(B2:B30) or =AVERAGE(C2:C30). Hundreds of functions are available.
- **Insert ▸ Chart…** makes a column, bar, line, pie or scatter chart from the selected cells. Charts update when the values change.
- **Data** has sorting, filters, validation and **Pivot table…**.
- **Format** has number formats, merged cells and conditional formatting; borders are on the toolbar.
- The status bar shows the sum, average and count of the selected cells.
- Several people can edit at once; you see their selections in their colors.

## Screen readers and keyboard
The grid is drawn as a picture, so **View ▸ Accessible table view** (\`Alt+Shift+T\`, or the "Switch to accessible table view" link at the top of the page) shows the current sheet as a real table that screen readers can read. Arrow keys move between cells and each cell is read with its address, value and formula; \`Enter\` or \`F2\` edits it, \`Delete\` clears it, \`Ctrl+Z\` undoes, \`Ctrl+Home\` / \`Ctrl+End\` go to the start and end of the data and \`Ctrl+Page Up\` / \`Ctrl+Page Down\` change the sheet. Edits reach everyone else at once. Charts are listed below the table with a summary of their values and **Chart data as table** (also in the chart's right-click menu and in Edit when a chart is selected). In the normal grid, the selected cell is read aloud as it moves, and the arrow keys move between the sheet tabs.

## Files
Opens and downloads Excel (.xlsx), OpenDocument (.ods) and CSV. Charts are saved as real charts that Excel and LibreOffice can edit. Print or save the current sheet as PDF with File ▸ Print.

The gradebook, attendance and rubric templates on the home screen are ready to use.`,
  },
  draw: {
    title: 'Ofimeo Drawing (whiteboard)',
    keywords: 'drawing whiteboard sketch draw freehand excalidraw brainstorm board shapes arrows',
    body: `A whiteboard to draw freehand or with shapes, arrows and text, alone or with the class.

- Choose a tool in the tool bar on the canvas and drag to draw. Arrows stick to the shapes they connect.
- The panel next to the selection changes colors, lines, fill and font.
- Hold \`Space\` and drag to move around; \`Ctrl\` and the mouse wheel zoom.
- Everyone in the drawing sees each other's pointers and changes live.
- Images can be pasted or dropped onto the canvas.

## Files
File ▸ Download as saves PNG or SVG pictures, or an .excalidraw file that you can open again later. File ▸ Export image… offers more options (background, dark mode, scale).`,
  },
  diagram: {
    title: 'Ofimeo Diagrams',
    keywords: 'diagram flowchart concept map mind map uml network drawio visio shapes connectors organizer timeline',
    body: `Diagrams, flowcharts and concept maps, compatible with draw.io.

- Drag shapes from the **shape panel** onto the canvas, or click one to insert it. The search box finds shapes by name.
- Drag from a shape's connection point to another shape to connect them.
- Double-click a shape to type its label.
- The **format panel** changes fill, line, text, arrows, position and size.
- **Arrange** has alignment, grouping and automatic layouts (tree, circle…).
- **View ▸ More shapes…** adds libraries such as UML, networks, floor plans, electrical or BPMN.
- A diagram can have several pages (tabs at the bottom).

## Files
Opens and downloads draw.io (.drawio) files; opens Visio (.vsdx) drawings. Download PNG or SVG pictures, or print and save as PDF.

The home screen has templates for concept maps, timelines, flowcharts and graphic organizers.`,
  },
  slides: {
    title: 'Ofimeo Slides (presentations)',
    keywords: 'presentation slides powerpoint pptx odp present projector presenter notes animation theme layout follow',
    body: `Presentations for the classroom.

- The **slide panel** on the left shows the slides. Right-click a thumbnail to add, duplicate, move or delete a slide and to change its layout or background.
- Choose a **theme** and a **layout** for each slide. Click the placeholders to add a title and text.
- Insert images, shapes, tables and equations. Type the **speaker notes** under the slide.
- **Insert ▸ Chart…** adds a chart from a spreadsheet of your library (kept up to date when it changes) or from data you type. PowerPoint files keep it as a real chart.
- **Animations** and **transitions** make objects and slides appear in turn.
- **Present** shows the slides full screen: arrow keys or a click to go on, \`L\` for a laser pointer, \`B\` for a black screen, \`Esc\` to end. The **presenter view** shows the notes and a timer in a second window.
- While you present, everyone else in the presentation can **Follow** you, also with a view link.

## Files
Opens PowerPoint (.pptx). Downloads PowerPoint (.pptx), OpenDocument (.odp), PDF and pictures of the slides.`,
  },
  forms: {
    title: 'Ofimeo Forms (forms and quizzes)',
    keywords: 'form quiz test exam survey questionnaire questions answers responses grade score self-assessment',
    body: `Forms, surveys and quizzes that grade themselves.

## For teachers
- **Question** adds a question; choose its type: short answer, paragraph, multiple choice, checkboxes, dropdown, scale, grid, date, time or number. **Section** makes a new page.
- Turn on **Quiz** to set the correct answers, points and feedback. Grading is automatic; paragraphs are graded by hand.
- **Send** gives the link and a QR code for your students. They only see the form, not the answers of others.
- Responses arrive when your browser (or another editor's) is online. See them in **Responses**, with charts and statistics, and export them to a spreadsheet.

## For students
- Type your name, answer the questions and press **Submit**.
- If you are offline, the response is sent when the connection returns.
- If no teacher is online, use **Download my response** and hand the file to your teacher.

Answers are encrypted in the student's browser: only the form's editors can read them.`,
  },
  pdf: {
    title: 'Ofimeo PDF (correcting PDFs)',
    keywords: 'pdf correct mark grade annotate highlight pen stamp signature note acrobat hand-in zip',
    body: `Correct and annotate PDF files, for example the work your students handed in.

- Open a PDF from the home screen, from File ▸ Open…, or open a hand-in ZIP: the PDFs inside are listed.
- Tools: highlight, underline and strikeout (select text), pen and eraser, text boxes, shapes, **stamps** (check, cross, "Good", a grade…), **sticky notes** and your **signature**.
- Keys: \`H\` highlight, \`P\` pen, \`T\` text box, \`N\` note, \`S\` stamp, \`G\` signature, \`Esc\` back to Select.
- Keyboard: choose a tool (for example \`T\`, \`N\`, \`R\` or \`S\`) and press \`Enter\` to place it in the middle of the page you are looking at. In the Comments panel, **Add comment** does the same for sticky notes.
- Share the PDF to correct it together or to let the student read your notes.

## Pages
The **Page** menu (or right-click a thumbnail) rotates a page left or right (\`Ctrl+[\` / \`Ctrl+]\`), moves it up or down, adds blank pages and deletes pages. Drag thumbnails to reorder them (or \`Alt+↑\` / \`Alt+↓\` on a thumbnail). Annotations stay with their page, and Undo reverts every change. The downloaded PDF follows the new order and rotation.

## Files
File ▸ Download as saves the **PDF with annotations**: "editable" keeps them as annotations that other PDF readers can change, "flattened" draws them into the pages. Hand in includes both. Text boxes and stamps keep symbols such as π, √, ≈, → and ✓.

A **password-protected PDF** asks for its password when you open it. The document keeps the original protected file; the password is not stored in it or sent to anyone, so everyone who opens it (and you, in a new browser tab) enters it again. Cancel and nothing is added.`,
  },
  notebook: {
    title: 'Ofimeo Notebook (class notes)',
    keywords: 'notebook onenote notes class notes section page subpage tag to do ink pen stylus highlighter drawing lab journal reading',
    body: `Class notes organised like a binder: **sections** (coloured tabs) hold **pages**, and pages can have **subpages**.

## Sections and pages
- **Add section** and **Add page** are in the panel on the left. Drag pages and sections to reorder them, or drop a page on a section tab to move it there. With the keyboard: \`Alt+↑\` / \`Alt+↓\`.
- The **⋯** button of a page (or a right-click) makes it a subpage, moves it to another section, exports, prints or deletes it.
- **Search notebook** (\`Ctrl+F\`) looks in the titles and text of every page.
- On a phone, the **Sections and pages** button at the top of the page opens them as a panel.

## Writing
- A page has a title, the date it was created and free text with headings, lists, checklists, tables, pictures, links, equations and code.
- Paste or drop pictures and files onto the page: they are kept in the notebook (large pictures are made smaller; other files up to 5 MB).
- **Tags** mark a paragraph as **To do**, **Important**, **Question** or **Remember** (toolbar ▸ Tag, or \`Ctrl+Shift+1\` to \`4\`). Click a To do box to tick it. **Tag summary** lists the tagged paragraphs of every page.

## Drawing
Choose **Pen**, **Highlighter** or **Eraser** in the toolbar (\`Alt+2\`, \`Alt+3\`, \`Alt+4\`; \`Alt+1\` or \`Esc\` goes back to typing). A stylus writes thicker when you press harder. With **Draw ▸ Draw with the stylus** a stylus always draws, while a finger or the mouse selects text. The eraser removes whole strokes; Undo brings them back.

## Together
Share the notebook to write in it together and see who is on each page. Comment with \`Ctrl+Alt+M\`, hand it in, and find earlier versions in File ▸ Version history.

## Files
- File ▸ Download as: the whole notebook as Word, OpenDocument, PDF, Markdown or a **ZIP of Markdown** (one folder per section, with pictures and ink). **Current page** and **Current section** export only those.
- Print (\`Ctrl+P\`) prints the open page; **Print section…** prints every page of the section.
- File ▸ Open… imports Markdown files or a ZIP of Markdown. A ZIP exported from Ofimeo brings back sections, colours, subpages and ink. **Import a folder of Markdown files…** takes a whole folder. OneNote files (.one) cannot be imported: export them from OneNote as Word or PDF first.`,
  },
}

export default articles
