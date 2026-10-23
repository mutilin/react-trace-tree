// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import assert from 'assert';
import * as React from 'react';
import {TraceTree} from './index';
import {loadOhci, OhciStep} from '../../../tests/fixtures/ohci-small';
const renderer = require('react-test-renderer');

function details(step: OhciStep) {
    const physical = step.location.physicalLocation;
    return {message: step.location.message?.text ?? physical?.region.snippet?.text,
        file: physical?.artifactLocation.uri, line: physical?.region.startLine};
}

function toolbar(view: any, label: string) {
    renderer.act(() => view.root.findAllByType('button')
        .find((button: any) => button.children[0] === label).props.onClick());
}

describe('Small OHCI SARIF React integration', () => {
    it('renders default relevance, sequential threads and their gutters from real SARIF', () => {
        const {flows} = loadOhci();
        const view = renderer.create(<TraceTree flows={flows} getStepDetails={details} />);
        try {
            const rows = view.root.findAll((node: any) => node.type === 'div' && /^rtt-row\b/.test(node.props.className));
            assert.strictEqual(rows.length, 14);
            assert.deepStrictEqual(rows.slice(0, 3).map((row: any) => row.props.style), [
                {}, {marginLeft: 8, borderLeft: '3px solid #5f54cb'}, {marginLeft: 16, borderLeft: '3px solid #85ff47'},
            ]);
            assert.ok(rows.slice(2).every((row: any) => row.props.style.borderLeft === '3px solid #85ff47'));
            for (const label of ['Step 5: ohci_probe', 'Step 7: Driver probe entered', 'Step 10: Clock must be enabled',
                'Step 18: Clock remains enabled on probe failure', 'Step 19: __VERIFIER_error();']) {
                assert.strictEqual(view.root.findAllByProps({'aria-label': label}).length, 1);
            }
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 6: Probe entry detail'}).length, 0);
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 9: Clock starts disabled'}).length, 0);
            assert.strictEqual(view.root.findByProps({className: 'rtt-toolbar'}).findByType('span').children.join(''),
                '14 visible steps across 3 threads');
        } finally { view.unmount(); }
    });

    it('selects actual headers, hidden declarations and violation source with original indexes', () => {
        const {flows, artifacts} = loadOhci();
        const selected: Array<{step: OhciStep; flowIndex: number; stepIndex: number}> = [];
        const view = renderer.create(<TraceTree flows={flows} getStepDetails={details}
            onSelectStep={(step, flowIndex, stepIndex) => selected.push({step, flowIndex, stepIndex})} />);
        try {
            const click = (label: string) => renderer.act(() => view.root.findByProps({'aria-label': label}).props.onClick());
            click('Step 5: ohci_probe');
            assert.strictEqual(selected[0].step, flows[2].locations[4]);
            toolbar(view, 'Expand all');
            assert.strictEqual(selected.length, 1); // Disclosure never activates a source location.
            assert.strictEqual(view.root.findByProps({className: 'rtt-toolbar'}).findByType('span').children.join(''),
                '28 visible steps across 3 threads');
            click('Step 9: Clock starts disabled');
            click('Step 19: __VERIFIER_error();');
            assert.deepStrictEqual(selected.map(item => [item.flowIndex, item.stepIndex]), [[2, 4], [2, 8], [2, 18]]);
            assert.deepStrictEqual(selected.map(item => {
                const physical = item.step.location.physicalLocation!;
                const artifact = artifacts[physical.artifactLocation.index];
                assert.strictEqual(artifact.location.uri, physical.artifactLocation.uri);
                return [artifact.location.uri, physical.region.startLine,
                    artifact.contents.text.split('\n')[physical.region.startLine - 1].trim()];
            }), [
                ['emg-model.c', 19, 'result = ohci_probe();'],
                ['ohci-spear.c', 4, 'int clock = 0;'],
                ['emg-wrappers.c', 8, '__VERIFIER_error();'],
            ]);
            assert.deepStrictEqual(selected[1].step.kinds, ['declaration', 'note']);
            assert.strictEqual(selected[1].step.location.physicalLocation!.region.snippet!.text, 'int clock = 0;');
        } finally { view.unmount(); }
    });

    it('collapses all but retains vital notes, then independently reopens the driver call', () => {
        const {flows} = loadOhci();
        const view = renderer.create(<TraceTree flows={flows} getStepDetails={details} />);
        try {
            toolbar(view, 'Collapse all');
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 18: Clock remains enabled on probe failure'}).length, 1);
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 19: __VERIFIER_error();'}).length, 0);
            renderer.act(() => view.root.findByProps({'aria-label': 'Expand ohci_probe'}).props.onClick());
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 6: Probe entry detail'}).length, 1);
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 12: clock == 0;'}).length, 1);
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Expand OHCI probe worker'}).length, 1);
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Expand OHCI initialization'}).length, 1);
            assert.strictEqual(view.root.findAllByProps({'aria-label': 'Step 5: Initialization detail'}).length, 0);
        } finally { view.unmount(); }
    });
});
