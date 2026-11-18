// murrmaid for Pi: a display-only markdown transformer that replaces each
// ```mermaid fence in an assistant reply with a Unicode drawing before Pi
// renders it. A diagram murrmaid can't draw well stays a mermaid fence, which
// Pi's own Mermaid renderer (setting `markdown.mermaid`) may still draw.
// See https://pi.dev/docs/latest/extensions (pi.registerMarkdownTransformer).

import { renderMarkdown } from './murrmaid.js'

// The part of Pi's ExtensionAPI this extension uses (Pi 0.84.0 and later;
// getSettings is newer, so it may be missing).
interface Pi {
  registerMarkdownTransformer(
    transform: (markdown: string, context: { availableWidth: number }) => string,
    options?: { messageTypes: string[] },
  ): void
  getSettings?(): { markdown?: { codeBlockIndent?: unknown } } | undefined
}

// Pi indents code blocks by `markdown.codeBlockIndent`, two spaces by default.
const DEFAULT_INDENT = '  '

export default function murrmaid(pi: Pi): void {
  const indent = (): number => {
    const value = pi.getSettings?.()?.markdown?.codeBlockIndent
    return [...(typeof value === 'string' ? value : DEFAULT_INDENT)].length
  }
  pi.registerMarkdownTransformer(
    (markdown, { availableWidth }) => {
      if (!/mermaid/i.test(markdown)) return markdown
      // Without a width there's no telling what fits, so draw nothing.
      if (!Number.isFinite(availableWidth)) return markdown
      // renderMarkdown keeps each diagram's drawing, so the redraw on every
      // streaming update doesn't lay it out again.
      return renderMarkdown(markdown, { width: availableWidth - indent() })
    },
    { messageTypes: ['assistant'] },
  )
}
