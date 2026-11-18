# Notes for beautiful-mermaid

Renderer problems seen while building murrmaid, against beautiful-mermaid
1.1.3 and its ASCII renderer (`renderMermaidASCII`). murrmaid does not patch
the renderer; where it can detect a problem, the diagram falls back to source.
Each is a candidate upstream issue. None has been filed yet.

## Parsing

1. `A-->B` without spaces around the arrow draws one node labelled `A--`.
   Mermaid accepts it.
2. A `%%` comment or `%%{init: ...}%%` directive on the first line makes the
   header unrecognised.
3. Front matter (`---` ... `---`) throws `Invalid mermaid header`.
4. `direction TB` inside a flowchart (outside a subgraph) is drawn as a node
   called `direction`.
5. Malformed input is drawn partially and silently instead of throwing:
   `A[unclosed --> B` draws only `A`; a broken sequence diagram returns an
   empty string; a subgraph with an unclosed label loses the label.

## Content left out

6. State diagram notes (`note right of X : text`) are not drawn.
7. Class method parameters are dropped: `+eat(food) bool` is drawn as
   `+eat: bool`.
8. ER attribute comments (`string name "full name"`) are not drawn.
9. The xychart y-axis title is not drawn.

## Layout

10. Labels with wide characters (CJK, emoji) misalign borders, because widths
    are counted in code units, not terminal columns.
11. ER relationship labels overlap entity borders (e.g. `││───○╟│`, a label
    drawn under a border).
12. Flowchart labels are sometimes one column off centre (`│  Done │`).

## How murrmaid copes

| Problem | murrmaid |
| --- | --- |
| 1, 4, 5, 6, 7, 8, 9 | the word check finds a missing word and falls back |
| 2, 3 | falls back (parse error, front matter) |
| 10 | falls back on wide or zero-width characters |
| 11, 12 | drawn as is |
