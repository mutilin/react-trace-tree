# Small OHCI SARIF

`ohci-small.sarif` is the unmodified JSON data produced by Klever commit
`ce25e4f00`, using `tests/sarif-converter/ohci-small` and `sarif_converter_2`.
Only whitespace is compacted (one TFL per line). It embeds the three short C
files and contains 28 TFLs across the global flow and two threads. It is a
synthetic OHCI-inspired scenario, not a Linux verification result.

Core and React tests load a fresh copy through `ohci-small.ts`. They exercise
hierarchy, default/collapsed/reopened projection, all four note levels, original
indexes, embedded-source navigation data, thread gutters and real header
selection. `npm test` requires neither Python nor a Klever checkout.

The standalone demo imports the same `.sarif` file as text through Vite (not
the Node-only `loadOhci()` helper). Run `npm run build` followed by `npm run demo`
to explore it; selecting a header or step shows its embedded C source with the
corresponding line highlighted.

To regenerate, run from a Klever checkout with its Python dependencies installed:

```sh
python3 tests/sarif-converter/ohci-small/build_witness.py --output-dir /tmp/opencode/ohci-small
python3 -m klever.core.vrp.et.sarif_converter_2 \
    --witness /tmp/opencode/ohci-small/witness.graphml \
    --source-dir /tmp/opencode/ohci-small \
    --output /tmp/opencode/ohci-small/result.sarif
```

Replace `tests/fixtures/ohci-small.sarif` in this repository with that output
(whitespace is immaterial), update the provenance above, then run:

```sh
npm run build
NODE_OPTIONS=--no-experimental-strip-types npm test
```

The SARIF embeds Klever's synthetic fixture source, including EMG annotations;
the surrounding TypeScript test code is Copyright (c) 2026 Vadim Mutilin, MIT.
