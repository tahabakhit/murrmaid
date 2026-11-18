// Flowcharts and state diagrams that beautiful-mermaid 1.1.3 cannot lay out.
//
// Its edge router is an A* search over a grid with no bound. When an edge's
// end point can't be reached, the search runs until a Map holds 2^24 entries
// and throws, about 25 seconds later. A host's render hook would freeze for
// that long, so these diagrams are refused before drawing. Two layouts do it,
// both found by reading src/ascii/grid.ts and src/ascii/edge-bundling.ts of
// the pinned version (see docs/upstream-notes.md):
//
// 1. In top-down layouts, edges that share a source or a target are routed
//    together, entering each target through the top of its box. A target
//    in the first row has no room above it, so it can't be reached.
// 2. Positions per level live in an array of 100, four slots per level, so a
//    node placed 25 or more levels deep gets NaN coordinates.
//
// The check over-approximates the renderer's own choices from the parsed
// graph: it may refuse a diagram that would have drawn, never the reverse.

import { parseMermaid } from 'beautiful-mermaid'

/** More nodes than this could reach level 25 (problem 2 above). */
export const MAX_GRAPH_NODES = 24

export type Graph = ReturnType<typeof parseMermaid>
type Edge = Graph['edges'][number]

/** The renderer's own reading of a flowchart or state diagram. */
export const parseGraph = (source: string): Graph => parseMermaid(source)

/** Why the renderer would hang on this flowchart or state diagram, if it would. */
export function layoutProblem(graph: Graph): string | undefined {
  if (graph.nodes.size > MAX_GRAPH_NODES) return `more than ${MAX_GRAPH_NODES} nodes`
  // Edges are bundled only in top-down layouts; bottom-up is laid out top-down.
  if (graph.direction === 'LR' || graph.direction === 'RL') return undefined

  const firstRow = firstRowCandidates(graph)
  const unlabelled = (edges: Edge[]) => edges.every(edge => !edge.label)
  // Edges into one target are bundled when there are two or more, all
  // unlabelled and of one style.
  for (const [target, edges] of group(graph, edge => edge.target)) {
    const oneStyle = edges.every(edge => edge.style === edges[0]!.style)
    if (edges.length >= 2 && unlabelled(edges) && oneStyle && firstRow.has(target)) return blocked(target)
  }
  // Edges out of one source are bundled from those left over by the step
  // above, so any two or more unlabelled edges of one style may be.
  for (const edges of group(graph, edge => edge.source).values()) {
    if (!unlabelled(edges)) continue
    for (const style of new Set(edges.map(edge => edge.style))) {
      const same = edges.filter(edge => edge.style === style)
      const target = same.find(edge => firstRow.has(edge.target))?.target
      if (same.length >= 2 && target !== undefined) return blocked(target)
    }
  }
  return undefined
}

const blocked = (target: string) => `edges into "${target}" can't be routed`

// Nodes the renderer may place in the first row: every node not yet reached
// by an edge from a node before it (its roots), and every node in a subgraph
// laid out left to right, which can sit level with its parent.
function firstRowCandidates(graph: Graph): Set<string> {
  const candidates = new Set<string>()
  const reached = new Set<string>()
  for (const id of graph.nodes.keys()) {
    if (!reached.has(id)) candidates.add(id)
    reached.add(id)
    for (const edge of graph.edges) if (edge.source === id) reached.add(edge.target)
  }
  const visit = (subgraphs: Graph['subgraphs'], directed: boolean) => {
    for (const subgraph of subgraphs) {
      const inside = directed || subgraph.direction === 'LR' || subgraph.direction === 'RL'
      if (inside) for (const id of subgraph.nodeIds) candidates.add(id)
      visit(subgraph.children, inside)
    }
  }
  visit(graph.subgraphs, false)
  return candidates
}

// Edges grouped by one end, leaving out self-loops, as the renderer does.
function group(graph: Graph, end: (edge: Edge) => string): Map<string, Edge[]> {
  const groups = new Map<string, Edge[]>()
  for (const edge of graph.edges) {
    if (edge.source === edge.target || !graph.nodes.has(edge.source) || !graph.nodes.has(edge.target)) continue
    const key = end(edge)
    const edges = groups.get(key)
    if (edges) edges.push(edge)
    else groups.set(key, [edge])
  }
  return groups
}
