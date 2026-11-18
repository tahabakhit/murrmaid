import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { drawDiagram, renderMarkdown, scan } from '@murrmaid/core'

const fence = (body: string, info = 'mermaid') => '```' + info + '\n' + body + '\n```'
const doc = (body: string) => `# Title\n\nBefore.\n\n${fence(body)}\n\nAfter.\n`

const SUPPORTED = {
  flowchart: ['graph TD\n  A[Start] --> B{Ready?}\n  B -->|yes| C[Ship]\n  B -->|no| A', ['Start', 'Ready', 'Ship', 'yes', 'no']],
  state: ['stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: start\n  Busy --> [*]', ['Idle', 'Busy', 'start']],
  sequence: ['sequenceDiagram\n  participant C as Client\n  C->>Server: request\n  Server-->>C: response', ['Client', 'Server', 'request']],
  class: ['classDiagram\n  Animal <|-- Dog\n  class Dog {\n    +String name\n    +bark()\n  }', ['Animal', 'Dog', 'name', 'bark']],
  er: ['erDiagram\n  CUSTOMER ||--o{ ORDER : places', ['CUSTOMER', 'ORDER', 'places']],
  xychart: ['xychart-beta\n  title "Sales"\n  x-axis [jan, feb, mar]\n  bar [3, 7, 2]', ['Sales', 'jan', 'mar']],
} as const

describe('supported diagram types draw', () => {
  for (const [type, [source, words]] of Object.entries(SUPPORTED)) {
    test(type, () => {
      const result = drawDiagram(source)
      assert.ok(result.ok, result.ok ? '' : result.reason)
      assert.equal(result.type, type)
      for (const word of words) assert.match(result.drawing, new RegExp(word))
      assert.match(result.drawing, /[─│┌└╭╰◇●]/)

      const out = renderMarkdown(doc(source))
      assert.ok(!out.includes('```mermaid'))
      assert.ok(out.startsWith('# Title\n\nBefore.\n\n```text\n'))
      assert.ok(out.endsWith('\n```\n\nAfter.\n'))
    })
  }
})

describe('mermaid syntax the renderer draws, though not word for word', () => {
  const cases: Record<string, string> = {
    'line breaks in labels': 'flowchart LR\n  A[Line one<br/>Line two] --> B[x]',
    'parentheses in a label': 'flowchart LR\n  A[call foo(x)] --> B',
    'direction in a subgraph': 'flowchart TD\n  subgraph S [Group]\n    direction LR\n    A[x] --> B[y]\n  end',
    'a tab or emoji in a comment': 'flowchart LR\n  %%\tnote 🚀\n  A[x] --> B[y]',
    'one-column symbols': 'flowchart LR\n  A[© ™ ↔ x] --> B[y]',
    'state description': 'stateDiagram-v2\n  S1 : The first state\n  [*] --> S1',
    'state class line': 'stateDiagram-v2\n  classDef bad fill:red\n  Idle --> Run\n  class Idle bad',
    'ER zero-or-one': 'erDiagram\n  CUSTOMER |o--o| ORDER : places',
    'class o-- arrow': 'classDiagram\n  Car o-- Wheel',
    'a hyphenated sequence name': 'sequenceDiagram\n  Client->>api-xray: ping',
    'a hyphenated subgraph id': 'flowchart TD\n  subgraph web-app [web]\n    A[x] --> B[y]\n  end',
    'a node called direction': 'flowchart LR\n  direction[North] --> B[South]',
    'a label with dashes': 'flowchart LR\n  A -- use --verbose --> B',
    'a node called end-user in a subgraph': 'flowchart TD\n  subgraph S [Group]\n    end-user[User] --> B[x]\n    direction LR\n  end',
    'a fork in a same-direction subgraph': 'flowchart TD\n  subgraph S [Group]\n    direction TD\n    A[a] --> B[b]\n    B --> C[c]\n    B --> D[d]\n  end',
    'a generic sequence actor': 'sequenceDiagram\n  List<T>->>Cache: lookup',
    'a class label with ..': 'classDiagram\n  A --> B : from .. to',
    'a subgraph title with ..': 'flowchart TD\n  subgraph Versions 1..4\n    A[A much wider first step] --> B[y]\n  end',
    'a hyphenated id before a thick arrow': 'flowchart LR\n  service-x ==> B',
    'a range in a class member': 'classDiagram\n  class Item {\n    +String[1..3] items\n  }',
    'a quoted state name with :::': 'stateDiagram-v2\n  state "Cache:::v2" as C\n  [*] --> C',
    'a quoted state name with an arrow': 'stateDiagram-v2\n  state "input --> output" as S\n  [*] --> S',
    'a quoted text-edge label': 'flowchart LR\n  A -- "approved" --> B',
    'a pipe in a text-edge label': 'flowchart LR\n  A -- ready | waiting --> B',
    'a labelled edge beside an undirected one': 'graph TD\n  A --- B\n  A -->|no| C',
    'an ER attribute called direction': 'erDiagram\n  CUSTOMER {\n    direction RL\n  }\n  CUSTOMER ||--o{ ORDER : places',
    'grouped edges': 'flowchart LR\n  A & B --> C --> D',
    'separate fan-out styles': 'graph TD\n  A --- B\n  A --- C\n  A -.-> D',
    'a comparison in a text-edge label': 'flowchart LR\n  A -- CPU>50% --> B',
    'triple colons in a label': 'flowchart LR\n  A[Cache:::v2] --> B[Store]',
    'every edge it draws': 'flowchart LR\n  A --> B --- C -.-> D -.- E ==> F === G\n  H <--> I <-.-> J <==> K ---> L <---> M\n  N -- one --> O -. two .-> P == three ==> Q\n  R -- "four" --> S',
  }
  for (const [name, source] of Object.entries(cases)) {
    test(name, () => {
      const result = drawDiagram(source)
      assert.ok(result.ok, result.ok ? '' : result.reason)
    })
  }
})

