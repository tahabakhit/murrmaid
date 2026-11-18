// murrmaid core: markdown in, the same markdown out with each ```mermaid
// fence replaced by a fenced Unicode drawing, or left exactly as it was when
// the diagram can't be drawn well. Pure and synchronous: no I/O, no host.

import { drawDiagram, type Options, type Result } from './diagram.ts'
import { findFences } from './fences.ts'

export { drawDiagram, type DiagramType, type Options, type Result } from './diagram.ts'

export interface Diagram {
  /** 1-based line of the opening ```mermaid fence. */
  line: number
  result: Result
}

export interface Scan {
  /** The markdown with every drawable diagram replaced. */
  markdown: string
  /** Each mermaid fence found, in order, with how it was handled. */
  diagrams: Diagram[]
}

/** Replaces each drawable ```mermaid fence and reports on every one. */
export function scan(markdown: string, options: Options = {}): Scan {
  const diagrams: Diagram[] = []
  let output = ''
  let copied = 0
  try {
    for (const fence of findFences(markdown)) {
      if (fence.language !== 'mermaid') continue
      const width = options.width === undefined ? undefined : options.width - fence.indent.length
      const result = drawDiagram(fence.body, { ...options, width })
      diagrams.push({ line: fence.line, result })
      if (!result.ok) continue
      output += markdown.slice(copied, fence.start) + toFence(result.drawing, fence.indent, fence.eol)
      copied = fence.end
    }
    return { markdown: output + markdown.slice(copied), diagrams }
  } catch {
    // Unreachable by design; if it happens, the input is still the answer.
    return { markdown, diagrams }
  }
}

/** The markdown with each drawable ```mermaid fence replaced by its drawing. */
export function renderMarkdown(markdown: string, options: Options = {}): string {
  return scan(markdown, options).markdown
}

// A plain-text fence, long enough that no backtick run in the drawing closes it.
function toFence(drawing: string, indent: string, eol: string): string {
  const longestRun = Math.max(0, ...(drawing.match(/`+/g) ?? []).map(run => run.length))
  const marker = '`'.repeat(Math.max(3, longestRun + 1))
  const lines = [marker + 'text', ...drawing.split('\n'), marker]
  return lines.map(line => indent + line).join(eol)
}
