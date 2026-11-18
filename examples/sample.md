# Release flow

How a change reaches users.

```mermaid
flowchart LR
  PR[Pull request] --> CI{Checks pass?}
  CI -->|yes| Merge[Merge]
  CI -->|no| PR
  Merge --> Tag[Tag release]
```

The release job talks to the registry like this:

```mermaid
sequenceDiagram
  participant J as Job
  participant R as Registry
  J->>R: upload package
  R-->>J: checksum
  J->>R: publish
```

Where the time goes (pie charts stay as source):

```mermaid
pie title Build time
  "Tests" : 60
  "Bundle" : 25
  "Lint" : 15
```

Other code blocks are left alone:

```sh
npm test
```
