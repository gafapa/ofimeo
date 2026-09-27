// Main-thread side of the spelling worker (created on first use).

import dictionaries from 'virtual:spell-dictionaries'
import type { WorkerEvent, WorkerRequest } from './worker'
import type { CheckOptions, Issue, Lang, Paragraph } from './types'

export type CheckResult = { issues: Issue[]; pending: boolean }

export class SpellClient {
  private worker: Worker | null = null
  private nextId = 1
  private waiting = new Map<number, (value: never) => void>()
  constructor(private onEvent: (event: WorkerEvent) => void) {}

  private get w(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'spelling' })
      this.worker.onmessage = (e: MessageEvent<WorkerEvent>) => this.receive(e.data)
      const base = document.baseURI
      const urls = Object.fromEntries(Object.entries(dictionaries).map(([dict, path]) => [dict, new URL(path, base).href]))
      this.send({ type: 'config', dictionaries: urls })
    }
    return this.worker
  }

  private send(msg: WorkerRequest) {
    this.w.postMessage(msg)
  }

  private receive(event: WorkerEvent) {
    if (event.type === 'result' || event.type === 'suggestions') {
      const resolve = this.waiting.get(event.id)
      this.waiting.delete(event.id)
      resolve?.((event.type === 'result' ? event.results : event.list) as never)
    } else this.onEvent(event)
  }

  check(paragraphs: Paragraph[], options: CheckOptions): Promise<CheckResult[]> {
    const id = this.nextId++
    return new Promise((resolve) => {
      this.waiting.set(id, resolve as (value: never) => void)
      this.send({ type: 'check', id, paragraphs, options })
    })
  }

  // Suggestions from a dictionary (by id, see dictOf).
  suggest(word: string, dict: string): Promise<string[]> {
    const id = this.nextId++
    return new Promise((resolve) => {
      this.waiting.set(id, resolve as (value: never) => void)
      this.send({ type: 'suggest', id, word, dict })
    })
  }

  setPersonal(lang: Lang, words: string[]): void {
    this.send({ type: 'personal', lang, words })
  }

  disableRule(rule: string): void {
    this.send({ type: 'disable-rule', rule })
  }
}
