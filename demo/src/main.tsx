import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { TraceTree } from '@mutilin/react-trace-tree';
import { TraceFlow } from '@mutilin/trace-tree-core';
import type { OhciStep } from '../../tests/fixtures/ohci-small';
import ohciSarif from '../../tests/fixtures/ohci-small.sarif?raw';
import '@mutilin/react-trace-tree/dist/style.css';

const run = JSON.parse(ohciSarif).runs[0];
const flows: TraceFlow<OhciStep>[] = run.results[0].codeFlows[0].threadFlows;
const artifacts: Array<{location: {uri: string}; contents: {text: string}}> = run.artifacts;

function details(step: OhciStep) {
    const physical = step.location.physicalLocation;
    return {message: step.location.message?.text ?? physical?.region.snippet?.text,
        file: physical?.artifactLocation.uri, line: physical?.region.startLine};
}

function App() {
    const [selection, setSelection] = React.useState<{step: OhciStep; flowIndex: number; stepIndex: number}>();
    const physical = selection?.step.location.physicalLocation;
    const artifact = physical && artifacts[physical.artifactLocation.index];
    return <main style={{maxWidth: 1100, margin: '2rem auto', fontFamily: 'sans-serif'}}>
        <h1>React Trace Tree — small OHCI trace</h1>
        <p>{run.results[0].message.text}. Three embedded C files, two threads and global declarations.</p>
        <p>Use arrows to expand groups; select a header or step to view its source. Global declarations have no thread marker.</p>
        <div style={{height: 380, border: '1px solid #ccc'}}>
            <TraceTree flows={flows} logicalLocations={run.logicalLocations} getStepDetails={details}
                onSelectStep={(step, flowIndex, stepIndex) => setSelection({step, flowIndex, stepIndex})} />
        </div>
        <p role="status">{selection
            ? `Thread ${flows[selection.flowIndex].id}, step ${selection.stepIndex + 1}: ${details(selection.step).message ?? '—'}`
            : 'Select a trace header or step.'}</p>
        {artifact && physical ? <section aria-label="Embedded source">
            <h2 style={{fontSize: 16}}>{artifact.location.uri}:{physical.region.startLine}</h2>
            <pre style={{overflow: 'auto', padding: 12, background: '#f5f5f5', fontSize: 12}}>
                {artifact.contents.text.trimEnd().split('\n').map((line, index) => <span key={index}
                    style={{display: 'block', background: index + 1 === physical.region.startLine ? '#fff1a8' : undefined}}>
                    <span style={{display: 'inline-block', width: 28, color: '#777', userSelect: 'none'}}>{index + 1}</span>{line || ' '}
                </span>)}
            </pre>
        </section> : selection && <p>This header has no physical source location.</p>}
    </main>;
}

ReactDOM.render(<App />, document.getElementById('root'));
