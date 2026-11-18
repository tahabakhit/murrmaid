// Run with: claude plugin test adapters/claude-code
import type { TestBody } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

const FLOW = '```mermaid\ngraph LR\n  A[Start] --> B[Done]\n```'
const SEQUENCE = '```mermaid\nsequenceDiagram\n  Alice->>Bob: hello\n```'
const PIE = '```mermaid\npie title Pets\n  "Dogs" : 3\n```'

// Mounts a reply and returns the text the mod handed to Claude Code's renderer.
async function textDrawn(
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  text: string,
  options: { surface?: 'terminal' | 'desktop'; columns?: number; isSummary?: true } = {},
): Promise<string | undefined> {
  let seen: string | undefined
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    seen = e.props.text
    const { Text } = $.ui.resolve(e)
    return Text({ children: ['drawn'] })
  })
  const ui = await $.ui.mount({
    plugin: 'murrmaid',
    surface: options.surface ?? 'terminal',
    component: 'AssistantMessage',
    viewport: { columns: options.columns ?? 100, rows: 40 },
    props: { text, isFirstOfReply: true, ...(options.isSummary ? { isSummary: true } : {}) },
  })
  await ui.unmount()
  return seen
}

test('draws a flowchart and a sequence diagram, leaves a pie chart as source', async ($, on) => {
  const reply = `Here:\n\n${FLOW}\n\nand\n\n${SEQUENCE}\n\nand\n\n${PIE}\n`
  const text = await textDrawn($, on, reply)
  expect(text).toContain('Here:\n\n```text\n┌')
  expect(text).toContain('│ Start ├')
  expect(text).toContain('hello')
  expect(text).toContain(PIE)
  expect(text?.match(/```mermaid/g)?.length).toBe(1)
})

test('a reply with no mermaid is handed on unchanged', async ($, on) => {
  const reply = 'Just text, and `code`.\n\n```ts\nconst x = 1\n```\n'
  expect(await textDrawn($, on, reply)).toBe(reply)
})

test('a diagram wider than the terminal stays as source', async ($, on) => {
  const reply = `Wide:\n\n${FLOW}\n`
  expect(await textDrawn($, on, reply, { columns: 12 })).toBe(reply)
})

test('other surfaces are left alone', async ($, on) => {
  expect(await textDrawn($, on, `${FLOW}\n`, { surface: 'desktop' })).toBe(`${FLOW}\n`)
})

test('summaries are left alone', async ($, on) => {
  expect(await textDrawn($, on, `${FLOW}\n`, { isSummary: true })).toBe(`${FLOW}\n`)
})
