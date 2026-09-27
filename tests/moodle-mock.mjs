// Small mock of a Moodle site for the end-to-end tests (tests/e2e/moodle.spec.ts):
// the web service functions Ofimeo uses (src/core/moodle.ts), per "site" path:
//   /cors    answers the web service endpoints with Access-Control-Allow-Origin: *
//            (like Moodle does for the Moodle app's web version)
//   /nocors  no CORS headers at all: the browser must go through Ofimeo Relay
//   /sso     like /cors, but its public configuration says sign-in happens in a
//            browser (single sign-on)
// Test helpers: GET /__state (uploads and web service calls), POST /__reset.
// Usage: node tests/moodle-mock.mjs <port>
import { createServer } from 'node:http'

const port = Number(process.argv[2] || 7821)
const DAY = 86400
const USER = { username: 'student', password: 'Secret-1', fullname: 'Ana García', userid: 42 }

let state
function reset() {
  const now = Math.floor(Date.now() / 1000)
  state = {
    now,
    calls: [],
    uploads: [],
    nextItem: 500,
    drafts: {},
    // assignment id -> submission
    submissions: {
      11: { status: 'new', files: [] },
      12: { status: 'submitted', files: [{ filename: 'poem.odt', filesize: 1200 }], graded: true },
      13: { status: 'new', files: [] },
      14: { status: 'new', files: [] },
    },
  }
}
reset()

const fileConfigs = (types, max = 1) => [
  { plugin: 'file', subtype: 'assignsubmission', name: 'enabled', value: '1' },
  { plugin: 'file', subtype: 'assignsubmission', name: 'maxfilesubmissions', value: String(max) },
  { plugin: 'file', subtype: 'assignsubmission', name: 'maxsubmissionsizebytes', value: String(10 * 1024 * 1024) },
  { plugin: 'file', subtype: 'assignsubmission', name: 'filetypeslist', value: types },
]

function assignments(site) {
  const now = state.now
  return {
    courses: [
      {
        id: 2,
        fullname: 'Lengua 1º ESO',
        assignments: [
          {
            id: 11,
            cmid: 101,
            course: 2,
            name: 'Essay: My town',
            intro: '<p>Write <b>300 words</b> about your town.<script>window.__pwned = 1</script><img src="x" onerror="window.__pwned = 2"></p><p><a href="javascript:alert(1)">bad link</a> <a href="https://example.org/guide">guide</a></p>',
            introformat: 1,
            introfiles: [],
            introattachments: [{ filename: 'rubric.pdf', filepath: '/', filesize: 9, fileurl: `${site}/webservice/pluginfile.php/5/mod_assign/introattachment/0/rubric.pdf`, mimetype: 'application/pdf' }],
            duedate: now + 3 * DAY,
            cutoffdate: now + 7 * DAY,
            allowsubmissionsfromdate: now - 5 * DAY,
            submissiondrafts: 1,
            requiresubmissionstatement: 1,
            submissionstatement: '<p>This essay is my own work.</p>',
            configs: fileConfigs('.pdf,.odt'),
          },
          {
            id: 12,
            cmid: 102,
            course: 2,
            name: 'Poem',
            intro: '<p>Write a poem.</p>',
            duedate: now - 10 * DAY,
            cutoffdate: 0,
            allowsubmissionsfromdate: 0,
            submissiondrafts: 1,
            requiresubmissionstatement: 0,
            configs: fileConfigs(''),
          },
        ],
      },
      {
        id: 3,
        fullname: 'Science',
        assignments: [
          {
            id: 13,
            cmid: 103,
            course: 3,
            name: 'Lab notes',
            intro: '<p>Answer in the text box.</p>',
            duedate: now + 1 * DAY,
            cutoffdate: 0,
            allowsubmissionsfromdate: 0,
            submissiondrafts: 0,
            requiresubmissionstatement: 0,
            configs: [{ plugin: 'onlinetext', subtype: 'assignsubmission', name: 'enabled', value: '1' }],
          },
          {
            id: 14,
            cmid: 104,
            course: 3,
            name: 'Old report',
            intro: '',
            duedate: now - 2 * DAY,
            cutoffdate: now - 1 * DAY,
            allowsubmissionsfromdate: 0,
            submissiondrafts: 0,
            requiresubmissionstatement: 0,
            configs: fileConfigs(''),
          },
        ],
      },
    ],
    warnings: [],
  }
}