describe('fallback leaves the block exactly as it was', () => {
  const unchanged = (source: string, options = {}) => {
    const input = doc(source)
    assert.equal(renderMarkdown(input, options), input)
    const [diagram] = scan(input, options).diagrams
    assert.ok(diagram && !diagram.result.ok)
    return diagram.result.ok ? '' : diagram.result.reason
  }

  test('unsupported types', () => {
    assert.match(unchanged('pie title Pets\n  "Dogs" : 3\n  "Cats" : 2'), /unsupported diagram type "pie"/)
    assert.match(unchanged('gantt\n  title Plan\n  section A\n  Task :a1, 2024-01-01, 3d'), /"gantt"/)
    assert.match(unchanged('mindmap\n  root\n    a'), /"mindmap"/)
    assert.match(unchanged('gitGraph\n  commit\n  branch dev'), /"gitGraph"/)
  })

  test('malformed diagrams', () => {
    assert.match(unchanged('graph TD\n  A[unclosed --> B'), /leaves out "unclosed"/)
    assert.match(unchanged('graph LR\n  A-->B'), /leaves out/)
    assert.match(unchanged('sequenceDiagram\n  Alice-x>>\n  ???'), /nothing drawn|leaves out/)
    assert.match(unchanged('flowchart LR\n  A --> B\n  subgraph X\n  C'), /leaves out "X"/)
    assert.match(unchanged('not mermaid at all'), /unsupported/)
    assert.match(unchanged(''), /empty/)
  })

  test('content the renderer would drop or misalign', () => {
    assert.match(unchanged('---\ntitle: T\n---\ngraph LR\n  A --> B'), /front matter/)
    assert.match(unchanged('graph LR\n  A[你好] --> B[ok]'), /wide/)
    assert.match(unchanged('graph LR\n  A[🚀 go] --> B[ok]'), /wide/)
    assert.match(unchanged('graph LR\n  A[𝐀𝐁𝐂 x] --> B[ok]'), /wide/)
    assert.match(unchanged('graph LR\n  A[🇺🇸 x] --> B[ok]'), /wide/)
    assert.match(unchanged('graph LR\n  A[a\tb] --> B[ok]'), /control/)
    assert.match(unchanged('stateDiagram-v2\n  [*] --> A\n  note right of A: important'), /notes are not drawn/)
    assert.match(unchanged('classDiagram\n  class Shape\n  <<interface>> Shape'), /leaves out "interface"/)
    assert.match(unchanged('erDiagram\n  C }o..o{ D : maybe'), /unsupported arrow/)
    assert.match(unchanged('flowchart TD\n  direction LR\n  A[x] --> B[y]'), /direction outside a subgraph/)
    assert.match(unchanged('flowchart TD\n  Direction TD\n  A[x] --> B[y]'), /direction outside a subgraph/)
  })

  // The renderer drops these edges, or draws them as a plain arrow, even
  // when every word still shows elsewhere.
  test('arrows not drawn as written', () => {
    assert.match(unchanged('flowchart LR\n  A --o B\n  B --> C'), /unsupported arrow "--o"/)
    assert.match(unchanged('flowchart LR\n  A --x B\n  B --> C'), /unsupported arrow "--x"/)
    assert.match(unchanged('flowchart LR\n  A x--x B\n  B --> C'), /unsupported arrow "x--x"/)
    assert.match(unchanged('flowchart LR\n  A ~~~ B\n  B --> C'), /unsupported arrow "~~~"/)
    assert.match(unchanged('flowchart LR\n  A ----> B\n  B --> C'), /unsupported arrow "---->"/)
    assert.match(unchanged('flowchart LR\n  A -.text.-> B\n  B --> C'), /unsupported arrow/)
    assert.match(unchanged('sequenceDiagram\n  Alice-xJohn: Hello'), /unsupported arrow "Alice-xJohn"/)
    assert.match(unchanged('sequenceDiagram\n  A<<->>B: hi'), /unsupported arrow/)
    assert.match(unchanged('erDiagram\n  A ||--|| B : x\n  A }o--|| B : x'), /unsupported arrow "A }o--\|\| B"/)
    assert.match(unchanged('classDiagram\n  A <|--|> B\n  A --> B'), /unsupported arrow "A <\|--\|> B"/)
    assert.match(unchanged('flowchart LR\n  A[Start] ---xB[Done]'), /unsupported arrow "---x"/)
    assert.match(unchanged('classDiagram\n  Group o-- Member\n  class Admin\n  Member<|--Admin'), /unsupported arrow "Member<\|--Admin"/)
    assert.match(unchanged('classDiagram\n  Car o-- Wheel\n  Wheel -- Road'), /unsupported arrow "Wheel -- Road"/)
  })

  test('edges the renderer would drop', () => {
    assert.match(unchanged('graph LR\n  A[One] --> B[Two]; B --> A;'), /several statements/)
    assert.match(unchanged('flowchart LR\n  A[First]:::hot-->B[Second]\n  B[Second]'), /style shorthand/)
    assert.match(unchanged('classDiagram\n  Order "1" o-- "0..*" LineItem : contains'), /multiplicities/)
    assert.match(unchanged('flowchart LR\n  A[first] --> B\n  A["first:::second"] --> C'), /leaves out "second"/)
  })

  test('an unclosed text edge is refused quickly', () => {
    const started = performance.now()
    assert.match(unchanged('flowchart LR\n  A -- "' + ' '.repeat(15000) + '"x B'), /unsupported arrow|too large/)
    assert.ok(performance.now() - started < 500)
  })

  test('what the renderer would draw wrongly', () => {
    assert.match(unchanged('graph\n  A[One] --> B[Two]'), /parse error/)
    assert.match(unchanged('graph TD;\n  A[One] --> B[Two];'), /parse error/)
    assert.match(unchanged('flowchart LR\n  A[x]:::warn --> B[y]'), /style shorthand/)
    assert.match(unchanged('stateDiagram-v2\n  [*] --> Idle\n  Idle:::active --> [*]'), /style shorthand/)
    assert.match(unchanged('graph RL\n  A --> B'), /right to left/)
    assert.match(unchanged('flowchart TD\n  A & B --- C'), /drawn wrongly: shared edges/)
    assert.match(unchanged('flowchart LR\n  A --> S\n  subgraph S [Grp]\n    X --> Y\n  end'), /edge into subgraph "S"/)
    assert.match(unchanged('stateDiagram-v2\n  Off --> On\n  state On {\n    X --> Y\n  }'), /edge into subgraph "On"/)
    assert.match(unchanged('stateDiagram-v2\n  A --> B\n  note right of A\n    B --> A\n  end note'), /notes are not drawn/)
    assert.match(unchanged('classDiagram\n  Folder o-- Folder : children'), /itself/)
    assert.match(unchanged('graph LR\n  A & B --> C; C --> A'), /several statements/)
    assert.match(unchanged('stateDiagram-v2\n  Idle:::active --> Run'), /style shorthand/)
    assert.match(unchanged('flowchart LR\n  A[First<br/>step] & B --> C\n  C-->B'), /leaves out 1 of 3 edges/)
    assert.match(unchanged('classDiagram\n  Bank o-- Account\n  Bank --> Account : owns'), /one pair/)
    assert.match(unchanged('erDiagram\n  A ||--o{ B : has\n  B }|--|| A : in'), /one pair/)
    assert.match(unchanged('erDiagram\n  EMPLOYEE |o--o| EMPLOYEE : manages'), /itself/)
    assert.match(unchanged('flowchart LR\n  A -- "x<br/> --> y" --> B\n  B --> C'), /unsupported arrow/)
    assert.match(unchanged('flowchart LR\n  A -- parse<br/>error --x B --> C'), /unsupported arrow/)
    assert.match(unchanged('flowchart LR\n  A["Example:<br/>A] --> B"]'), /adds 1 edges/)
    assert.match(unchanged('flowchart LR\n  C --> web-app\n  subgraph web-app\n    X --> Y\n  end'), /edge into subgraph "web-app"/)
    assert.match(unchanged('erDiagram\n  "EMPLOYEE" |o--o| EMPLOYEE : mentor'), /quoted names/)
    assert.match(unchanged('graph BT\n  A[First<br/>Second] --> B'), /bottom-up/)
    assert.match(unchanged('sequenceDiagram\n  Client->>Client: Clean<br/>up'), /oneself/)
  })

  // Each of these takes beautiful-mermaid about 25 seconds to give up on.
  test('layouts the renderer would not finish, refused at once', () => {
    const chain = (n: number) => 'graph LR\n' + Array.from({ length: n }, (_, i) => `  N${i} --> N${i + 1}`).join('\n')
    const started = performance.now()
    assert.match(unchanged('graph TD\n  A --> B\n  B --> C\n  B --> A'), /layout would not finish: edges into "A"/)
    assert.match(unchanged('graph TD\n  C --> F\n  B --> D\n  B --> C'), /layout would not finish: edges into "C"/)
    assert.match(unchanged('stateDiagram-v2\n  A --> A\n  B --> A\n  C --> A'), /layout would not finish/)
    assert.match(unchanged(chain(25)), /layout would not finish: more than 24 nodes/)
    assert.ok(performance.now() - started < 2000)
    // A labelled loop back to the start is routed on its own, and draws.
    assert.ok(drawDiagram('graph TD\n  A[Start] --> B{OK?}\n  B -->|yes| C[Done]\n  B -->|no| A').ok)
  })

  test('wider than the available width', () => {
    const long = 'graph LR\n' + Array.from({ length: 6 }, (_, i) => `  N${i}[Step ${i}] --> N${i + 1}[Step ${i + 1}]`).join('\n')
    assert.match(unchanged(long, { width: 40 }), /too wide \(\d+ > 40 columns\)/)
    assert.ok(drawDiagram(long, { width: 400 }).ok)
  })

  test('an unclosed fence, as while a reply streams', () => {
    const input = 'Text\n\n```mermaid\ngraph TD\n  A --> B\n'
    assert.equal(renderMarkdown(input), input)
    assert.deepEqual(scan(input).diagrams, [])
  })
})

