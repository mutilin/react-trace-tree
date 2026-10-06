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
`onToggleScope` receives a scope, its representative step, and the flow index.
Rendering is controlled by React; editor navigation is supplied by the caller.
The optional `getStepDetails` callback provides file, line, column, and message
labels when these cannot be read directly from a step.

The core accepts structural `TraceFlow`/`TraceStep` data (SARIF thread flows
are compatible) with optional `flow.properties.scopes`. Each scope has a unique
`id` **within its flow**, `kind`, `parentId`, and half-open `startIndex` / `endIndex`
range into that flow's `locations`. Optional `logicalLocationIndex` refers to
`logicalLocations`; `relevant` marks an action. Steps may specify
`properties.noteLevel` (0/1 are vital) and `properties.sourceStepIndex` to link
a note to its source. Without valid scopes, importance-based grouping is used.

The core runs projection independently for each flow. The React package owns
presentation, expansion state, and thread gutters; neither package knows about
VS Code, SARIF artifact resolution, or Klever's serialized JSON format.

Copyright (c) 2026 Vadim Mutilin. Licensed under MIT; see `LICENSE`.
