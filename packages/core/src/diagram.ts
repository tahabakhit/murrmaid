// Draws one mermaid diagram with beautiful-mermaid, then decides whether the
// drawing is good enough to show in place of the source. Every check that
// fails returns a reason instead of a drawing; nothing here throws.

import { renderMermaidASCII } from 'beautiful-mermaid'

export interface Options {
  /** Widest drawing allowed, in terminal columns. Wider ones fall back. */
  width?: number
  /** Draw with ASCII (+ - | >) instead of Unicode box drawing. */
  ascii?: boolean
  /** Colour the drawing with the terminal's 16 ANSI colours. */
  color?: boolean
}

export type Result =
  | { ok: true; type: DiagramType; drawing: string }
  | { ok: false; type: string; reason: string }

export type DiagramType = 'flowchart' | 'state' | 'sequence' | 'class' | 'er' | 'xychart'

// Large diagrams take beautiful-mermaid's router seconds to lay out, and a
// host redraws often. Anything bigger than this stays as source.
const MAX_SOURCE_CHARS = 20_000
const MAX_SOURCE_LINES = 400

// Header lines beautiful-mermaid recognises, mirroring its own detection.
const HEADERS: [RegExp, DiagramType][] = [
  [/^(graph|flowchart)(\s+(TD|TB|BT|LR|RL))?\s*;?$/i, 'flowchart'],
  [/^stateDiagram(-v2)?\s*$/i, 'state'],
  [/^sequenceDiagram\s*$/i, 'sequence'],
  [/^classDiagram\s*$/i, 'class'],
  [/^erDiagram\s*$/i, 'er'],
  [/^xychart(-beta)?(\s+(horizontal|vertical))?\s*$/i, 'xychart'],
]

// Words of mermaid's own syntax, which a drawing need not show.
const KEYWORDS: Record<DiagramType, string[]> = {
  flowchart: ['graph', 'flowchart', 'td', 'tb', 'bt', 'lr', 'rl', 'subgraph', 'end', 'direction'],
  state: ['statediagram', 'v2', 'state', 'as', 'direction', 'td', 'tb', 'bt', 'lr', 'rl', 'end', 'fork', 'join', 'choice', 'note', 'left', 'right', 'of'],
  sequence: [
    'sequencediagram', 'participant', 'actor', 'as', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'end', 'critical',
    'break', 'rect', 'rgb', 'rgba', 'activate', 'deactivate', 'autonumber', 'note', 'over', 'left', 'right', 'of',
  ],
  class: ['classdiagram', 'class', 'direction', 'td', 'tb', 'bt', 'lr', 'rl'],
  er: ['erdiagram'],
  xychart: ['xychart', 'beta', 'horizontal', 'vertical', 'title', 'x', 'y', 'axis'],
}

// Lines that style or annotate a diagram rather than add to what it shows.
const STYLE_LINE = /^(style|classDef|linkStyle|click|accTitle|accDescr)\b/
const FLOWCHART_CLASS_LINE = /^class\s/
const XY_DATA_LINE = /^(bar|line)\b/

