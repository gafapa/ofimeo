// Minimal in-memory Nostr relay (NIP-01) so end-to-end tests never use public relays.
import { WebSocketServer } from 'ws'

const port = Number(process.argv[2] || 7790)
const wss = new WebSocketServer({ port })
const events = []
const subs = new Map() // socket -> Map(subscription id, filters)

const matches = (ev, f) =>
  (!f.kinds || f.kinds.includes(ev.kind)) &&
  (!f.since || ev.created_at >= f.since) &&
  Object.keys(f)
    .filter((k) => k.startsWith('#'))
    .every((k) => ev.tags.some((t) => t[0] === k.slice(1) && f[k].includes(t[1])))

wss.on('connection', (ws) => {
  subs.set(ws, new Map())
  ws.on('message', (raw) => {
    const [type, ...rest] = JSON.parse(String(raw))
    if (type === 'EVENT') {
      const ev = rest[0]
      events.push(ev)
      ws.send(JSON.stringify(['OK', ev.id, true, '']))
      for (const [client, s] of subs) {
        for (const [id, filters] of s) if (filters.some((f) => matches(ev, f))) client.send(JSON.stringify(['EVENT', id, ev]))
      }
    } else if (type === 'REQ') {
      const [id, ...filters] = rest
      subs.get(ws).set(id, filters)
      for (const ev of events) if (filters.some((f) => matches(ev, f))) ws.send(JSON.stringify(['EVENT', id, ev]))
      ws.send(JSON.stringify(['EOSE', id]))
    } else if (type === 'CLOSE') subs.get(ws).delete(rest[0])
  })
  ws.on('close', () => subs.delete(ws))
})
console.log(`test relay on ws://127.0.0.1:${port}`)
