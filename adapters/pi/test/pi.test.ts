import assert from 'node:assert/strict'
import { test } from 'node:test'
import murrmaid from '../index.ts'

const reply = '```mermaid\ngraph LR\n  A[One] --> B[Two]\n```\n'

function transformer(indent?: unknown) {
  let transform: ((markdown: string, context: { availableWidth: number }) => string) | undefined
  murrmaid({
    registerMarkdownTransformer: fn => void (transform = fn),
    getSettings: () => ({ markdown: { codeBlockIndent: indent } }),
  })
  return transform!
}

test('draws within the width left by the code-block indent', () => {
  const out = transformer()(reply, { availableWidth: 80 })
  assert.match(out, /^```text\n/)
  const columns = Math.max(...out.split('\n').map(line => [...line].length))
  assert.equal(transformer()(reply, { availableWidth: columns + 1 }), reply)
  assert.notEqual(transformer()(reply, { availableWidth: columns + 2 }), reply)
})

test('leaves the reply alone when the width or indent is unknown', () => {
  assert.equal(transformer()(reply, { availableWidth: Number.NaN }), reply)
  assert.equal(transformer('　')(reply, { availableWidth: 80 }), reply)
  assert.equal(transformer('\t')(reply, { availableWidth: 80 }), reply)
  assert.notEqual(transformer('    ')(reply, { availableWidth: 80 }), reply)
})
