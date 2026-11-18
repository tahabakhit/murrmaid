// Draws one mermaid diagram with beautiful-mermaid, then decides whether the
// drawing is good enough to show in place of the source. Every check that
// fails returns a reason instead of a drawing; nothing here throws.

import { renderMermaidASCII } from 'beautiful-mermaid'
import { layoutProblem } from './layout.ts'

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

// Sequence, class, ER and XY diagrams this size draw in well under a second.
// Flowcharts and state diagrams are limited further in layout.ts.
const MAX_SOURCE_CHARS = 20_000
const MAX_SOURCE_LINES = 400

// Header lines beautiful-mermaid recognises. A flowchart header without a
// direction, or ending in ";", is valid mermaid the renderer rejects, so it
// is rewritten first (flowchartHeader).
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
  flowchart: ['subgraph', 'end', 'direction', 'td', 'tb', 'bt', 'lr', 'rl'],
  state: ['state', 'as', 'direction', 'td', 'tb', 'bt', 'lr', 'rl', 'end', 'fork', 'join', 'choice', 'note', 'left', 'right', 'of'],
  sequence: [
    'participant', 'actor', 'as', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'end', 'critical',
    'break', 'rect', 'rgb', 'rgba', 'activate', 'deactivate', 'autonumber', 'note', 'over', 'left', 'right', 'of',
  ],
  class: ['class', 'direction', 'td', 'tb', 'bt', 'lr', 'rl'],
  er: [],
  xychart: ['title', 'x', 'y', 'axis'],
}

// Lines that style or annotate a diagram rather than add to what it shows.
const STYLE_LINE = /^(style|classDef|linkStyle|click|accTitle|accDescr)\b/
// `class A,B name` styles nodes in flowcharts and state diagrams.
const CLASS_LINE = /^class\s/
const XY_DATA_LINE = /^(bar|line)\b/

