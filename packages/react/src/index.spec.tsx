import assert from 'assert';
import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import { TraceTree, threadGutter } from './index';
import { TraceFlow, TraceStep } from '@mutilin/trace-tree-core';
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

    const scoped: TraceFlow[] = [{id: '1', locations: [
        {kinds: ['function', 'group', 'enter'], nestingLevel: 0, importance: 'unimportant',
            location: {message: {text: 'Function header'}}},
        {nestingLevel: 1, importance: 'unimportant', location: {message: {text: 'hidden body'}}},
    ]}];

    it('renders the actual header once when closed, without requiring logical locations', () => {
        const html = ReactDOMServer.renderToStaticMarkup(<TraceTree flows={scoped} logicalLocations={[{name: 'Wrong label'}]} />);
        assert.ok(html.includes('Step 1: Function header'));
        assert.ok(!html.includes('Wrong label'));
        assert.ok(!html.includes('hidden body'));
        assert.ok(html.includes('1 visible steps'));
        assert.ok(!html.includes('Show full trace'));
    });

    it('separates disclosure from selection and preserves original header and body indexes', () => {
        const selected: unknown[] = [];
        const nodes: unknown[] = [];
        const activated: unknown[] = [];
        const toggled: unknown[] = [];
        const view = renderer.create(<TraceTree flows={scoped}
            getStepDetails={() => ({file: 'test.c', line: 10, column: 3})}
            onSelect={value => nodes.push(value)} onActivate={node => activated.push(node)}
            onToggleScope={(scope, location, flowIndex) => toggled.push([scope.id, location, flowIndex])}
            onSelectStep={(step, flowIndex, stepIndex) => selected.push([step, flowIndex, stepIndex])} />);
        renderer.act(() => view.root.findByProps({'aria-label': 'Step 1: Function header'}).props.onClick());
        assert.deepStrictEqual(selected, [[scoped[0].locations[0], 0, 0]]);
        const node = {id: '0:step:0', data: scoped[0].locations[0], flowIndex: 0, stepIndex: 0};
        assert.deepStrictEqual(nodes, [[node]]);
        assert.deepStrictEqual(activated, [node]);
        assert.ok(JSON.stringify(view.toJSON()).includes('10:3'));
        renderer.act(() => view.root.findByProps({'aria-label': 'Expand Function header'}).props.onClick());
        assert.strictEqual(selected.length, 1);
        assert.deepStrictEqual(toggled, [['0', scoped[0].locations[0], 0]]);
        assert.ok(view.root.findByProps({'aria-label': 'Step 1: Function header'}).parent.parent.props.className.includes('rtt-selected'));
        renderer.act(() => view.root.findByProps({'aria-label': 'Step 2: hidden body'}).props.onClick());
        assert.deepStrictEqual(selected[1], [scoped[0].locations[1], 0, 1]);
        view.unmount();
    });

    it('supports controlled header selection and independent expansion in different flows', () => {
        const flows = [scoped[0], {...scoped[0], id: '2'}];
        const view = renderer.create(<TraceTree flows={flows} selection="1:step:0" />);
        const selected = view.root.findAll((node: any) => typeof node.type === 'string' &&
            node.props.className?.includes('rtt-selected'));
        assert.strictEqual(selected.length, 1);
        assert.strictEqual(selected[0].props.style.borderLeft, '3px solid #85ff47');
        renderer.act(() => view.root.findAllByProps({'aria-label': 'Expand Function header'})[1].props.onClick());
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 2: hidden body'}).length, 1);
        assert.strictEqual(view.root.findAllByProps({'aria-expanded': false}).length, 1);
        view.unmount();
    });

    it('expands/collapses all headers while retaining vital notes and relevant descendants', () => {
        const locations: TraceStep[] = [
            ...scoped[0].locations.slice(0, 1),
            {kinds: ['group', 'action'], nestingLevel: 1, importance: 'important', location: {message: {text: 'Relevant action'}}},
            {kinds: ['note'], nestingLevel: 2, importance: 'essential', properties: {noteLevel: 0, sourceStepIndex: 0},
                location: {message: {text: 'Vital note'}}},
            {...scoped[0].locations[1], nestingLevel: 2},
        ];
        const view = renderer.create(<TraceTree flows={[{locations}]} />);
        const clickToolbar = (label: string) => renderer.act(() => view.root.findAllByType('button')
            .find((button: any) => button.children[0] === label).props.onClick());
        clickToolbar('Expand all');
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 4: hidden body'}).length, 1);
        clickToolbar('Collapse all');
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 4: hidden body'}).length, 0);
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 3: Vital note'}).length, 1);
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 2: Relevant action'}).length, 1);
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 1: Function header'}).length, 1);
        view.unmount();
    });

    it('retains flat controls for ordinary SARIF and ignores old scope metadata', () => {
        const locations: TraceStep[] = [{importance: 'unimportant', location: {message: {text: 'Flat step'}}}];
        const view = renderer.create(<TraceTree flows={[{locations, properties: {scopes: [{id: 'old'}]}}]} />);
        assert.strictEqual(view.root.findAllByProps({'aria-expanded': false}).length, 1);
        renderer.act(() => view.root.findByProps({'aria-expanded': false}).props.onClick());
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 1: Flat step'}).length, 1);
        view.unmount();
    });

    it('reopens a relevant descendant without reopening the outer header', () => {
        const locations: TraceStep[] = [
            scoped[0].locations[0],
            {kinds: ['group', 'function', 'enter'], nestingLevel: 1, importance: 'unimportant',
                location: {message: {text: 'Inner call'}}},
            {...scoped[0].locations[1], nestingLevel: 2},
            {kinds: ['group', 'action'], nestingLevel: 2, importance: 'important',
                location: {message: {text: 'Relevant action'}}},
            {kinds: ['group', 'function', 'enter'], nestingLevel: 1, importance: 'unimportant',
                location: {message: {text: 'Unrelated call'}}},
        ];
        const view = renderer.create(<TraceTree flows={[{locations}]} />);
        renderer.act(() => view.root.findByProps({'aria-label': 'Collapse Function header'}).props.onClick());
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 3: hidden body'}).length, 0);
        renderer.act(() => view.root.findByProps({'aria-label': 'Collapse Inner call'}).props.onClick());
        renderer.act(() => view.root.findByProps({'aria-label': 'Expand Inner call'}).props.onClick());
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 3: hidden body'}).length, 1);
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Expand Function header'}).length, 1);
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 5: Unrelated call'}).length, 0);
        view.unmount();
    });

    it('resets expansion and internal selection when flows are replaced', () => {
        const view = renderer.create(<TraceTree flows={scoped} />);
        renderer.act(() => view.root.findByProps({'aria-label': 'Expand Function header'}).props.onClick());
        renderer.act(() => view.root.findByProps({'aria-label': 'Step 2: hidden body'}).props.onClick());
        renderer.act(() => view.update(<TraceTree flows={[{...scoped[0]}]} />));
        assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 2: hidden body'}).length, 0);
        assert.strictEqual(view.root.findAll((node: any) => typeof node.type === 'string' &&
            node.props.className?.includes('rtt-selected')).length, 0);
        view.unmount();
    });
});
