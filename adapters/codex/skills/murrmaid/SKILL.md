---
name: murrmaid
description: Draw Mermaid diagrams as Unicode box drawing with the murrmaid CLI, to show the user a diagram the terminal would otherwise print as source, or to check which diagrams in a markdown file can be drawn. Use when the user asks to see, preview or check a mermaid diagram in the terminal.
---

# murrmaid

Codex cannot change how its replies are drawn, so draw the diagram first and
show the drawing.

1. Put the diagram in a markdown file inside a ```mermaid fence, or use the
   user's file.
2. Run `murrmaid --width <columns> <file>` (or pipe markdown to `murrmaid`).
   It prints the markdown with each drawable diagram replaced by a ```text
   block. Use the terminal width the user has, or 100 when unknown, and the
   same width in every step below.
3. Copy the ```text block into your reply unchanged. Do not redraw, align or
   trim it by hand.
4. If the diagram comes back as ```mermaid, it was not drawn. Run
   `murrmaid --check --width <columns> <file>` and tell the user the reason it prints (for
   example `unsupported diagram type "pie"` or `too wide`). Supported types:
   flowchart/graph, stateDiagram, sequenceDiagram, classDiagram, erDiagram,
   xychart-beta.

If `murrmaid` is not on PATH, say so and point the user to
https://github.com/tahabakhit/murrmaid#cli; do not install it yourself.
