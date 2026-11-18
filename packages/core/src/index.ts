// murrmaid core: markdown in, the same markdown out with each ```mermaid
// fence replaced by a fenced Unicode drawing, or left exactly as it was when
// the diagram can't be drawn well. Pure and synchronous: no I/O, no host.

import { drawDiagram, MAX_SOURCE_CHARS, type Options, type Result } from './diagram.ts'
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
      const result = cachedDraw(fence.body, { ...options, width })
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

// Hosts redraw a reply on every streamed token and when it scrolls back into
// view. Results are kept per diagram, not per reply, so each diagram is laid
// out once per width however often the text around it changes. The cache
// changes no result, so scan stays a pure function of its arguments.
const CACHE_SIZE = 128
const cache = new Map<string, Result>()

function cachedDraw(source: string, options: Options): Result {
  // A source too large to draw, or an odd width, is not worth keeping.
  const { width } = options
  if (source.length > MAX_SOURCE_CHARS || (width !== undefined && !Number.isFinite(width))) return drawDiagram(source, options)
  const key = JSON.stringify([width ?? null, options.ascii === true, options.color === true, source])
  let result = cache.get(key)
  if (result !== undefined) {
    cache.delete(key) // most recently used last
  } else {
    result = Object.freeze(drawDiagram(source, options))
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  }
  cache.set(key, result)
  return result
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
