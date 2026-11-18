// murrmaid for Claude Code: before an assistant reply is drawn in the
// terminal, replace each ```mermaid fence in its text with a Unicode drawing
// and let Claude Code's own markdown renderer draw the rest. A diagram that
// can't be drawn well, and any failure here, leaves the reply as it was.
// Only the drawing changes; the stored message keeps the mermaid source.

import type { Register } from 'claude-code'
import { renderMarkdown } from './murrmaid.js'

// Columns the reply's bullet and gutter ("⏺ ") take before its text.
const GUTTER = 2
// Recent replies, so redraws while streaming or scrolling skip the layout.
const CACHE_SIZE = 64
const cache = new Map<string, string>()

function draw(text: string, width: number): string {
  const key = `${width}\0${text}`
  let drawn = cache.get(key)
  if (drawn === undefined) {
    drawn = renderMarkdown(text, { width })
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
    cache.set(key, drawn)
  }
  return drawn
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    // Terminal only, with a known width, and only text holding a mermaid fence.
    if (e.surface !== 'terminal' || e.viewport === undefined || e.props.isSummary) return next(e)
    if (!/mermaid/i.test(e.props.text)) return next(e)

    const text = draw(e.props.text, e.viewport.columns - GUTTER)
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  }).catch(($, e, next) => next(e))
}
