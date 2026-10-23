// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import assert from 'assert';
import { TraceFlow, TraceStep, buildThreadTraceRows, buildTraceItems, defaultTraceThreadIndex,
    isCollapsedTraceGroup, parseTraceHeaders, projectScopedTrace,
    traceBaseNestingLevel, traceImportance, traceNestingDepth } from './index';

function step(importance?: TraceStep['importance'], nestingLevel?: number): TraceStep {
    return {importance, nestingLevel};
}
function header(kind: string, depth: number, label = kind, importance: TraceStep['importance'] = 'unimportant'): TraceStep {
    return {...step(importance, depth), kinds: ['group', kind], location: {message: {text: label}}};
}
function visible(locations: TraceStep[], expansion = new Map<string, boolean>()): Array<string | number> {
    return projectScopedTrace(locations, parseTraceHeaders(locations)!, [], expansion)
        .map(row => row.type === 'scope' ? row.scope.id : row.index);
}

describe('Trace core', () => {
    it('shows threads in order with independent indentation', () => {
        const flows: TraceFlow[] = [
            {id: 'global', locations: [step('important', 0)]},
            {id: '1', locations: [step('important', 2), step('essential', 4)]},
            {id: '2', locations: [step('important', 7)]},
        ];
        const rows = buildThreadTraceRows(flows, [], new Map(), new Set(), false);
        assert.deepStrictEqual(rows.map(row => row.flowId), ['global', '1', '1', '2']);
        assert.deepStrictEqual(rows.map(row => row.flowIndex), [0, 1, 1, 2]);
        assert.deepStrictEqual(rows.map(row => traceNestingDepth(row.item as TraceStep, row.baseNestingLevel)), [0, 0, 2, 0]);
    });

    it('keeps equal header IDs and flat collapse groups independent between threads', () => {
        const locations = [header('action', 0), step('unimportant', 1)];
        const flows: TraceFlow[] = [
            {locations}, {locations},
            {locations: [step('unimportant'), step('unimportant')]},
            {locations: [step('unimportant'), step('unimportant')]},
        ];
        const rows = buildThreadTraceRows(flows, [], new Map([['1:0', true]]), new Set(['3:0-1']), false);
        assert.deepStrictEqual(rows.map(row => [row.flowIndex, 'type' in row.item ? row.item.type : 'step']), [
            [0, 'scope'], [1, 'scope'], [1, 'step'],
            [2, 'collapsed'], [3, 'collapsed'], [3, 'step'], [3, 'step'],
        ]);
    });

    it('uses the standard SARIF importance default', () => {
        assert.strictEqual(traceImportance(step()), 'important');
        assert.strictEqual(traceImportance(step('essential')), 'essential');
        assert.strictEqual(traceImportance(step('unimportant')), 'unimportant');
    });

    it('selects the largest non-global thread', () => {
        const flows = [{id: 'global', locations: [step(), step(), step()]},
            {id: '2', locations: [step(), step()]}, {id: '5', locations: [step()]}];
        assert.strictEqual(defaultTraceThreadIndex(flows), 1);
        assert.strictEqual(defaultTraceThreadIndex([flows[0], flows[2], flows[1]]), 2);
        assert.strictEqual(defaultTraceThreadIndex(flows.slice(0, 1)), 0);
        assert.strictEqual(defaultTraceThreadIndex([]), 0);
    });

    it('normalizes flat nesting levels', () => {
        const locations = [step('important', 2), step('important', 4), step()];
        const base = traceBaseNestingLevel(locations);
        assert.strictEqual(base, 2);
        assert.deepStrictEqual(locations.map(location => traceNestingDepth(location, base)), [0, 2, 0]);
    });

    it('collapses consecutive unimportant steps and expands only the requested group', () => {
        const locations = [step('important'), step('unimportant'), step('unimportant'), step('essential'), step('unimportant')];
        const items = buildTraceItems(locations, false, new Set());
        assert.strictEqual(items.length, 4);
        assert.strictEqual(items[0], locations[0]);
        assert.ok(isCollapsedTraceGroup(items[1]));
        if (isCollapsedTraceGroup(items[1])) {
            assert.strictEqual(items[1].key, '1-2');
            assert.deepStrictEqual(items[1].locations, locations.slice(1, 3));
        }
        const expanded = buildTraceItems(locations, false, new Set(['1-2']));
        assert.strictEqual(expanded.length, 6);
        assert.strictEqual(expanded[2], locations[1]);
        assert.strictEqual(expanded[3], locations[2]);
        assert.ok(isCollapsedTraceGroup(expanded[5]));
        assert.strictEqual(buildTraceItems(locations, true, new Set()), locations);
    });

    it('reconstructs nested, sibling and empty occurrences without mutating input', () => {
        const locations = [header('function', 0, 'Call'), header('declarations', 1),
            header('action', 1), step('unimportant', 2), header('function', 0, 'Call')];
        locations[0].kinds = ['function', 'enter', 'group'];
        const before = JSON.stringify(locations);
        const scopes = parseTraceHeaders(locations)!;
        assert.deepStrictEqual(scopes.map(s => [s.id, s.kind, s.parentId, s.startIndex, s.endIndex]), [
            ['0', 'function', null, 0, 4], ['1', 'declarations', '0', 1, 2],
            ['2', 'action', '0', 2, 4], ['4', 'function', null, 4, 5],
        ]);
        assert.strictEqual(JSON.stringify(locations), before);
        const rows = projectScopedTrace(locations, scopes, [{name: 'Wrong label'}], new Map());
        assert.deepStrictEqual(rows.map(row => row.type === 'scope' ? row.label : row.index), ['Call', 'Call']);
        assert.strictEqual(rows[0].location, locations[0]);
        assert.deepStrictEqual(rows.map(row => row.index), [0, 4]);
    });

    it('preserves relevant action and note paths beneath closed ancestors', () => {
        const locations = [header('function', 0, 'Outer'), header('action', 1, 'Probe', 'important'),
            step('unimportant', 2), {...step('important', 2), kinds: ['note'], properties: {noteLevel: 1}},
            header('function', 2, 'Callback'), step('unimportant', 3)];
        assert.deepStrictEqual(visible(locations), ['0', '1', 3, '4']);
        assert.deepStrictEqual(visible(locations, new Map([['0', false]])), ['0', '1', 3]);
        assert.deepStrictEqual(visible(locations, new Map([['4', true]])), ['0', '1', 3, '4', 5]);
        assert.deepStrictEqual(visible(locations, new Map([['4', true], ['0', false]])), ['0', '1', 3]);
    });

    it('reopens a visible descendant without exposing unrelated branches', () => {
        const locations = [header('function', 0), header('function', 1), header('declarations', 2),
            step('unimportant', 3), header('action', 2, 'Relevant', 'important'), header('function', 1)];
        assert.deepStrictEqual(visible(locations, new Map([['0', false]])), ['0', '1', '4']);
        assert.deepStrictEqual(visible(locations, new Map([['0', false], ['1', true]])), ['0', '1', '2', '4']);
        assert.deepStrictEqual(visible(locations, new Map([['0', false], ['1', true], ['2', true]])),
            ['0', '1', '2', 3, '4']);
    });

    it('does not promote action bodies and honors omitted header importance', () => {
        const locations = [header('action', 0, 'Probe', 'important'), step('unimportant', 1)];
        delete locations[0].importance;
        assert.strictEqual(parseTraceHeaders(locations)![0].relevant, true);
        assert.deepStrictEqual(visible(locations), ['0']);
        assert.deepStrictEqual(visible(locations, new Map([['0', true]])), ['0', 1]);
    });

    it('resolves backward entry notes and forward statement notes without duplicate headers', () => {
        const locations = [header('function', 0, 'Call'),
            {...step('essential', 1), kinds: ['note'], properties: {noteLevel: 0, sourceStepIndex: 0}},
            {...step('important', 1), kinds: ['note'], properties: {noteLevel: 1, sourceStepIndex: 3}},
            step('unimportant', 1),
            {...step('unimportant', 1), kinds: ['assumption'], properties: {sourceStepIndex: 0}}];
        assert.deepStrictEqual(visible(locations), ['0', 1, 2, 3]);
        assert.deepStrictEqual(visible(locations, new Map([['0', false]])), ['0', 1, 2]);
        assert.deepStrictEqual(visible(locations, new Map([['0', true]])), ['0', 1, 2, 3, 4]);
        assert.strictEqual(locations[0].importance, 'unimportant');
    });

    it('ignores invalid source links safely', () => {
        for (const sourceStepIndex of [-1, 50, 1.5, '0']) {
            const locations = [header('function', 0),
                {...step('important', 1), kinds: ['note'], properties: {noteLevel: 1, sourceStepIndex}}];
            assert.deepStrictEqual(visible(locations), ['0', 1]);
        }
    });

    it('uses standard importance for notes without a producer note level', () => {
        const locations = [header('function', 0),
            {...step(undefined, 1), kinds: ['note'], properties: {sourceStepIndex: 2}},
            step('unimportant', 1),
            {...step('unimportant', 1), kinds: ['note']},
            {...step('essential', 1), kinds: ['note'], properties: {noteLevel: 3}},
        ];
        assert.deepStrictEqual(visible(locations), ['0', 1, 2]);
        assert.deepStrictEqual(visible(locations, new Map([['0', false]])), ['0', 1]);
    });

    it('rejects malformed headers and depths and falls back to flat rendering', () => {
        const invalid = [
            [header('function', 1)],
            [header('function', 0), step('important', 2)],
            [header('function', 0), step('important')],
            [header('function', 0), step('important', -1)],
            [header('function', 0), step('important', 0.5)],
            [header('function', 0), step('important', NaN)],
            [header('unknown', 0)],
            [{...header('function', 0), kinds: ['group', 'function', 'action']}],
            [header('function', 0), step('important', 1), step('important', 2)],
        ];
        for (const locations of invalid) {
            assert.strictEqual(parseTraceHeaders(locations), undefined);
            const rows = buildThreadTraceRows([{locations}], [], new Map(), new Set(), true);
            assert.deepStrictEqual(rows.map(row => row.item), locations);
        }
        assert.strictEqual(parseTraceHeaders([]), undefined);
        assert.strictEqual(parseTraceHeaders([step()]), undefined);
    });

    it('ignores old scope metadata even when valid', () => {
        const locations = [step('important'), step('important')];
        const flow = {locations, properties: {scopes: [{id: 'old', kind: 'action', parentId: null, startIndex: 0, endIndex: 2}]}};
        assert.deepStrictEqual(buildThreadTraceRows([flow], [], new Map(), new Set(), false).map(row => row.item), locations);
    });
});
