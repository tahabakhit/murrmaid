# Notes for beautiful-mermaid

Renderer problems seen while building murrmaid, against beautiful-mermaid
1.1.3 and its ASCII renderer (`renderMermaidASCII`). murrmaid does not patch
the renderer; where it can detect a problem, the diagram falls back to source.
Each is a candidate upstream issue. None has been filed yet.

## Layout that never finishes

1. The edge router (`getPath` in `src/ascii/pathfinder.ts`) is an A* search
   over a grid with no bound. When an edge's end point can't be reached, it
   explores the grid until its `costSoFar` Map reaches 2^24 entries and throws
   `RangeError: Map maximum size exceeded`, about 25 seconds later. A
   synchronous caller freezes for that long. Two layouts lead there:
   - **Bundled edges into the first row.** In TD layouts, two or more
     unlabelled edges of one style that share a target (fan-in) or a source
     (fan-out) are routed through a junction (`src/ascii/edge-bundling.ts`)
     and enter each target at the top centre of its box. For a node in grid
     row 0 that cell has no free neighbour, so it can't be reached. Smallest
     cases: `A --> B; B --> C; B --> A` and `C --> F; B --> D; B --> C`.
   - **Deep layouts.** `createMapping` in `src/ascii/grid.ts` keeps positions
     per level in `new Array(100)`, four slots per level. A node 25 levels
     deep reads `undefined`, gets NaN coordinates, and its edges can't be
     reached. Smallest case: a chain of 25 edges, `N0 --> N1 --> ... --> N25`,
     in any direction.

   A step limit in `getPath` (returning `null`, which `determinePath` already
   handles) would bound both.

## Parsing

2. `A-->B` without spaces around the arrow draws one node labelled `A--`.
   Mermaid accepts it.
3. A `%%` comment or `%%{init: ...}%%` directive on the first line makes the
   header unrecognised.
4. Front matter (`---` ... `---`) throws `Invalid mermaid header`.
5. `graph` without a direction (mermaid's default, top-down) and a header
   ending in `;` (`graph TD;`) throw `Invalid mermaid header`.
6. `direction TB` in a flowchart outside a subgraph is drawn as a node called
   `direction`.
7. Malformed input is drawn partially and silently instead of throwing:
   `A[unclosed --> B` draws only `A`; a broken sequence diagram returns an
   empty string; a subgraph with an unclosed label loses the label.

## Content left out

8. State diagram notes (`note right of X : text`) are not drawn.
9. Class method parameters are dropped: `+eat(food) bool` is drawn as
   `+eat: bool`.
10. A class annotation on its own line (`<<interface>> Shape`) is not drawn;
    inside the class body it is.
11. ER attribute comments (`string name "full name"`) are not drawn.
12. ER relationships with `}o..o{` are not drawn, nor are their entities.
13. The xychart y-axis title is not drawn.
14. Flowchart edges ending in a circle or cross (`A --o B`, `A --x B`) lose
    their target node.

## Layout

15. Labels with wide characters (CJK, emoji) or characters beyond U+FFFF
    (such as `𝐀` or flags) misalign borders, because widths are counted in
    UTF-16 code units, not terminal columns.
16. ER relationship labels overlap entity borders (e.g. `││───○╟│`, a label
    drawn under a border).
17. Flowchart labels are sometimes one column off centre (`│  Done │`).

## How murrmaid copes

| Problem | murrmaid |
| --- | --- |
| 1 | refuses flowcharts and state diagrams with those layouts before drawing, and any with more than 24 nodes (`packages/core/src/layout.ts`) |
| 2, 7, 8, 9, 10, 11, 12, 13, 14 | the word check finds a missing word and falls back |
| 3 | removes `%%` lines before drawing |
| 4 | falls back (front matter) |
| 5 | rewrites the header to `graph TD` first |
| 6 | falls back (direction outside a subgraph) |
| 15 | falls back on wide, zero-width, control or non-BMP characters |
| 16, 17 | drawn as is |
