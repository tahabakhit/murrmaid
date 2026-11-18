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
export const MAX_SOURCE_CHARS = 20_000
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

// Syntax inside a line that is not drawn as words: line breaks and `:::name`
// style shorthand.
const LINE_BREAK = /<br\s*\/?>/gi
// A style name's hyphens stop short of an arrow: `Idle:::active-->B`.
const STYLE_SHORTHAND = /:::[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*/gu

// Arrows are not drawn as words either, but only those beautiful-mermaid
// draws with their meaning are exempt. Any other arrow falls back: the
// renderer drops its edge or draws it as a plain arrow (`--o`, `--x`, `~~~`,
// sequence `-x`, ER `}o`).
const EDGE_RUN = /<?[-=.~]{2,}>?/g
const FLOWCHART_EDGES = new Set(['-->', '--->', '<-->', '<--->', '---', '-.->', '<-.->', '-.-', '==>', '<==>', '==='])
const TEXT_EDGE_OPEN = new Set(['--', '-.', '==', '<--', '<-.', '<=='])
// `A -- label --> B`, as src/parser.ts reads it: the shortest label.
const TEXT_EDGE_REST = /^\s+(.+?)\s+(-->|---|\.->|-\.-|==>|===)/
// beautiful-mermaid's own message pattern (src/sequence/parser.ts).
const SEQUENCE_MESSAGE = /^(\S+?)\s*(--?>?>|--?[)x]|--?>>|--?>)\s*([+-]?)(\S+?)\s*:\s*(.+)$/
// beautiful-mermaid's own relation patterns (src/class/parser.ts and
// src/er/parser.ts). A line whose part before any ":" holds `--` or `..` is
// a relation, and falls back unless it matches one of these. Class `--`
// is left out: it is drawn with an arrowhead the source does not have.
const CLASS_RELATION =
  /^(\S+?)\s+(?:"([^"]*?)"\s+)?(<\|--|<\|\.\.|\*--|o--|-->|--\*|--o|--\|>|\.\.>|\.\.\|>|<--|<\.\.)\s+(?:"([^"]*?)"\s+)?(\S+?)(?:\s*:\s*(.+))?$/
const ER_RELATION = /^(\S+)\s+([|o}{]+)(--|\.\.)([|o}{]+)\s+(\S+)\s*:\s*(.+)$/
const RELATION_LINE = /--|\.\./
// Each side's characters, sorted, as src/er/parser.ts accepts them.
const ER_ENDS = new Set(['||', 'o|', '|}', '{|', 'o{'])

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

  const body = lines.slice(first + 1).map(line => (type === 'state' ? stateStyles(line) : line))
  const text = [type === 'flowchart' ? flowchartHeader(header) : header, ...body].join('\n')
  if (body.some(line => NOT_ONE_COLUMN.test(line))) return fail('wide, zero-width or control characters')
  if (type === 'flowchart' && topLevelDirection(body)) return fail('direction outside a subgraph')
  const content = contentLines(type, body).map(line => readLine(type, line))
  const unsupported = content.find(line => line.unsupported !== undefined)?.unsupported
  if (unsupported !== undefined) return fail(`unsupported arrow "${unsupported}"`)

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
  const missing = missingWords(type, content, plain)
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

// State diagrams skip a transition written with `Idle:::name`, which only
// styles, so the shorthand is removed from state names before drawing. A
// label, after the first ":" that isn't part of one, is kept as written.
function stateStyles(line: string): string {
  const style = new RegExp('^' + STYLE_SHORTHAND.source, 'u')
  let shown = ''
  let from = 0
  for (;;) {
    const colon = line.indexOf(':', from)
    const match = colon === -1 ? null : style.exec(line.slice(colon))
    if (match === null) return shown + line.slice(from)
    shown += line.slice(from, colon)
    from = colon + match[0].length
  }
}

// A flowchart's `direction` belongs in a subgraph. At the top level
// beautiful-mermaid draws it as a node called "direction".
function topLevelDirection(body: string[]): boolean {
  let depth = 0
  for (const line of body.map(line => line.trim())) {
    if (/^subgraph(\s|$)/.test(line)) depth++
    else if (/^end\s*;?$/.test(line)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && /^direction\s+(TB|TD|BT|LR|RL)\s*;?$/i.test(line)) return true
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

// The trimmed lines that add to what a diagram shows.
function contentLines(type: DiagramType, lines: string[]): string[] {
  return lines
    .map(line => line.trim())
    .filter(line => !STYLE_LINE.test(line))
    .filter(line => !(type === 'xychart' && XY_DATA_LINE.test(line)))
    .filter(line => !((type === 'flowchart' || type === 'state') && CLASS_LINE.test(line)))
}

interface Line {
  /** The words the drawing should show, with arrows and ids' syntax removed. */
  text: string
  /** Ids the drawing shows by a label of their own instead. */
  ids: string[]
  /** An arrow the renderer would not draw as written. */
  unsupported?: string
}

// beautiful-mermaid does not reject much malformed input: it draws what it
// understood and drops the rest. So check that every word the source would
// show (labels, names, messages) appears somewhere in the drawing. Keywords
// are exempt, and so are ids the drawing replaces with a label of their own.
function missingWords(type: DiagramType, lines: Line[], drawing: string): string[] {
  const keywords = new Set(KEYWORDS[type])
  const shown = new Set(drawing.match(WORD) ?? [])
  const ids = new Set(lines.flatMap(line => line.ids))
  const missing = new Set<string>()
  for (const { text } of lines) {
    for (const word of text.match(WORD) ?? []) {
      if (!/\p{L}/u.test(word) || keywords.has(word.toLowerCase()) || ids.has(word) || shown.has(word)) continue
      missing.add(word)
    }
  }
  return [...missing]
}

function readLine(type: DiagramType, line: string): Line {
  const text = line.replace(LINE_BREAK, ' ')
  switch (type) {
    case 'flowchart':
      return flowchartLine(text.replace(STYLE_SHORTHAND, ' '))
    case 'sequence': {
      const message = SEQUENCE_MESSAGE.exec(text)
      if (message === null) return { text, ids: aliasIds(type, text) }
      const [, from, arrow, , to, label] = message as unknown as string[]
      // `-x` is drawn as a plain arrow, and `A<<->>B` as an actor named "A<<".
      if (arrow!.includes('x') || from!.endsWith('<') || to!.startsWith('>')) return { text, ids: [], unsupported: `${from}${arrow}${to}` }
      return { text: `${from} ${to}: ${label}`, ids: [] }
    }
    case 'class': {
      if (!RELATION_LINE.test(text.split(':')[0]!)) return { text, ids: [] }
      const relation = CLASS_RELATION.exec(text)
      if (relation === null) return { text, ids: [], unsupported: text.split(':')[0]!.trim() }
      const [, from, fromCount = '', , toCount = '', to, label = ''] = relation
      return { text: [from, fromCount, toCount, to, label].join(' '), ids: [] }
    }
    case 'er': {
      if (!RELATION_LINE.test(text.split(':')[0]!)) return { text, ids: [] }
      const relation = ER_RELATION.exec(text)
      if (relation === null || !ER_ENDS.has(sorted(relation[2]!)) || !ER_ENDS.has(sorted(relation[4]!))) {
        return { text, ids: [], unsupported: text.split(':')[0]!.trim() }
      }
      return { text: [relation[1], relation[5], relation[6]].join(' '), ids: [] }
    }
    case 'state': {
      // `S1 : The first state` shows the description in place of S1.
      const described = /^([\p{L}\p{N}_]+)\s*:/u.exec(text)
      return { text, ids: [...aliasIds(type, text), ...(described ? [described[1]!] : [])] }
    }
    default:
      return { text, ids: [] }
  }
}

const sorted = (chars: string): string => [...chars].sort().join('')

// `participant A as Alice`: A is an id. `state "Long" as S1`: S1 is.
function aliasIds(type: DiagramType, line: string): string[] {
  const alias = /^(?:participant|actor|state)\s+("[^"]*"|[\p{L}\p{N}_]+)\s+as\s+("[^"]*"|[\p{L}\p{N}_]+)/u.exec(line)
  return alias ? [(type === 'state' ? alias[2]! : alias[1]!).replace(/"/g, '')] : []
}

// In a flowchart, a node id is a word outside any label that a shape opens
// right after: `A[Label]`, `A(Label)`, `A{Label}`, `A>Label]`. Words in
// brackets, quotes or `|edge labels|` are text to check, never ids, and
// arrows are looked for only outside them. A subgraph's id is not drawn when
// it has a title: `subgraph web-app [Web]`.
function flowchartLine(line: string): Line {
  const text = line.replace(/^(subgraph\s+)\S+?\s*(?=\[)/, '$1')
  const ids: string[] = []
  let outside = ''
  let depth = 0
  let quoted = false
  let edgeLabel = false
  let word = ''
  for (const char of text) {
    const before = quoted || edgeLabel || depth > 0
    if (quoted) {
      quoted = char !== '"'
    } else if (char === '"') {
      quoted = true
    } else if (depth === 0 && char === '|') {
      edgeLabel = !edgeLabel
    } else if (edgeLabel) {
      // inside |edge label|
    } else if ('[({'.includes(char) || (char === '>' && depth === 0 && word !== '')) {
      if (depth === 0 && word !== '') ids.push(word)
      depth++
    } else if (')]}'.includes(char)) {
      depth = Math.max(0, depth - 1)
    } else if (depth === 0 && /[\p{L}\p{N}_]/u.test(char)) {
      word += char
      outside += char
      continue
    }
    word = ''
    outside += before || quoted || edgeLabel || depth > 0 || char === '|' ? ' '.repeat(char.length) : char
  }

  // Blank out each arrow, or report the first one not drawn as written. A
  // circle or cross end (`--o`, `x--`, `---xB`) is never drawn.
  let shown = text
  const blank = (start: number, end: number) => {
    shown = shown.slice(0, start) + ' '.repeat(end - start) + shown.slice(end)
  }
  const marker = (i: number) => /[ox]/.test(outside[i] ?? '')
  const wordChar = (i: number) => /[\p{L}\p{N}_]/u.test(outside[i] ?? ' ')
  const space = (i: number) => /\s/.test(outside[i] ?? ' ')
  const runs = new RegExp(EDGE_RUN.source, 'g')
  for (let match = runs.exec(outside); match !== null; match = runs.exec(outside)) {
    const arrow = match[0]
    const start = match.index
    let end = start + arrow.length
    let last = arrow
    const startMarker = !arrow.startsWith('<') && marker(start - 1) && !wordChar(start - 2)
    if (startMarker) return { text, ids, unsupported: text.slice(start - 1, end + 1).trim() }
    if (!arrow.endsWith('>') && marker(end)) return { text, ids, unsupported: text.slice(start, end + 1) }
    if (TEXT_EDGE_OPEN.has(arrow) && space(end)) {
      const rest = TEXT_EDGE_REST.exec(outside.slice(end))
      if (rest === null) return { text, ids, unsupported: arrow }
      blank(start, end)
      const close = end + rest[0].length - rest[2]!.length
      last = rest[2]!
      end = close + last.length
      blank(close, end)
      runs.lastIndex = end
    } else if (FLOWCHART_EDGES.has(arrow)) {
      blank(start, end)
    } else {
      return { text, ids, unsupported: arrow }
    }
    if (!last.endsWith('>') && marker(end)) return { text, ids, unsupported: text.slice(start, end + 1) }
  }
  return { text: shown, ids }
}
