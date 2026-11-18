// murrmaid for Claude Code: before an assistant reply is drawn in the
// terminal, replace each ```mermaid fence in its text with a Unicode drawing
// and let Claude Code's own markdown renderer draw the rest. A diagram that
// can't be drawn well, and any failure here, leaves the reply as it was.
// Only the drawing changes; the stored message keeps the mermaid source.

import type { Register } from 'claude-code'
import { renderMarkdown } from './murrmaid.js'

// Columns the reply's bullet and gutter ("⏺ ") take before its text.
const GUTTER = 2

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    // Terminal only, with a known width, and only text holding a mermaid fence.
    if (e.surface !== 'terminal' || e.viewport === undefined || e.props.isSummary) return next(e)
    if (!/mermaid/i.test(e.props.text)) return next(e)

    // viewport.columns is the conversation's width, which a docked pane narrows.
    // renderMarkdown keeps each diagram's drawing, so redraws while the reply
    // streams or scrolls don't lay it out again.
    const text = renderMarkdown(e.props.text, { width: e.viewport.columns - GUTTER })
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  }).catch(($, e, next) => next(e))
}