function status(id) {
  const s = state.submissions[id]
  if (!s) return { exception: 'invalid_parameter_exception', errorcode: 'invalidparameter', message: 'Invalid parameter value detected' }
  const files = s.files.map((f) => ({ filename: f.filename, filepath: '/', filesize: f.filesize, fileurl: 'x', mimetype: 'application/octet-stream' }))
  const out = {
    lastattempt: {
      submission: { id: id * 10, status: s.status, timemodified: state.now - DAY, plugins: [{ type: 'file', name: 'File submissions', fileareas: [{ area: 'submission_files', files }] }] },
      submissionsenabled: true,
      locked: false,
      graded: !!s.graded,
      canedit: !s.graded,
      cansubmit: s.status === 'draft',
      extensionduedate: null,
      gradingstatus: s.graded ? 'graded' : 'notgraded',
    },
    warnings: [],
  }
  if (s.graded)
    out.feedback = {
      gradefordisplay: '8,00&nbsp;/&nbsp;10,00',
      gradeddate: state.now - DAY,
      plugins: [{ type: 'comments', name: 'Feedback comments', editorfields: [{ name: 'comments', description: 'Feedback comments', text: '<p>Very good rhythm!</p><script>window.__pwned = 3</script>', format: 1 }] }],
    }
  return out
}

function ws(site, fn, p) {
  switch (fn) {
    case 'core_webservice_get_site_info':
      return { sitename: 'IES Test Moodle', username: USER.username, fullname: USER.fullname, userid: USER.userid, siteurl: site, release: '4.5', usermaxuploadfilesize: 20 * 1024 * 1024, functions: [] }
    case 'core_enrol_get_users_courses':
      return Number(p.userid) === USER.userid
        ? [
            { id: 2, shortname: 'LEN1', fullname: 'Lengua 1º ESO', displayname: 'Lengua 1º ESO', visible: 1 },
            { id: 3, shortname: 'SCI', fullname: 'Science', displayname: 'Science', visible: 1 },
          ]
        : []
    case 'mod_assign_get_assignments': {
      const ids = Object.keys(p).filter((k) => k.startsWith('courseids[')).map((k) => Number(p[k]))
      const all = assignments(site)
      return { ...all, courses: all.courses.filter((c) => !ids.length || ids.includes(c.id)) }
    }
    case 'mod_assign_get_submission_status':
      return status(Number(p.assignid))
    case 'mod_assign_save_submission': {
      const id = Number(p.assignmentid)
      const item = Number(p['plugindata[files_filemanager]'])
      const files = state.drafts[item]
      if (!files) return [{ item: 'files', itemid: id, warningcode: 'couldnotsavesubmission', message: 'Could not save submission.' }]
      state.submissions[id] = { status: 'draft', files: files.map((f) => ({ filename: f.filename, filesize: f.size })) }
      return []
    }
    case 'mod_assign_submit_for_grading': {
      const id = Number(p.assignmentid)
      if (id === 11 && p.acceptsubmissionstatement !== '1') return [{ item: 'assign', itemid: id, warningcode: 'submissionstatementrequired', message: 'You are required to agree to the submission statement.' }]
      state.submissions[id] = { ...state.submissions[id], status: 'submitted' }
      return []
    }
  }
  return { exception: 'dml_missing_record_exception', errorcode: 'invalidrecord', message: `Function ${fn} not available` }
}

// Minimal multipart/form-data parser (fields and files).
function multipart(buf, boundary) {
  const parts = []
  const sep = Buffer.from(`--${boundary}`)
  let pos = buf.indexOf(sep)
  while (pos >= 0) {
    const start = pos + sep.length + 2
    const next = buf.indexOf(sep, start)
    if (next < 0) break
    const part = buf.subarray(start, next - 2)
    const headEnd = part.indexOf('\r\n\r\n')
    const head = part.subarray(0, headEnd).toString()
    const name = /name="([^"]*)"/.exec(head)?.[1]
    const filename = /filename="([^"]*)"/.exec(head)?.[1]
    parts.push({ name, filename, data: part.subarray(headEnd + 4) })
    pos = next
  }
  return parts
}

