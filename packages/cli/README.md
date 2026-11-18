# murrmaid

murrmaid draws Mermaid diagrams as Unicode box drawing in the terminal. It
takes markdown and returns the same markdown with each ` ```mermaid ` fence
replaced by a drawing, or left exactly as it was when the diagram can't be
drawn well. It ships as a small library, a CLI, and thin adapters for AI
coding tools. The drawing itself is done by
[beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid).

````text
```mermaid
flowchart LR
  A[Write] --> B[Review]
```
````

becomes

````text
```text
┌───────┐     ┌────────┐
│       │     │        │
│ Write ├────►│ Review │
│       │     │        │
└───────┘     └────────┘
```
````

No network access, telemetry, binaries, runtime downloads or install
scripts. MIT licensed.

## How it is split

| Part | Path | What it is |
| --- | --- | --- |
| core | `packages/core` | The library. `renderMarkdown(markdown, options)` and `scan(...)`. Pure, synchronous, no I/O, knows no host. |
| cli | `packages/cli` | `murrmaid`: file or stdin in, stdout out. Works in pipes and pagers. |
| Claude Code | `adapters/claude-code` | A mod that redraws mermaid fences in assistant replies. |
| Pi | `adapters/pi` | A markdown transformer extension. |
| Codex | `adapters/codex` | A skill that has the agent run the CLI. Codex has no render hook. |

Each adapter is a few lines over core. The Claude Code and Pi adapters
import a bundled copy of core (`murrmaid.js`, built by `scripts/build.ts`),
so they need no install step.

### Core

```ts
import { renderMarkdown, scan, drawDiagram } from '@murrmaid/core'

renderMarkdown(markdown, { width: 100 }) // markdown with drawable diagrams replaced
scan(markdown, { width: 100 })           // { markdown, diagrams: [{ line, result }] }
drawDiagram(source, { width: 100 })      // { ok: true, type, drawing } | { ok: false, type, reason }
```

Options: `width` (widest drawing allowed, in columns; unlimited when
omitted), `ascii` (ASCII characters instead of Unicode box drawing),
`color` (the terminal's 16 ANSI colours, so it suits light and dark
themes). A drawn diagram becomes a ` ```text ` fence with the fence's
original indentation and line endings. Core never throws.

## Install

### Claude Code

Needs Claude Code v2.1.287 or later (mods). In Claude Code:

```text
/plugin marketplace add tahabakhit/murrmaid
/plugin install murrmaid@murrmaid
```

Then start a new session, or run `/reload-plugins`. To try it from a
checkout without installing, run `claude --plugin-dir adapters/claude-code`.

The mod hooks `ui.render` for `AssistantMessage` in the terminal. It
rewrites only the text it is handed, replacing drawable mermaid fences, and
leaves everything else to Claude Code's own markdown renderer. The stored
message, and so the model's context, keeps the mermaid source. Desktop, VS
Code and mobile are left alone. If anything goes wrong, the reply is drawn as
if the mod were not there. `adapters/claude-code` is self-contained: its
licence, notices and the bundled core sit inside it.

### CLI

murrmaid is not on npm yet. From a checkout (the CLI is committed prebuilt,
so there is nothing to build):

```sh
npm install --global ./packages/cli
```

```text
murrmaid [options] [file]

  -w, --width <n>  widest drawing allowed (default: terminal width, else 80)
  -a, --ascii      draw with ASCII characters instead of Unicode
      --color      colour drawings with ANSI codes (default: on for a terminal)
      --no-color   never colour drawings (also: NO_COLOR=1)
      --check      list each diagram and why it would fall back; exit 1 if any do
```

```console
$ murrmaid README.md | less -R
$ murrmaid --check docs/design.md
docs/design.md:12: flowchart: drawn
docs/design.md:40: pie: falls back: unsupported diagram type "pie"
2 diagram(s), 1 would fall back
```

It reads stdin when no file (or `-`) is given. When stdout is piped, the
width comes from stderr's terminal, then `COLUMNS`, then 80. Exit codes: 0
done, 1 `--check` found a fallback, 2 bad arguments or an unreadable file.

### Pi

```sh
pi install git:github.com/tahabakhit/murrmaid@v0.1.1
```

Or load it for one session with
`pi -e /path/to/murrmaid/adapters/pi/index.ts`. The extension registers a
display-only `pi.registerMarkdownTransformer` for assistant messages, and
fits drawings to Pi's width less its `markdown.codeBlockIndent`.