// Syntax inside a line that is not drawn as words: line breaks, `:::name`
// style shorthand, and arrows whose letters the drawing shows as symbols
// (flowchart `--o` and `x--x`, sequence `-x`, class `o--`, ER `|o--o{`).
const LINE_BREAK = /<br\s*\/?>/gi
const STYLE_SHORTHAND = /:::[\p{L}\p{N}_-]+/gu
const ALONE = (pattern: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, 'gu')
const FLOWCHART_ARROW = ALONE('[<ox]?(?:-{2,}|={2,}|-\\.+-)[>ox]?')
const CLASS_ARROW = ALONE('(?:<\\||[<*o])?(?:--|\\.\\.)(?:\\|>|[>*o])?')
const SEQUENCE_ARROW = /(?:<<)?--?(?:>>|>|x|\))[+-]?/g
const ER_CARDINALITY = /[|}][|o](?:--|\.\.)[|o][|{]/g

const WORD = /[\p{L}\p{N}_]+/gu
// Characters a terminal draws two columns wide or none, and control
// characters. beautiful-mermaid counts each as one column, and each half of
// a character beyond U+FFFF as one more, so boxes around them misalign.
const NOT_ONE_COLUMN = new RegExp(
  '[\\p{Cc}\\p{M}\\p{Emoji_Presentation}\\u{10000}-\\u{10FFFF}' + // controls, marks, emoji, beyond U+FFFF
    '\\u{1100}-\\u{115F}\\u{2E80}-\\u{A4CF}\\u{AC00}-\\u{D7A3}\\u{F900}-\\u{FAFF}' + // Hangul Jamo, CJK, Hangul
    '\\u{FE00}-\\u{FE0F}\\u{FE30}-\\u{FE4F}\\u{FF00}-\\u{FF60}\\u{FFE0}-\\u{FFE6}' + // variation selectors, fullwidth
    '\\u{00AD}\\u{200B}-\\u{200F}\\u{2060}-\\u{2064}\\u{FEFF}]', // soft hyphen, zero-width characters
  'u',
)
const ANSI = /\x1b\[[0-9;]*m/g

export function drawDiagram(source: string, options: Options = {}): Result {
  const lines = source.split(/\r?\n/).filter(line => !line.trim().startsWith('%%'))
  const first = lines.findIndex(line => line.trim() !== '')
  const header = first === -1 ? '' : lines[first]!.trim()
  const type = HEADERS.find(([pattern]) => pattern.test(header))?.[1]
  const fail = (reason: string): Result => ({ ok: false, type: type ?? (header.split(/\s+/)[0] || 'empty'), reason })

  if (header === '') return fail('empty diagram')
  if (header === '---') return fail('front matter is not supported')
  if (type === undefined) return fail(`unsupported diagram type "${header.split(/\s+/)[0]}"`)
  if (source.length > MAX_SOURCE_CHARS || lines.length > MAX_SOURCE_LINES) return fail('diagram too large')

  const body = lines.slice(first + 1)
  const text = [type === 'flowchart' ? flowchartHeader(header) : header, ...body].join('\n')
  if (body.some(line => NOT_ONE_COLUMN.test(line))) return fail('wide, zero-width or control characters')
  if (type === 'flowchart' && topLevelDirection(body)) return fail('direction outside a subgraph')

  let drawing: string
  try {
    const problem = type === 'flowchart' || type === 'state' ? layoutProblem(text) : undefined
    if (problem !== undefined) return fail(`layout would not finish: ${problem}`)
    drawing = renderMermaidASCII(text, { useAscii: options.ascii === true, colorMode: options.color ? 'ansi16' : 'none' })
  } catch (error) {
    return fail(`parse error: ${error instanceof Error ? error.message : String(error)}`)
  }

  drawing = tidy(drawing)
  const plain = drawing.replace(ANSI, '')
  if (plain.trim() === '') return fail('nothing drawn')
  const missing = missingWords(type, body, plain)
  if (missing.length > 0) return fail(`drawing leaves out ${missing.slice(0, 3).map(w => `"${w}"`).join(', ')}`)
  const columns = Math.max(...plain.split('\n').map(line => [...line].length))
  if (options.width !== undefined && columns > options.width) return fail(`too wide (${columns} > ${options.width} columns)`)
  return { ok: true, type, drawing }
}

// `graph` alone means top-down, and a trailing ";" is allowed.
function flowchartHeader(header: string): string {
  const [keyword = 'graph', direction = 'TD'] = header.replace(/;$/, '').trim().split(/\s+/)
  return `${keyword} ${direction}`
}

// A flowchart's `direction` belongs in a subgraph. At the top level
// beautiful-mermaid draws it as a node called "direction".
function topLevelDirection(body: string[]): boolean {
  let depth = 0
  for (const line of body.map(line => line.trim())) {
    if (/^subgraph\b/.test(line)) depth++
    else if (/^end\b/.test(line)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && /^direction\b/.test(line)) return true
  }
  return false
}

// Drops trailing spaces and blank lines, which beautiful-mermaid pads with.
function tidy(drawing: string): string {
  const lines = drawing.split('\n').map(line => line.replace(/[ \t]+((\x1b\[[0-9;]*m)*)$/, '$1'))
  let start = 0
  let end = lines.length
  while (start < end && lines[start]!.trim() === '') start++
  while (end > start && lines[end - 1]!.trim() === '') end--
  return lines.slice(start, end).join('\n')
}

// beautiful-mermaid does not reject much malformed input: it draws what it
// understood and drops the rest. So check that every word the source would
// show (labels, names, messages) appears somewhere in the drawing. Keywords
// are exempt, and so are ids the drawing replaces with a label of their own.
function missingWords(type: DiagramType, lines: string[], drawing: string): string[] {
  const keywords = new Set(KEYWORDS[type])
  const shown = new Set(drawing.match(WORD) ?? [])
  const ids = new Set<string>()
  const body: string[] = []
  for (const raw of lines) {
    const line = shownText(type, raw.trim())
    if (STYLE_LINE.test(line)) continue
    if (type === 'xychart' && XY_DATA_LINE.test(line)) continue
    if ((type === 'flowchart' || type === 'state') && CLASS_LINE.test(line)) continue
    labelledIds(type, line, ids)
    body.push(line)
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

function shownText(type: DiagramType, line: string): string {
  const text = line.replace(LINE_BREAK, ' ')
  switch (type) {
    case 'flowchart':
      return text.replace(STYLE_SHORTHAND, ' ').replace(FLOWCHART_ARROW, ' ')
    case 'state':
      return text.replace(STYLE_SHORTHAND, ' ')
    case 'class':
      return text.replace(CLASS_ARROW, ' ')
    case 'er':
      return text.replace(ER_CARDINALITY, ' -- ')
    case 'sequence': {
      // Only the part before the message's ":" holds an arrow.
      const colon = text.indexOf(':')
      return colon === -1 ? text : text.slice(0, colon).replace(SEQUENCE_ARROW, ' ') + text.slice(colon)
    }
    default:
      return text
  }
}

// Adds the ids on this line that the drawing shows by a label instead.
function labelledIds(type: DiagramType, line: string, ids: Set<string>): void {
  if (type === 'flowchart') flowchartIds(line, ids)
  if (type === 'sequence' || type === 'state') {
    // `participant A as Alice`: A is an id. `state "Long" as S1`: S1 is.
    const alias = /^(?:participant|actor|state)\s+("[^"]*"|[\p{L}\p{N}_]+)\s+as\s+("[^"]*"|[\p{L}\p{N}_]+)/u.exec(line)
    if (alias) ids.add((type === 'state' ? alias[2]! : alias[1]!).replace(/"/g, ''))
  }
  if (type === 'state') {
    // `S1 : The first state` shows the description in place of S1.
    const described = /^([\p{L}\p{N}_]+)\s*:/u.exec(line)
    if (described) ids.add(described[1]!)
  }
}

// In a flowchart, a node id is a word outside any label that a shape opens
// right after: `A[Label]`, `A(Label)`, `A{Label}`, `A>Label]`, and the id of
// `subgraph S [Title]`. Words in brackets, quotes or `|edge labels|` are
// text to check, never ids.
function flowchartIds(line: string, ids: Set<string>): void {
  const subgraph = /^subgraph\s+([\p{L}\p{N}_]+)\s*\[/u.exec(line)
  if (subgraph) ids.add(subgraph[1]!)
  let depth = 0
  let quoted = false
  let edgeLabel = false
  let word = ''
  for (const char of line) {
    if (quoted) {
      quoted = char !== '"'
    } else if (char === '"') {
      quoted = true
    } else if (depth === 0 && char === '|') {
      edgeLabel = !edgeLabel
    } else if (edgeLabel) {
      // inside |edge label|
    } else if ('[({'.includes(char) || (char === '>' && depth === 0 && word !== '')) {
      if (depth === 0 && word !== '') ids.add(word)
      depth++
    } else if (')]}'.includes(char)) {
      depth = Math.max(0, depth - 1)
    } else if (depth === 0 && /[\p{L}\p{N}_]/u.test(char)) {
      word += char
      continue
    }
    word = ''
  }
}
