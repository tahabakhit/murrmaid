// murrmaid for Pi: a display-only markdown transformer that replaces each
// ```mermaid fence in an assistant reply with a Unicode drawing before Pi
// renders it. A diagram murrmaid can't draw well stays a mermaid fence, which
// Pi's own Mermaid renderer (setting `markdown.mermaid`) may still draw.
// See https://pi.dev/docs/latest/extensions (pi.registerMarkdownTransformer).

import { renderMarkdown } from './murrmaid.js'

// The part of Pi's ExtensionAPI this extension uses (Pi 0.84.0 and later).
interface Pi {
  registerMarkdownTransformer(
    transform: (markdown: string, context: { isStreaming: boolean; availableWidth: number }) => string,
    options?: { messageTypes: string[] },
  ): void
}

// Pi indents code blocks by `markdown.codeBlockIndent`, two spaces by default.
const CODE_BLOCK_INDENT = 2
// Pi calls a transformer on every streaming update and redraw.
const CACHE_SIZE = 64
const cache = new Map<string, string>()

export default function murrmaid(pi: Pi): void {
  pi.registerMarkdownTransformer(
    (markdown, { availableWidth }) => {
      if (!/mermaid/i.test(markdown)) return markdown
      const width = availableWidth - CODE_BLOCK_INDENT
      const key = `${width}\0${markdown}`
      let drawn = cache.get(key)
      if (drawn === undefined) {
        drawn = renderMarkdown(markdown, { width })
        if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
        cache.set(key, drawn)
      }
      return drawn
    },
    { messageTypes: ['assistant'] },
  )
}
