// Types for murrmaid.js, the bundled core (see packages/core/src/index.ts).

export interface Options {
  /** Widest drawing allowed, in terminal columns. Wider ones fall back. */
  width?: number
  /** Draw with ASCII (+ - | >) instead of Unicode box drawing. */
  ascii?: boolean
  /** Colour the drawing with the terminal's 16 ANSI colours. */
  color?: boolean
}

/** The markdown with each drawable ```mermaid fence replaced by its drawing. */
export declare function renderMarkdown(markdown: string, options?: Options): string
