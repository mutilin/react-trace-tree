import assert from 'assert';
import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { TraceTree, threadGutter } from './index';
const renderer = require('react-test-renderer');

describe('TraceTree', () => {
    const flows = [
        {id: 'global', locations: [{location: {message: {text: 'global variable'}}}]},
        {id: '1', locations: [{location: {message: {text: 'worker step'}}}]},
        {id: '2', locations: [{location: {message: {text: 'callback step'}}}]},
    ];

    it('renders all flows in order and preserves the gutter rules', () => {
        const html = ReactDOMServer.renderToStaticMarkup(<TraceTree flows={flows} />);
        assert.ok(html.indexOf('global variable') < html.indexOf('worker step'));
        assert.ok(html.indexOf('worker step') < html.indexOf('callback step'));
        assert.deepStrictEqual(threadGutter(flows, 0), {});
        assert.deepStrictEqual(threadGutter(flows, 1), {marginLeft: 8, borderLeft: '3px solid #5f54cb'});
        assert.deepStrictEqual(threadGutter(flows, 2), {marginLeft: 16, borderLeft: '3px solid #85ff47'});
    });

    it('renders scope headers when their bodies are closed', () => {
        const scoped = [{id: '1', properties: {scopes: [
            {id: 's1', kind: 'action', parentId: null, startIndex: 0, endIndex: 1, logicalLocationIndex: 0},
        ]}, locations: [{location: {message: {text: 'hidden body'}}}]}];
        const html = ReactDOMServer.renderToStaticMarkup(<TraceTree flows={scoped}
            logicalLocations={[{name: 'Action header'}]} />);
        assert.ok(html.includes('Action header'));
        assert.ok(!html.includes('Step 1: hidden body'));
    });

    it('expands scopes and sends the selected step through the caller callback', () => {
        const scoped = [{id: '1', properties: {scopes: [
            {id: 's1', kind: 'action', parentId: null, startIndex: 0, endIndex: 1, logicalLocationIndex: 0},
        ]}, locations: [{location: {message: {text: 'hidden body'}}}]}];
        const selected: string[] = [];
        const view = renderer.create(<TraceTree flows={scoped} logicalLocations={[{name: 'Action header'}]}
            onSelectStep={(step: typeof scoped[0]['locations'][0]) => selected.push(step.location.message.text)} />);
        renderer.act(() => view.root.findByProps({'aria-expanded': false}).props.onClick());
        assert.ok(JSON.stringify(view.toJSON()).includes('hidden body'));
        renderer.act(() => view.root.findByProps({'aria-label': 'Step 1: hidden body'}).props.onClick());
        assert.deepStrictEqual(selected, ['hidden body']);
    });
});
