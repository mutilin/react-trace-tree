# React Trace Tree

A reusable trace viewer extracted from the SARIF VS Code extension. The UI shows
thread flows in sequence with colored gutters and preserves relevant
actions and vital notes when a scope is collapsed. No dependency on react-arborist.

This repository contains two unpublished packages:

- `@mutilin/trace-tree-core` — React-free scope validation and visibility projection.
- `@mutilin/react-trace-tree` — `<TraceTree>` component and CSS (React 16.13.1+).

## Development

```sh
npm install
npm run build
npm test
npm run demo           # http://127.0.0.1:5173
```

`npm run demo:build` checks the standalone demo bundle. The VS Code extension
uses local `file:` dependencies until the packages are published. Build the
packages before building or launching the extension in the sibling directory.

## Usage

```tsx
import {TraceTree} from '@mutilin/react-trace-tree';
import '@mutilin/react-trace-tree/dist/style.css';

<TraceTree
  flows={threadFlows}
  logicalLocations={logicalLocations}
  getStepDetails={step => ({message: step.location?.message?.text})}
  onSelectStep={(step, flowIndex, stepIndex) => openLocation(step, flowIndex, stepIndex)}
/>
```

The component also supports `selection`, `onSelect`, and `onActivate` for an
Arborist-like single-step selection API. Step IDs are `flowIndex:step:stepIndex`.
`onToggleScope` receives a reconstructed scope, its actual header TFL, and the
flow index. Its disclosure button only changes expansion; the separate header
label button selects/navigates the header using the same original-TFL-index
callbacks as ordinary steps. Header rows are included in the visible-step count.
Rendering is controlled by React; editor navigation is supplied by the caller.
The optional `getStepDetails` callback provides file, line, column, and message
labels when these cannot be read directly from a step.

The core accepts structural `TraceFlow`/`TraceStep` data (SARIF thread flows
are compatible). `parseTraceHeaders(locations)` reconstructs groups from TFLs
whose `kinds` contain `"group"` and exactly one of `"function"`, `"action"`, or
`"declarations"`. Kind order does not matter. Every TFL in a grouped trace must
have a nonnegative integer `nestingLevel`: roots are level 0, children are one
level deeper, and only headers can be parents. A function entry is its own
header, typically with `kinds: ["group", "enter", "function"]`; it is rendered
once, not as an additional source row.

Reconstructed scopes have IDs equal to their header's zero-based TFL index
**within its flow**, a `parentId`, and half-open `startIndex` / `endIndex` ranges
including the header. Labels come from the header's `location.message.text`;
logical locations are not required. Expansion keys passed to
`buildThreadTraceRows` are `flowIndex:headerIndex`. Important or essential action
headers mark relevant actions; missing importance still means `"important"`
according to SARIF. Producers wanting an unimportant default must emit it
explicitly.

Steps may specify `properties.noteLevel` (0/1 are vital) and
`properties.sourceStepIndex` to link a note or assumption to its source. Call
notes follow their header at the next depth and point backward to it; ordinary
statement notes may precede their source and point forward. Separate notes do
not change the source's importance. Vital notes and relevant action paths stay
visible beneath closed ancestors, and a visible descendant can be reopened
independently.

Old `flow.properties.scopes` metadata is ignored. Missing headers or malformed
header hierarchies use flat importance-based grouping instead.

The core no longer exports `parseTraceScopes`. The React adapter and demo use
the header API. Projected scope rows expose `index` and `location` for the actual
header TFL; scope row types and projection signatures otherwise remain available.
Relevant notes use `noteLevel` when supplied, or standard note `kinds` and SARIF
importance otherwise.

The core runs projection independently for each flow. The React package owns
presentation, expansion state, and thread gutters; neither package knows about
VS Code, SARIF artifact resolution, or Klever's serialized JSON format.

Copyright (c) 2026 Vadim Mutilin. Licensed under MIT; see `LICENSE`.
