import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { TraceTree } from '@mutilin/react-trace-tree';
import {getEmbeddedSource, getStepDetails} from './sarif';
import type {SarifLog, SarifTraceStep} from './sarif';
import ohciSarif from '../../tests/fixtures/ohci-small.sarif?raw';
import '@mutilin/react-trace-tree/dist/style.css';

const log: SarifLog = JSON.parse(ohciSarif);
const run = log.runs[0] ?? {};
const result = run.results?.[0];
const flows = result?.codeFlows?.[0]?.threadFlows ?? [];
const artifacts = run.artifacts ?? [];

function App() {
    const [selection, setSelection] = React.useState<{step: SarifTraceStep; flowIndex: number; stepIndex: number}>();
    const source = selection && getEmbeddedSource(selection.step, artifacts);
    return <main style={{maxWidth: 1100, margin: '2rem auto', fontFamily: 'sans-serif'}}>
        <h1>React Trace Tree — small OHCI trace</h1>
        <p>{result?.message?.text ?? 'Analysis trace'}. {artifacts.length} artifacts, {flows.length} thread flows.</p>
        <p>Use arrows to expand groups; select a header or step to view its source. Global declarations have no thread marker.</p>
        <div style={{height: 380, border: '1px solid #ccc'}}>
            <TraceTree flows={flows} logicalLocations={run.logicalLocations}
                getStepDetails={step => getStepDetails(step, artifacts)}
                onSelectStep={(step, flowIndex, stepIndex) => setSelection({step, flowIndex, stepIndex})} />
        </div>
        <p role="status">{selection
            ? `Thread ${flows[selection.flowIndex].id}, step ${selection.stepIndex + 1}: ${getStepDetails(selection.step, artifacts).message ?? '—'}`
            : 'Select a trace header or step.'}</p>
        {source ? <section aria-label="Embedded source">
            <h2 style={{fontSize: 16}}>{source.file}{source.line === undefined ? '' : `:${source.line}`}</h2>
            <pre style={{overflow: 'auto', padding: 12, background: '#f5f5f5', fontSize: 12}}>
                {source.text.trimEnd().split('\n').map((line, index) => <span key={index}
                    style={{display: 'block', background: index + 1 === source.line ? '#fff1a8' : undefined}}>
                    <span style={{display: 'inline-block', width: 28, color: '#777', userSelect: 'none'}}>{index + 1}</span>{line || ' '}
                </span>)}
            </pre>
        </section> : selection && <p>No embedded source is available for this step.</p>}
    </main>;
}

ReactDOM.render(<App />, document.getElementById('root'));