Pi has its own Mermaid renderer, which is on by default (setting
`markdown.mermaid`). It draws diagrams before extension transformers see
them, so murrmaid only takes effect with `"markdown": { "mermaid": "off" }`
in Pi's settings. Pi's renderer also draws pie charts. Use murrmaid in Pi
only if you want the same drawings as in the other hosts.

### Codex

Codex has no hook for changing how replies are drawn, so no adapter is
possible. Codex 0.156.0 and later has its own terminal Mermaid renderer for
a subset of flowchart, sequence, state, class and ER syntax
([openai/codex#35628](https://github.com/openai/codex/issues/35628),
[codex-rs/mermaid](https://github.com/openai/codex/tree/main/codex-rs/mermaid)).
For anything else, `adapters/codex/skills/murrmaid` is a short skill that
has the agent run the CLI and paste its drawing. Install the CLI, then copy
the skill into Codex's user skills folder:

```sh
cp -R adapters/codex/skills/murrmaid ~/.agents/skills/
```

## Supported diagrams

| Drawn | Left as source |
| --- | --- |
| `flowchart` / `graph`, `stateDiagram` / `stateDiagram-v2`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `xychart-beta` | everything else, including `pie`, `gantt`, `mindmap`, `gitGraph`, `timeline`, `journey` |

Fallback is the point: when in doubt, the original block is kept byte for
byte. A diagram stays as source when:

- its type is not in the table above;
- it is a flowchart or state diagram that beautiful-mermaid would take
  around 25 seconds to give up on: more than 24 nodes, or edges routed into
  the top row of a top-down layout (see
  [docs/upstream-notes.md](docs/upstream-notes.md)). murrmaid checks this
  before drawing, from the renderer's own parse of the diagram;
- beautiful-mermaid throws, or draws nothing;
- the drawing leaves out a word the source would show, such as a label,
  name, message or note. beautiful-mermaid draws what it understood and
  silently drops the rest, so murrmaid checks every word of the source
  (keywords, styling lines and ids that carry their own labels excepted)
  against the drawing;
- it has front matter (`---`), which would carry a title;
- it contains wide or zero-width characters (CJK, emoji, combining marks,
  anything beyond U+FFFF) or control characters such as tabs, which the
  renderer misaligns (`%%` comment lines don't count);
- a flowchart sets `direction` outside a subgraph;
- it is wider than the available width;
- it is larger than 20,000 characters or 400 lines;
- the fence is not closed yet, as while a reply streams.

`murrmaid --check` prints the reason for each.

## Limits

- Fences are found by the CommonMark rules for fenced code blocks indented
  up to three spaces. A mermaid fence inside a blockquote, or nested more
  deeply in a list, is left alone.
- Drawing quality is beautiful-mermaid's. murrmaid does not patch the
  renderer. Problems found while building this are in
  [docs/upstream-notes.md](docs/upstream-notes.md).
- The word check can't catch a diagram that is drawn with every word in the
  wrong place. It can reject a diagram that is drawn correctly when the
  renderer formats a word differently, such as class method parameters, and
  the layout check refuses some top-down flowcharts that would have drawn.
  In both cases the diagram stays as source.
- Each diagram's result is cached (128 entries) by its source, width and
  options, so a host that redraws a reply on every streamed token lays each
  diagram out once.
- The Claude Code adapter draws without colour, because Claude Code renders
  the fence as code.

## Rebuilding

The bundled files are generated and committed. To rebuild them from the
pinned versions in `package-lock.json` and check that they match:

```sh
npm ci                         # installs with scripts disabled (.npmrc)
npm run build                  # writes the bundles and copies the notices
npm run check:bundles          # fails if a committed bundle differs from a fresh build
```

This covers the adapters' `murrmaid.js`, the CLI's `packages/cli/dist`, and
the licence, notice and README copies beside them, so packing the CLI
(`npm pack -w packages/cli`) needs no build step; `.npmrc` turns lifecycle
scripts off.

`scripts/build.ts` bundles `packages/core` with beautiful-mermaid's ASCII
renderer and mermaid parser (`src/ascii/index.ts`, `src/parser.ts`),
unmodified. The SVG path, and with it elkjs
and entities, is not bundled. The build fails if a bundle holds `require(`,
`import(`, `fetch(`, `eval(`, a WebSocket, a package not listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), or more than 1 MiB.

## Development

```sh
npm test               # core and CLI tests (node --test)
npm run typecheck
npm run test:mod       # claude plugin validate + claude plugin test on the mod
```

Node 22.18 or later runs the TypeScript sources directly.

## Licence

MIT, see [LICENSE](LICENSE). Bundled third-party code: see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
