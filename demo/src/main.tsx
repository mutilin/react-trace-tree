import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { TraceTree } from '@mutilin/react-trace-tree';
import { TraceFlow } from '@mutilin/trace-tree-core';
import '@mutilin/react-trace-tree/dist/style.css';

const flows: TraceFlow[] = [
    {id: 'global', locations: [
        {kinds: ['group', 'declarations'], nestingLevel: 0, importance: 'unimportant', location: {message: {text: 'Global declarations'}}},
        {nestingLevel: 1, importance: 'unimportant', location: {message: {text: 'Initialize a global variable'}}},
    ]},
    {id: '1', locations: [
        {kinds: ['group', 'enter', 'function'], nestingLevel: 0, importance: 'unimportant', location: {message: {text: 'Start worker'}}},
        {kinds: ['note'], nestingLevel: 1, importance: 'important', properties: {noteLevel: 1, sourceStepIndex: 0},
            location: {message: {text: 'Worker entry note'}}},
        {kinds: ['group', 'action'], nestingLevel: 1, importance: 'important', location: {message: {text: 'Prepare resource'}}},
        {kinds: ['note'], nestingLevel: 2, importance: 'important', properties: {noteLevel: 1, sourceStepIndex: 4},
            location: {message: {text: 'Resource is relevant'}}},
        {nestingLevel: 2, importance: 'unimportant', location: {message: {text: 'Acquire resource'}}},
        {nestingLevel: 1, importance: 'unimportant', location: {message: {text: 'Return'}}},
    ]},
    {id: '2', locations: [
        {kinds: ['group', 'enter', 'function'], nestingLevel: 0, importance: 'unimportant', location: {message: {text: 'Run callback'}}},
        {nestingLevel: 1, importance: 'unimportant', location: {message: {text: 'Check state'}}},
    ]},
];

function App() {
    const [selection, setSelection] = React.useState('Select a trace step');
    return <main style={{maxWidth: 900, margin: '2rem auto', fontFamily: 'sans-serif'}}>
        <h1>React Trace Tree</h1>
        <p>Expand a scope, or select a step. Global declarations have no thread marker.</p>
        <div style={{height: 380, border: '1px solid #ccc'}}>
            <TraceTree flows={flows}
                onSelectStep={(step, flowIndex, stepIndex) => setSelection(
                    `Thread ${flows[flowIndex].id}, step ${stepIndex + 1}: ${step.location?.message?.text}`)} />
        </div>
        <p role="status">{selection}</p>
    </main>;
}

ReactDOM.render(<App />, document.getElementById('root'));
