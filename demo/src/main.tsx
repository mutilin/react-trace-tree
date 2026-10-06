import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { TraceTree } from '@mutilin/react-trace-tree';
import '@mutilin/react-trace-tree/dist/style.css';

const flows = [
    {id: 'global', locations: [{location: {message: {text: 'Initialize a global variable'}}}]},
    {id: '1', properties: {scopes: [
        {id: 'call', kind: 'functionCall', parentId: null, startIndex: 0, endIndex: 4},
        {id: 'action', kind: 'action', parentId: 'call', startIndex: 1, endIndex: 3, relevant: true},
    ]}, locations: [
        {kinds: ['enter', 'function'], location: {message: {text: 'Start worker'}}},
        {location: {message: {text: 'Prepare resource'}}},
        {kinds: ['note'], properties: {noteLevel: 1}, location: {message: {text: 'Resource is relevant'}}},
        {location: {message: {text: 'Return'}}},
    ]},
    {id: '2', properties: {scopes: [
        {id: 'call', kind: 'functionCall', parentId: null, startIndex: 0, endIndex: 2},
    ]}, locations: [
        {kinds: ['enter', 'function'], location: {message: {text: 'Run callback'}}},
        {location: {message: {text: 'Check state'}}},
    ]},
];

function App() {
    const [selection, setSelection] = React.useState('Select a trace step');
    return <main style={{maxWidth: 900, margin: '2rem auto', fontFamily: 'sans-serif'}}>
        <h1>React Trace Tree</h1>
        <p>Expand a scope, or select a step. Global declarations have no thread marker.</p>
        <div style={{height: 380, border: '1px solid #ccc'}}>
            <TraceTree flows={flows} logicalLocations={[{name: 'Worker'}, {name: 'Prepare resource'}]}
                onSelectStep={(step, flowIndex, stepIndex) => setSelection(
                    `Thread ${flows[flowIndex].id}, step ${stepIndex + 1}: ${step.location?.message?.text}`)} />
        </div>
        <p role="status">{selection}</p>
    </main>;
}

ReactDOM.render(<App />, document.getElementById('root'));