const body = (req) =>
  new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const [, siteName, ...rest] = url.pathname.split('/')
  const path = '/' + rest.join('/')
  const site = `http://${req.headers.host}/${siteName}`
  const cors = siteName === 'cors' || siteName === 'sso'
  const send = (data, status = 200, type = 'application/json') => {
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' }
    if (cors) headers['Access-Control-Allow-Origin'] = '*'
    res.writeHead(status, headers)
    res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data))
  }
  if (url.pathname === '/__state') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    return res.end(JSON.stringify({ calls: state.calls, uploads: state.uploads, submissions: state.submissions }))
  }
  if (url.pathname === '/__reset') {
    reset()
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
    return res.end()
  }
  if (!['cors', 'nocors', 'sso'].includes(siteName)) return send({ error: 'not found' }, 404)
  const raw = await body(req)
  const form = () => Object.fromEntries(new URLSearchParams(raw.toString()))
  if (path === '/lib/ajax/service-nologin.php') {
    const sso = siteName === 'sso'
    return send([{ error: false, data: { wwwroot: site, httpswwwroot: site, sitename: 'IES Test Moodle', typeoflogin: sso ? 2 : 1, launchurl: sso ? `${site}/admin/tool/mobile/launch.php` : undefined, identityproviders: sso ? [{ name: 'Google', url: `${site}/auth/oauth2/login.php?id=1` }] : [] } }])
  }
  if (path === '/login/token.php') {
    const p = form()
    state.calls.push({ site: siteName, fn: 'token', service: p.service })
    if (p.service !== 'moodle_mobile_app') return send({ error: 'Web service is not available', errorcode: 'servicenotavailable' })
    if (siteName === 'sso' || p.username !== USER.username || p.password !== USER.password) return send({ error: 'Invalid login, please try again', errorcode: 'invalidlogin' })
    return send({ token: `tok-${siteName}`, privatetoken: null })
  }
  if (path === '/webservice/rest/server.php') {
    const p = form()
    const fn = p.wsfunction || url.searchParams.get('wsfunction')
    state.calls.push({ site: siteName, fn, params: p })
    if (p.wstoken !== `tok-${siteName}`) return send({ exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'Invalid token - token not found' })
    return send(ws(site, fn, p))
  }
  if (path === '/webservice/upload.php') {
    const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] || '')?.[1]
    const parts = boundary ? multipart(raw, boundary) : []
    const field = (n) => parts.find((x) => x.name === n && x.filename === undefined)?.data.toString()
    if (field('token') !== `tok-${siteName}`) return send({ error: 'Invalid token', errorcode: 'invalidtoken' })
    const files = parts.filter((x) => x.filename !== undefined)
    const itemid = state.nextItem++
    state.drafts[itemid] = files.map((f) => ({ filename: f.filename, size: f.data.length }))
    for (const f of files) state.uploads.push({ site: siteName, filename: f.filename, size: f.data.length, head: f.data.subarray(0, 5).toString('latin1'), itemid, filearea: field('filearea') })
    state.calls.push({ site: siteName, fn: 'upload' })
    return send(files.map((f) => ({ component: 'user', contextid: 5, userid: String(USER.userid), filearea: 'draft', filename: f.filename, filepath: '/', itemid, license: 'unknown', author: USER.fullname, source: '' })))
  }
  if (path.startsWith('/webservice/pluginfile.php/')) {
    if (url.searchParams.get('token') !== `tok-${siteName}`) return send({ error: 'Invalid token' }, 403)
    return send('%PDF-1.4\n', 200, 'application/pdf')
  }
  send({ error: 'not found' }, 404)
}).listen(port, '127.0.0.1', () => console.log(`mock Moodle on http://127.0.0.1:${port}/{cors,nocors,sso}`))
