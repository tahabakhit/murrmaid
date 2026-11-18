// murrmaid: draw the ```mermaid fences in a markdown file (or stdin) as
// Unicode box drawings and write the result to stdout.

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { scan } from '@murrmaid/core'

export const VERSION = '0.1.0'

const HELP = `Usage: murrmaid [options] [file]

Draws each \`\`\`mermaid fence in markdown as a Unicode box drawing and writes
the markdown to stdout. Reads stdin when no file (or "-") is given. A diagram
that can't be drawn well is left exactly as it was.

Options:
  -w, --width <n>  widest drawing allowed (default: terminal width, else 80)
  -a, --ascii      draw with ASCII characters instead of Unicode
      --color      colour drawings with ANSI codes (default: on for a terminal)
      --no-color   never colour drawings (also: NO_COLOR=1)
      --check      list each diagram and why it would fall back; exit 1 if any do
  -h, --help       show this help
  -v, --version    show the version
`

export interface Io {
  stdin: () => string
  stdout: (text: string) => void
  stderr: (text: string) => void
  /** Whether stdout is a terminal, which turns colour on by default. */
  isTty: boolean
  /** The terminal's width, when known. */
  columns?: number
  env: NodeJS.ProcessEnv
}

/** Runs the CLI and returns its exit code; all I/O goes through `io`. */
export function main(argv: string[], io: Io): number {
  let args
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      allowNegative: true,
      options: {
        width: { type: 'string', short: 'w' },
        ascii: { type: 'boolean', short: 'a' },
        color: { type: 'boolean' },
        check: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    })
  } catch (error) {
    io.stderr(`murrmaid: ${(error as Error).message}\n`)
    return 2
  }
  const { values, positionals } = args
  if (values.help) {
    io.stdout(HELP)
    return 0
  }
  if (values.version) {
    io.stdout(`${VERSION}\n`)
    return 0
  }
  if (positionals.length > 1) {
    io.stderr('murrmaid: give at most one file\n')
    return 2
  }

  const width = values.width === undefined ? (io.columns ?? (Number(io.env.COLUMNS) || 80)) : Number(values.width)
  if (!Number.isInteger(width) || width < 1) {
    io.stderr('murrmaid: --width must be a positive whole number\n')
    return 2
  }

  const file = positionals[0] ?? '-'
  let input: string
  try {
    input = file === '-' ? io.stdin() : readFileSync(file, 'utf8')
  } catch (error) {
    io.stderr(`murrmaid: cannot read ${file}: ${(error as NodeJS.ErrnoException).code ?? (error as Error).message}\n`)
    return 2
  }

  const color = values.color ?? (io.isTty && !io.env.NO_COLOR)
  const result = scan(input, { width, ascii: values.ascii === true, color: values.check ? false : color })

  if (!values.check) {
    io.stdout(result.markdown)
    return 0
  }
  const name = file === '-' ? '<stdin>' : file
  for (const { line, result: r } of result.diagrams) {
    io.stdout(r.ok ? `${name}:${line}: ${r.type}: drawn\n` : `${name}:${line}: ${r.type}: falls back: ${r.reason}\n`)
  }
  const fallbacks = result.diagrams.filter(d => !d.result.ok).length
  io.stdout(`${result.diagrams.length} diagram(s), ${fallbacks} would fall back\n`)
  return fallbacks > 0 ? 1 : 0
}