const WORD = /[\p{L}\p{N}_]+/gu
// Characters a terminal draws two columns wide, or zero: beautiful-mermaid
// counts each as one, so boxes around them come out misaligned.
const NOT_ONE_COLUMN = new RegExp(
  '[\\p{M}\\p{Extended_Pictographic}' +
    '\\u{1100}-\\u{115F}\\u{2E80}-\\u{A4CF}\\u{AC00}-\\u{D7A3}\\u{F900}-\\u{FAFF}' + // Hangul Jamo, CJK, Hangul
    '\\u{FE00}-\\u{FE0F}\\u{FE30}-\\u{FE4F}\\u{FF00}-\\u{FF60}\\u{FFE0}-\\u{FFE6}' + // variation selectors, fullwidth
    '\\u{200B}-\\u{200F}\\u{20000}-\\u{3FFFD}]', // zero-width marks, CJK extensions
  'u',
)
const ANSI = /\x1b\[[0-9;]*m/g

export function drawDiagram(source: string, options: Options = {}): Result {
  const lines = source.split(/\r?\n/).filter(line => !line.trim().startsWith('%%'))
  const header = lines.find(line => line.trim() !== '')?.trim() ?? ''
  const type = HEADERS.find(([pattern]) => pattern.test(header))?.[1]
  const fail = (reason: string): Result => ({ ok: false, type: type ?? (header.split(/\s+/)[0] || 'empty'), reason })

  if (header === '') return fail('empty diagram')
  if (header === '---') return fail('front matter is not supported')
  if (type === undefined) return fail(`unsupported diagram type "${header.split(/\s+/)[0]}"`)
  if (source.length > MAX_SOURCE_CHARS || lines.length > MAX_SOURCE_LINES) return fail('diagram too large')
  if (NOT_ONE_COLUMN.test(source) || source.includes('\t')) return fail('wide, zero-width or tab characters')

  const text = lines.join('\n')
  let drawing: string
  try {
    drawing = renderMermaidASCII(text, { useAscii: options.ascii === true, colorMode: options.color ? 'ansi16' : 'none' })
  } catch (error) {
    return fail(`parse error: ${error instanceof Error ? error.message : String(error)}`)
  }

  drawing = tidy(drawing)
  const plain = drawing.replace(ANSI, '')
  if (plain.trim() === '') return fail('nothing drawn')
  const missing = missingWords(type, lines, plain)
  if (missing.length > 0) return fail(`drawing leaves out ${missing.slice(0, 3).map(w => `"${w}"`).join(', ')}`)
  const columns = Math.max(...plain.split('\n').map(line => [...line].length))
  if (options.width !== undefined && columns > options.width) return fail(`too wide (${columns} > ${options.width} columns)`)
  return { ok: true, type, drawing }
}

// Drops trailing spaces and blank lines, which beautiful-mermaid pads with.
function tidy(drawing: string): string {
  return drawing
    .split('\n')
    .map(line => line.replace(/[ \t]+((\x1b\[[0-9;]*m)*)$/, '$1'))
    .join('\n')
    .replace(/^(\s*\n)+/, '')
    .replace(/(\n\s*)+$/, '')
}

// beautiful-mermaid does not reject much malformed input: it draws what it
// understood and drops the rest. So check that every word the source would
// show (labels, names, messages) appears somewhere in the drawing. Ids that
// only name a node with a label of its own are exempt, as are keywords.
function missingWords(type: DiagramType, lines: string[], drawing: string): string[] {
  const keywords = new Set(KEYWORDS[type])
  const shown = new Set(drawing.match(WORD) ?? [])
  const ids = new Set<string>()
  const body = lines.slice(1).map(line => line.trim()).filter(line => {
    if (STYLE_LINE.test(line)) return false
    if (type === 'flowchart' && FLOWCHART_CLASS_LINE.test(line)) return false
    if (type === 'xychart' && XY_DATA_LINE.test(line)) return false
    return true
  })
  for (const line of body) {
    // `A[Label]`, `A(Label)`, `A{Label}`, `A>Label]`: A is an id.
    for (const match of line.matchAll(/([\p{L}\p{N}_]+)(?=\s*[[({>])/gu)) ids.add(match[1]!)
    // `participant A as Alice`, `state "Long" as S1`: A and S1 are ids.
    const alias = /^(?:participant|actor|state)\s+("[^"]*"|[\p{L}\p{N}_]+)\s+as\s+("[^"]*"|[\p{L}\p{N}_]+)/u.exec(line)
    if (alias) {
      const [, first = '', second = ''] = alias
      ids.add((type === 'state' ? second : first).replace(/"/g, ''))
    }
  }
  const missing = new Set<string>()
  for (const line of body) {
    for (const word of line.match(WORD) ?? []) {
      if (!/\p{L}/u.test(word) || keywords.has(word.toLowerCase()) || ids.has(word) || shown.has(word)) continue
      missing.add(word)
    }
  }
  return [...missing]
}
