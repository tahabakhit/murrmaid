import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { VERSION } from '../src/cli.ts'

const BIN = fileURLToPath(new URL('../src/bin.ts', import.meta.url))
const SAMPLE = fileURLToPath(new URL('../../../examples/sample.md', import.meta.url))
const sample = readFileSync(SAMPLE, 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'murrmaid-'))
after(() => rmSync(dir, { recursive: true, force: true }))

function run(args: string[], input?: string) {
  const env = { ...process.env, NO_COLOR: '', COLUMNS: '' }
  const { status, stdout, stderr } = spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8', env })
  return { status, stdout, stderr }
}

function assertDrawn(stdout: string) {
  assert.match(stdout, /┌─+┐/)
  assert.match(stdout, /Pull request/)
  assert.match(stdout, /upload package/)
  assert.equal(stdout.match(/```mermaid/g)?.length, 1, 'only the pie chart stays as source')
  assert.ok(stdout.includes('```mermaid\npie title Build time\n  "Tests" : 60'))
  assert.ok(stdout.includes('```sh\nnpm test\n```'))
  assert.ok(stdout.startsWith('# Release flow\n\nHow a change reaches users.\n\n```text\n'))
}

test('draws a file to stdout', () => {
  const { status, stdout, stderr } = run([SAMPLE, '--width', '100'])
  assert.equal(stderr, '')
  assert.equal(status, 0)
  assertDrawn(stdout)
})

test('reads stdin, with no file or with -', () => {
  for (const args of [['-w', '100'], ['-', '-w', '100']]) {
    const { status, stdout } = run(args, sample)
    assert.equal(status, 0)
    assertDrawn(stdout)
  }
})

test('keeps utf-8 and CRLF intact', () => {
  const file = join(dir, 'crlf.md')
  const text = 'Café ✓\r\n\r\n```mermaid\r\ngraph LR\r\n  A[Start] --> B[End]\r\n```\r\nFin — ok\r\n'
  writeFileSync(file, text, 'utf8')
  const { stdout } = run([file])
  assert.ok(stdout.startsWith('Café ✓\r\n\r\n```text\r\n┌'))
  assert.ok(stdout.endsWith('\r\n```\r\nFin — ok\r\n'))
})

test('--check lists every diagram and why it falls back', () => {
  const { status, stdout } = run([SAMPLE, '--check', '--width', '100'])
  assert.equal(status, 1)
  assert.equal(
    stdout,
    `${SAMPLE}:5: flowchart: drawn\n` +
      `${SAMPLE}:15: sequence: drawn\n` +
      `${SAMPLE}:26: pie: falls back: unsupported diagram type "pie"\n` +
      '3 diagram(s), 1 would fall back\n',
  )
})

test('--check on stdin, a narrow width, and a clean file', () => {
  const narrow = run(['--check', '--width', '20'], sample)
  assert.match(narrow.stdout, /<stdin>:5: flowchart: falls back: too wide \(\d+ > 20 columns\)/)
  const clean = run(['--check'], '```mermaid\ngraph TD\n  A --> B\n```\n')
  assert.equal(clean.status, 0)
  assert.equal(clean.stdout, '<stdin>:1: flowchart: drawn\n1 diagram(s), 0 would fall back\n')
})

test('a diagram wider than --width is left as source', () => {
  const { stdout } = run([SAMPLE, '--width', '20'])
  assert.equal(stdout, sample)
})

test('--ascii and --color', () => {
  const ascii = run([SAMPLE, '--ascii', '-w', '100']).stdout
  assert.match(ascii, /\+-+\+/)
  assert.doesNotMatch(ascii, /[┌─│]/)
  assert.match(run([SAMPLE, '--color', '-w', '100']).stdout, /\x1b\[/)
  assert.doesNotMatch(run([SAMPLE, '-w', '100']).stdout, /\x1b\[/, 'no colour when stdout is not a terminal')
})

test('errors and help', () => {
  const missing = run([join(dir, 'nope.md')])
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /cannot read .*nope\.md: ENOENT/)
  assert.equal(run(['--width', 'x']).status, 2)
  assert.equal(run(['--bogus']).status, 2)
  assert.equal(run(['a.md', 'b.md']).status, 2)
  assert.match(run(['--help']).stdout, /Usage: murrmaid/)
  assert.equal(run(['--version']).stdout, `${VERSION}\n`)
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  assert.equal(VERSION, pkg.version)
})