describe('other content is untouched', () => {
  test('markdown with no mermaid', () => {
    const input = '# Hi\n\n- a\n- b\n\n```ts\nconst x = 1\n```\n\n~~~\nplain\n~~~\n| a | b |\n|---|---|\n'
    assert.equal(renderMarkdown(input), input)
  })

  test('a mermaid fence inside another fence is code, not a diagram', () => {
    const input = '````md\n```mermaid\ngraph TD\n  A --> B\n```\n````\n'
    assert.equal(renderMarkdown(input), input)
  })

  test('text around a drawn diagram is kept byte for byte', () => {
    const before = 'Intro with `code` and **bold**.\r\n\r\n'
    const after = '\r\nOutro.\r\n```js\nx()\n```\n'
    const out = renderMarkdown(before + '```mermaid\r\ngraph LR\r\n  A --> B\r\n```' + after)
    assert.ok(out.startsWith(before + '```text\r\n'))
    assert.ok(out.endsWith('\r\n```' + after))
  })

  test('several diagrams: each handled on its own', () => {
    const input = [fence('graph LR\n  A --> B'), fence('pie\n  "x" : 1'), fence('sequenceDiagram\n  A->>B: hi')].join('\n\n')
    const { markdown, diagrams } = scan(input)
    assert.deepEqual(diagrams.map(d => [d.line, d.result.ok]), [[1, true], [6, false], [11, true]])
    assert.ok(markdown.includes(fence('pie\n  "x" : 1')))
    assert.equal(markdown.match(/```mermaid/g)?.length, 1)
  })
})

describe('options', () => {
  const source = 'graph LR\n  A[One] --> B[Two]'

  test('ascii draws with ASCII only', () => {
    const result = drawDiagram(source, { ascii: true })
    assert.ok(result.ok)
    assert.match(result.drawing, /^[\x20-\x7e\n]+$/)
  })

  test('color adds ANSI codes, and width ignores them', () => {
    const plain = drawDiagram(source)
    const colored = drawDiagram(source, { color: true })
    assert.ok(plain.ok && colored.ok)
    assert.match(colored.drawing, /\x1b\[/)
    const columns = Math.max(...plain.drawing.split('\n').map(l => l.length))
    assert.ok(drawDiagram(source, { color: true, width: columns }).ok)
  })

  test('an indented fence keeps its indent, and the indent counts against width', () => {
    const input = '1. Step\n\n   ```mermaid\n   graph LR\n     A --> B\n   ```\n'
    const out = renderMarkdown(input)
    assert.ok(out.includes('\n   ```text\n   ┌'))
    const columns = Math.max(...(drawDiagram('graph LR\n  A --> B') as { drawing: string }).drawing.split('\n').map(l => l.length))
    assert.equal(renderMarkdown(input, { width: columns + 2 }), input)
    assert.notEqual(renderMarkdown(input, { width: columns + 3 }), input)
  })

  test('a drawing with backticks gets a longer fence', () => {
    const out = renderMarkdown(fence('graph LR\n  A["see ```"] --> B'))
    assert.match(out, /^````text\n[\s\S]*\n````$/)
  })
})

test('a diagram is drawn once however its reply grows', () => {
  const diagram = '\n\n' + fence('graph LR\n  A[Cached] --> B[Twice]')
  const first = scan(`Streaming${diagram}`, { width: 80 }).diagrams[0]!.result
  const again = scan(`Streaming more text${diagram}`, { width: 80 }).diagrams[0]!.result
  assert.equal(again, first)
  assert.notEqual(scan(`Streaming${diagram}`, { width: 81 }).diagrams[0]!.result, first)
})

test('the cache keeps no oversized source, and tells widths apart', () => {
  const huge = fence('graph LR\n  A --> B\n' + '%% x\n'.repeat(5000))
  assert.notEqual(scan(huge).diagrams[0]!.result, scan(huge).diagrams[0]!.result)
  const small = fence('graph LR\n  A[Odd] --> B[Width]')
  assert.ok(scan(small).diagrams[0]!.result.ok)
  assert.ok(!scan(small, { width: -Infinity }).diagrams[0]!.result.ok)
  assert.ok(scan(small).diagrams[0]!.result.ok)
})

test('never throws, whatever the input', () => {
  const samples = ['```mermaid', '```mermaid\n```', '```mermaid\n\0\n```', '```mermaid\n' + '{'.repeat(5000) + '\n```', '\r\r\n```mermaid\r```']
  for (let i = 0; i < 200; i++) {
    const chars = 'graph TD-->[]{}()|:;"\n `~%flowchart sequenceDiagram A B'
    samples.push('```mermaid\n' + Array.from({ length: 60 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + '\n```')
  }
  for (const sample of samples) assert.doesNotThrow(() => renderMarkdown(sample, { width: 80 }))
})
