#!/usr/bin/env node
// Entry point: wires the CLI to this process's streams and terminal.

import { readFileSync } from 'node:fs'
import { main } from './cli.ts'

process.stdout.on('error', error => {
  // A pager that quits early closes the pipe; that is not a failure.
  if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0)
  throw error
})

process.exitCode = main(process.argv.slice(2), {
  stdin: () => readFileSync(0, 'utf8'),
  stdout: text => void process.stdout.write(text),
  stderr: text => void process.stderr.write(text),
  isTty: process.stdout.isTTY === true,
  // Piped into a pager, stdout has no width, but stderr is often still the terminal.
  columns: process.stdout.columns || process.stderr.columns || undefined,
  env: process.env,
})
