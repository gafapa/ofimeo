import base, { RELAY_PORT } from './playwright.config'
export default { ...base, use: { ...base.use, baseURL: 'http://127.0.0.1:4391' }, webServer: [{ command: `node tests/relay.mjs ${RELAY_PORT}`, port: RELAY_PORT, reuseExistingServer: true, timeout: 30_000 }] }
