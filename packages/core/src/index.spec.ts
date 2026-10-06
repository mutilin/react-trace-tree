// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import assert from 'assert';
import { TraceFlow, TraceStep } from './index';
import { buildThreadTraceRows, buildTraceItems, defaultTraceThreadIndex, isCollapsedTraceGroup, parseTraceScopes, projectScopedTrace,
    traceBaseNestingLevel, traceImportance, traceNestingDepth } from './index';

function step(importance?: TraceStep['importance'], nestingLevel?: number): TraceStep {
    return { importance, nestingLevel };
}

describe('TraceView', () => {
    it('shows all threads in order and resets indentation for each flow', () => {
        const flows: TraceFlow[] = [
            {id: 'global', locations: [step('important', 0)]},
            {id: '1', locations: [step('important', 2), step('essential', 4)]},
            {id: '2', locations: [step('important', 7)]},
        ];
        const rows = buildThreadTraceRows(flows, [], new Map(), new Set(), false);
        assert.deepStrictEqual(rows.map(row => row.flowId), ['global', '1', '1', '2']);
        assert.deepStrictEqual(rows.map(row => row.flowIndex), [0, 1, 1, 2]);
        assert.deepStrictEqual(rows.map(row => traceNestingDepth(row.item as TraceStep, row.baseNestingLevel)),
            [0, 0, 2, 0]);
    });

    it('keeps equal scope IDs and legacy collapse groups independent between threads', () => {
        const flows: TraceFlow[] = [
            {id: '1', locations: [step('unimportant'), step('unimportant')],
                properties: {scopes: [{id: 'action', kind: 'action', parentId: null, startIndex: 0, endIndex: 2}]}},
            {id: '2', locations: [step('unimportant'), step('unimportant')],
                properties: {scopes: [{id: 'action', kind: 'action', parentId: null, startIndex: 0, endIndex: 2}]}},
            {id: '3', locations: [step('unimportant'), step('unimportant')]},
            {id: '4', locations: [step('unimportant'), step('unimportant')]},
        ];
        const rows = buildThreadTraceRows(flows, [], new Map([['1:action', true]]), new Set(['3:0-1']), false);
        assert.deepStrictEqual(rows.map(row => [row.flowIndex,
            'type' in row.item ? row.item.type : 'step']), [
            [0, 'scope'], [1, 'scope'], [1, 'step'], [1, 'step'],
            [2, 'collapsed'], [3, 'collapsed'], [3, 'step'], [3, 'step'],
        ]);
    });

    it('uses the SARIF default importance', () => {
        assert.strictEqual(traceImportance(step()), 'important');
        assert.strictEqual(traceImportance(step('essential')), 'essential');
        assert.strictEqual(traceImportance(step('unimportant')), 'unimportant');
    });

    it('selects the largest non-global thread for annotations by default', () => {
        const flows: TraceFlow[] = [
            {id: 'global', locations: [step()]},
            {id: '2', locations: [step(), step()]},
            {id: '5', locations: [step()]},
        ];
        assert.strictEqual(defaultTraceThreadIndex(flows), 1);
        assert.strictEqual(defaultTraceThreadIndex([flows[0], flows[2], flows[1]]), 2);
        assert.strictEqual(defaultTraceThreadIndex(flows.slice(0, 1)), 0);
        assert.strictEqual(defaultTraceThreadIndex([]), 0);
        assert.strictEqual(flows.reduce((count, flow) => count + flow.locations.length, 0), 4);
    });

    it('normalizes nesting levels relative to the shallowest location', () => {
        const locations = [step('important', 2), step('important', 4), step()];
        const baseLevel = traceBaseNestingLevel(locations);

        assert.strictEqual(baseLevel, 2);
        assert.strictEqual(traceNestingDepth(locations[0], baseLevel), 0);
        assert.strictEqual(traceNestingDepth(locations[1], baseLevel), 2);
        assert.strictEqual(traceNestingDepth(locations[2], baseLevel), 0);
    });

    it('collapses consecutive unimportant locations in normal view', () => {
        const locations = [
            step('important'),
            step('unimportant'),
            step('unimportant'),
            step('essential'),
            step('unimportant'),
        ];
        const items = buildTraceItems(locations, false, new Set());

        assert.strictEqual(items.length, 4);
        assert.strictEqual(items[0], locations[0]);
        assert.ok(isCollapsedTraceGroup(items[1]));
        if (isCollapsedTraceGroup(items[1])) {
            assert.strictEqual(items[1].key, '1-2');
            assert.deepStrictEqual(items[1].locations, locations.slice(1, 3));
        }
        assert.strictEqual(items[2], locations[3]);
        assert.ok(isCollapsedTraceGroup(items[3]));
    });

    it('expands one group without expanding the rest', () => {
        const locations = [
            step('important'),
            step('unimportant'),
            step('unimportant'),
            step('essential'),
            step('unimportant'),
        ];
        const items = buildTraceItems(locations, false, new Set(['1-2']));

        assert.strictEqual(items.length, 6);
        assert.ok(isCollapsedTraceGroup(items[1]));
        assert.strictEqual(items[2], locations[1]);
        assert.strictEqual(items[3], locations[2]);
        assert.ok(isCollapsedTraceGroup(items[5]));
    });

    it('returns the original locations in full view', () => {
        const locations = [step('important'), step('unimportant')];
        assert.strictEqual(buildTraceItems(locations, true, new Set()), locations);
    });

    it('keeps relevant actions and vital notes visible across collapsed ancestors', () => {
        const locations: TraceStep[] = [
            {kinds: ['enter', 'function'], location: {message: {text: 'start'}}},
            {location: {message: {text: 'ordinary'}}},
            {kinds: ['note'], importance: 'unimportant', properties: {noteLevel: 2}},
            {kinds: ['note'], importance: 'important', properties: {noteLevel: 1}},
            {kinds: ['enter', 'function'], location: {message: {text: 'callback'}}},
            {location: {message: {text: 'hidden implementation'}}},
        ];
        const scopes = parseTraceScopes([
            {id: 'call', kind: 'functionCall', parentId: null, startIndex: 0, endIndex: 6,
                logicalLocationIndex: 0},
            {id: 'action', kind: 'action', relevant: true, parentId: 'call', startIndex: 1, endIndex: 6,
                logicalLocationIndex: 1},
            {id: 'inner', kind: 'functionCall', parentId: 'action', startIndex: 4, endIndex: 6,
                logicalLocationIndex: 2},
        ], locations.length)!;
        const logical = [{name: 'start'}, {name: 'Probe device'}, {name: 'callback'}];
        const labels = (expansion: Map<string, boolean>) => projectScopedTrace(locations, scopes, logical, expansion)
            .map(row => row.type === 'scope' ? `scope:${row.label}:${row.open}` : `step:${row.index}`);

        // Open just the paths necessary to reach a relevant action and note.
        assert.deepStrictEqual(labels(new Map()), [
            'scope:start:true', 'scope:Probe device:true', 'step:3',
            'scope:callback:false',
        ]);
        // Closing a parent hides ordinary rows, but not the relevant path.
        assert.deepStrictEqual(labels(new Map([['call', false]])), [
            'scope:start:false', 'scope:Probe device:true', 'step:3',
        ]);
        // Reopening does not reset the explicitly expanded inner scope.
        assert.deepStrictEqual(labels(new Map([['inner', true]])), [
            'scope:start:true', 'scope:Probe device:true', 'step:3',
            'scope:callback:true', 'step:5',
        ]);
        assert.deepStrictEqual(labels(new Map([['inner', true], ['call', false]])), [
            'scope:start:false', 'scope:Probe device:true', 'step:3',
        ]);
    });

    it('shows children of an explicitly reopened visible function without reopening its closed ancestor', () => {
        const locations = [step(), step(), step(), step(), step()];
        const scopes = parseTraceScopes([
            {id: 'outer', kind: 'functionCall', parentId: null, startIndex: 0, endIndex: 5},
            {id: 'inner', kind: 'functionCall', parentId: 'outer', startIndex: 1, endIndex: 4},
            {id: 'declarations', kind: 'declarations', parentId: 'inner', startIndex: 2, endIndex: 3},
            {id: 'relevant', kind: 'action', relevant: true, parentId: 'inner', startIndex: 3, endIndex: 4},
        ], locations.length)!;
        const visible = (expansion: Map<string, boolean>) => projectScopedTrace(locations, scopes, [], expansion)
            .map(row => row.type === 'scope' ? row.scope.id : `step:${row.index}`);

        assert.deepStrictEqual(visible(new Map([['outer', false]])), ['outer', 'inner', 'relevant']);
        assert.deepStrictEqual(visible(new Map([['outer', false], ['inner', true]])),
            ['outer', 'inner', 'step:1', 'declarations', 'relevant']);
        assert.deepStrictEqual(visible(new Map([['outer', false], ['inner', true], ['declarations', true]])),
            ['outer', 'inner', 'step:1', 'declarations', 'step:2', 'relevant']);
    });

    it('treats a relevant action header differently from its body', () => {
        const locations = [step('unimportant'), step('unimportant')];
        const scopes = parseTraceScopes([
            {id: 'action', kind: 'action', parentId: null, startIndex: 0, endIndex: 2, relevant: true,
                logicalLocationIndex: 0},
        ], locations.length)!;
        const rows = projectScopedTrace(locations, scopes, [{name: 'Probe'}], new Map());
        assert.deepStrictEqual(rows.map(row => row.type), ['scope']);
        assert.deepStrictEqual(projectScopedTrace(locations, scopes, [{name: 'Probe'}],
            new Map([['action', true]])).map(row => row.type), ['scope', 'step', 'step']);
    });

    it('rejects invalid or crossing scope ranges and preserves the legacy fallback', () => {
        assert.strictEqual(parseTraceScopes(undefined, 4), undefined);
        assert.strictEqual(parseTraceScopes([{id: 'x', kind: 'action', parentId: null,
            startIndex: 0, endIndex: 5}], 4), undefined);
        assert.strictEqual(parseTraceScopes([
            {id: 'a', kind: 'action', parentId: null, startIndex: 0, endIndex: 3},
            {id: 'b', kind: 'action', parentId: null, startIndex: 2, endIndex: 4},
        ], 4), undefined);
        const locations = [step('important'), step('unimportant')];
        assert.strictEqual(buildTraceItems(locations, false, new Set()).length, 2);
    });

    it('accepts nested scopes that cover the same steps and separate note/source links', () => {
        const locations: TraceStep[] = [
            {location: {message: {text: 'vital'}}, kinds: ['note'],
                properties: {noteLevel: 1, sourceStepIndex: 1}},
            {location: {message: {text: 'source'}}},
        ];
        const scopes = parseTraceScopes([
            {id: 'declarations', kind: 'declarations', parentId: 'action', startIndex: 0, endIndex: 2},
            {id: 'call', kind: 'functionCall', parentId: null, startIndex: 0, endIndex: 2},
            {id: 'action', kind: 'action', parentId: 'call', startIndex: 0, endIndex: 2},
        ], locations.length)!;
        assert.deepStrictEqual(scopes.map(scope => scope.id), ['call', 'action', 'declarations']);
        const rows = projectScopedTrace(locations, scopes, [], new Map());
        assert.deepStrictEqual(rows.map(row => row.type === 'scope' ? row.scope.id : row.index),
            ['call', 'action', 'declarations', 0, 1]);
        assert.deepStrictEqual(projectScopedTrace(locations, scopes, [], new Map([['call', false]]))
            .map(row => row.type === 'scope' ? row.scope.id : row.index),
        ['call', 'action', 'declarations', 0]);
    });
});
