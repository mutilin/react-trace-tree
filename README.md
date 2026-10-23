# React Trace Tree

A reusable header-based trace viewer that may be used in results visualizers
such as SARIF VS Code and CodeChecker. It shows thread flows sequentially with
colored gutters and preserves relevant actions and vital notes beneath
collapsed ancestors. No dependency on react-arborist.

This repository contains two packages:

- `@mutilin/trace-tree-core` — React-free header validation, hierarchy reconstruction
  and visibility projection. It can also support non-React renderers, such as a
  Vue-based CodeChecker integration.
- `@mutilin/react-trace-tree` — `<TraceTree>` component and CSS (React 16.13.1+).

These are reusable building blocks, not complete integrations with those
applications. Consumers supply artifact resolution and editor navigation.

## Header-based trace format

The implementation follows the header convention implemented by Klever's
`sarif_converter_2.py` and described in its `docs/sarif_mapping.rst`. The core
accepts structural `TraceFlow` / `TraceStep` objects without depending on a
SARIF package. In SARIF, a flow is a `threadFlow` and each step is a
`threadFlowLocation` (TFL) in its ordered `locations` array.

### Headers and containment

Each group starts with an actual TFL whose `kinds` contain `"group"` and
**exactly one** of these group kinds:

| Group | Typical `kinds` | Meaning |
| --- | --- | --- |
| Function | `["group", "enter", "function"]` | The function entry itself is the header; do not add a duplicate entry row. |
| Action | `["group", "action"]` | A labeled group of steps, not an additional execution event. |
| Declarations | `["group", "declarations"]` | A declarations group, including global declarations; normally labeled `Declarations`. |

Kind order does not matter. `"function"` and `"enter"` are standard SARIF kinds;
`"group"`, `"action"` and `"declarations"` are producer conventions, not a
standard SARIF collapse/expand feature.

Put the header label in `location.message.text`. Every TFL in a grouped flow
must have a nonnegative integer `nestingLevel`. Emit the flow as an ordered
forest in preorder:

- Roots have level 0; direct children are one level deeper.
- Only headers can be parents. Equal levels represent siblings.
- A header's body ends before the first following TFL at the same or a
  shallower level, or at the end of the flow.
- Empty groups still have headers. A function header with no children still
  represents an entry event.

For example, this is a complete `threadFlow`:

```json
{
  "id": "1",
  "locations": [
    {
      "nestingLevel": 0,
      "kinds": ["group", "enter", "function"],
      "importance": "unimportant",
      "location": {"message": {"text": "Probe controller"}}
    },
    {
      "nestingLevel": 1,
      "kinds": ["note"],
      "importance": "important",
      "location": {"message": {"text": "Driver probe entered"}},
      "properties": {"noteLevel": 1, "sourceStepIndex": 0}
    },
    {
      "nestingLevel": 1,
      "kinds": ["group", "action"],
      "importance": "important",
      "location": {"message": {"text": "Enable clock"}}
    },
    {
      "nestingLevel": 2,
      "importance": "unimportant",
      "location": {"message": {"text": "Update clock state"}}
    }
  ]
}
```

`parseTraceHeaders(locations)` validates the convention and reconstructs
scope occurrences with `id`, `kind`, `parentId`, `startIndex` and exclusive
`endIndex`. Ranges include their header. IDs are the header's zero-based TFL
index within its flow; they identify occurrences, not reusable functions, and
are not stable across trace edits. All headers, notes and assumptions count
toward the original TFL indexes.

Flows without headers, or with invalid header kinds or depths, use
flat importance-based grouping instead of an invented hierarchy.

### Importance, notes and source

Missing `importance` means `"important"`, as required by SARIF. Klever emits
`"unimportant"` explicitly by default and overrides it for relevant action
headers and notes. An important or essential **action header** is relevant;
header importance does not propagate to its children or force its body open.

| `properties.noteLevel` | Klever's emitted `importance` | Visibility policy |
| --- | --- | --- |
| 0 | `essential` | Vital note |
| 1 | `important` | Vital note |
| 2 or 3 | `unimportant` | Detail shown when its containing path is explicitly expanded |

When `noteLevel` is absent, the viewer recognizes a vital note through
`kinds` containing `"note"` and importance other than `"unimportant"`.

`properties.sourceStepIndex` associates a separate note or assumption with a
source TFL in the **same flow**, not with a visible-row number:

- Function-entry notes follow their merged entry/header as children at the
  next level and point backward to it. Call assumptions follow the notes.
- Notes on ordinary source steps precede the source at the same level and
  point forward; assumptions follow the source at that level.
- A note hiding non-call source shares its TFL with that source: the message
  holds the note, while `location.physicalLocation.region.snippet.text` keeps
  the source. Function-call notes remain separate so the header label survives.
- Separate notes retain their own importance; they do not promote their source.

Physical locations on actual headers and steps support navigation. Do not
invent coordinates for headers without source locations. Embedded files may
be supplied in `run.artifacts[].contents.text`. Artifact lookup, snippet
fallbacks and source highlighting are the consumer's responsibility; the demo
provides a generic SARIF adapter in `demo/src/sarif.ts`.

### Projection and threads

Hierarchy describes containment, not expansion preferences. The core projects
it into visible rows, independently for each flow:

- Default expansion opens paths to relevant actions and vital notes.
- Closing an ancestor preserves relevant-action headers, vital notes and the
  ancestor headers needed to show their paths.
- Reopening a visible descendant can show its body without opening its closed
  ancestors or exposing unrelated branches. Closing a parent retains its
  descendants' expansion state.
- Source steps associated with vital notes are included when their containing
  path is open; vital notes themselves can remain visible when it is closed.

Projected header rows contain the actual TFL in `location` and its original
array position in `index`. Expansion keys passed to `buildThreadTraceRows`
are `flowIndex:headerIndex`. The React component owns the expansion state.

Flows are rendered sequentially, with independent nesting and colored thread
gutters; the flow with `id: "global"` has no gutter. This ordering does not
reconstruct cross-thread execution interleaving. Ordinary flat SARIF flows
instead collapse consecutive unimportant steps into expandable ranges.

## Usage

```tsx
import {TraceTree} from '@mutilin/react-trace-tree';
import '@mutilin/react-trace-tree/dist/style.css';

<TraceTree
  flows={threadFlows}
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

## Development and demo

```sh
npm install
npm run build
npm test
npm run demo           # http://127.0.0.1:5173
```

The demo uses the same compact OHCI SARIF as the integration tests: three
embedded C files, global declarations and two threads. Selecting a header or
step displays its source with the corresponding line highlighted. See
[`tests/fixtures/README.md`](tests/fixtures/README.md) for fixture provenance
and regeneration commands.

`npm run demo` starts Vite but does not rebuild library packages. After editing
library code, run `npm run build`; restart with `npm run demo -- --force` if
Vite still serves cached dependencies. `npm run demo:build` checks the demo's
production bundle. On Node versions with experimental TypeScript stripping,
run tests with `NODE_OPTIONS=--no-experimental-strip-types npm test`.

Copyright (c) 2026 Vadim Mutilin. Licensed under MIT; see `LICENSE`.
