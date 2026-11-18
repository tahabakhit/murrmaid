// Finds fenced code blocks in markdown, following the CommonMark rules that
// matter here: a fence opens with three or more backticks or tildes indented
// by at most three spaces, and closes with a run of the same character at
// least as long. Anything else (blockquotes, deeper list nesting, an
// unclosed fence while a reply streams) is left for the caller to ignore.

export interface Fence {
  /** Offset of the opening fence line in the markdown. */
  start: number
  /** Offset just past the closing fence's text, before its line ending. */
  end: number
  /** 1-based line number of the opening fence. */
  line: number
  /** Spaces before the opening fence; reused for the replacement. */
  indent: string
  /** Line ending of the opening fence line: '\n' or '\r\n'. */
  eol: string
  /** First word of the info string, lowercased ('mermaid', 'ts', ''). */
  language: string
  /** The fence's content, with the fence's own indentation removed. */
  body: string
}

const OPENING = /^( {0,3})(`{3,}|~{3,})(.*)$/
const CLOSING = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

export function findFences(markdown: string): Fence[] {
  const fences: Fence[] = []
  const lines = markdown.split(/(?<=\n)/)
  let open: { start: number; line: number; indent: string; eol: string; marker: string; language: string; body: string[] } | undefined
  let offset = 0

  lines.forEach((raw, index) => {
    const text = raw.replace(/\r?\n$/, '')
    if (open === undefined) {
      const match = OPENING.exec(text)
      const [, indent = '', marker = '', info = ''] = match ?? []
      // A backtick fence's info string may not contain a backtick.
      if (match && !(marker.startsWith('`') && info.includes('`'))) {
        const language = info.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
        open = { start: offset, line: index + 1, indent, eol: raw.endsWith('\r\n') ? '\r\n' : '\n', marker, language, body: [] }
      }
    } else {
      const closing = CLOSING.exec(text)?.[1]
      if (closing !== undefined && closing[0] === open.marker[0] && closing.length >= open.marker.length) {
        fences.push({
          start: open.start,
          end: offset + text.length,
          line: open.line,
          indent: open.indent,
          eol: open.eol,
          language: open.language,
          body: open.body.join('\n'),
        })
        open = undefined
      } else {
        open.body.push(stripIndent(text, open.indent.length))
      }
    }
    offset += raw.length
  })
  return fences
}

function stripIndent(line: string, width: number): string {
  let cut = 0
  while (cut < width && line[cut] === ' ') cut++
  return line.slice(cut)
}
