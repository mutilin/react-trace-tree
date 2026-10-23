// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import assert from 'assert';
import {buildThreadTraceRows, parseTraceHeaders, traceImportance} from './index';
import {loadOhci} from '../../../tests/fixtures/ohci-small';

describe('Small OHCI SARIF projection', () => {
    it('reconstructs the converter output hierarchy and source-note associations', () => {
        const {flows, artifacts} = loadOhci();
        assert.deepStrictEqual(flows.map(flow => [flow.id, flow.locations.length]), [['global', 2], ['1', 7], ['2', 19]]);
        assert.deepStrictEqual(artifacts.map(artifact => artifact.location.uri), ['emg-wrappers.c', 'emg-model.c', 'ohci-spear.c']);
        const scopes = flows.map(flow => parseTraceHeaders(flow.locations)!);
        assert.deepStrictEqual(scopes.map(list => list.length), [1, 3, 7]);
        assert.deepStrictEqual(scopes[2].map(scope => [scope.id, scope.kind, scope.parentId, scope.endIndex]), [
            ['0', 'function', null, 19], ['1', 'declarations', '0', 3], ['3', 'action', '0', 19],
            ['4', 'function', '3', 19], ['7', 'declarations', '4', 9],
            ['12', 'function', '4', 19], ['13', 'declarations', '12', 15],
        ]);
        assert.strictEqual(scopes[1][2].relevant, false);
        assert.strictEqual(scopes[2][2].relevant, true);
        const steps = flows[2].locations;
        assert.deepStrictEqual([steps[5].properties!.sourceStepIndex, steps[6].properties!.sourceStepIndex], [4, 4]);
        assert.deepStrictEqual([steps[9].properties!.sourceStepIndex, steps[11].properties!.sourceStepIndex], [10, 10]);
        assert.deepStrictEqual(steps[8].kinds, ['declaration', 'note']);
        assert.strictEqual(steps[8].location.physicalLocation!.region.snippet!.text, 'int clock = 0;');
        const notes = flows.flatMap(flow => flow.locations)
            .filter(step => step.properties?.noteLevel !== undefined);
        assert.deepStrictEqual(notes.map(step => [step.properties!.noteLevel, traceImportance(step)]), [
            [3, 'unimportant'], [3, 'unimportant'], [1, 'important'], [2, 'unimportant'],
            [1, 'important'], [2, 'unimportant'], [0, 'essential'],
        ]);
    });

    it('projects exact default rows without duplicate entries or mutating the SARIF', () => {
        const {sarif, flows, logicalLocations} = loadOhci();
        const before = JSON.stringify(sarif);
        const rows = buildThreadTraceRows(flows, logicalLocations, new Map(), new Set(), false);
        assert.deepStrictEqual(rows.map(row => `${row.flowIndex}:${'type' in row.item ? row.item.type : 'flat'}:${'index' in row.item ? row.item.index : '?'}`), [
            '0:scope:0', '1:scope:0', '2:scope:0', '2:scope:1', '2:scope:3', '2:scope:4',
            '2:step:6', '2:scope:7', '2:step:9', '2:step:10', '2:scope:12', '2:scope:13', '2:step:17', '2:step:18',
        ]);
        for (const row of rows) {
            assert.ok('index' in row.item);
            if ('index' in row.item) assert.strictEqual(row.item.location, flows[row.flowIndex].locations[row.item.index]);
        }
        assert.strictEqual(JSON.stringify(sarif), before);
        // Logical locations identify constructs, but are unnecessary for rendering.
        assert.deepStrictEqual(buildThreadTraceRows(flows, [], new Map(), new Set(), false), rows);
    });

    it('retains relevant descendants under a closed worker and reopens only their branch', () => {
        const {flows} = loadOhci();
        const visible = (expansion: Map<string, boolean>) => buildThreadTraceRows(flows, [], expansion, new Set(), false)
            .filter(row => row.flowIndex === 2).map(row => 'index' in row.item ? row.item.index : -1);
        assert.deepStrictEqual(visible(new Map([['2:0', false]])), [0, 3, 4, 6, 9, 12, 17]);
        assert.deepStrictEqual(visible(new Map([['2:0', false], ['2:4', true]])),
            [0, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18]);
    });

    it('expands every original TFL exactly once with independent flow-local IDs', () => {
        const {flows} = loadOhci();
        const expansion = new Map<string, boolean>();
        flows.forEach((flow, flowIndex) => parseTraceHeaders(flow.locations)!
            .forEach(scope => expansion.set(`${flowIndex}:${scope.id}`, true)));
        const rows = buildThreadTraceRows(flows, [], expansion, new Set(), false);
        assert.strictEqual(rows.length, 28);
        flows.forEach((flow, flowIndex) => {
            assert.deepStrictEqual(rows.filter(row => row.flowIndex === flowIndex)
                .map(row => 'index' in row.item ? row.item.index : -1), flow.locations.map((_, index) => index));
        });
    });
});
