// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

// Structural inputs accept SARIF thread flows without depending on SARIF itself.
export interface TraceStep {
    importance?: 'essential' | 'important' | 'unimportant';
    nestingLevel?: number;
    kinds?: string[];
    location?: { message?: { text?: string } };
    properties?: { [name: string]: any }; // SARIF property bags contain application-defined values.
}
export interface TraceFlow<T extends TraceStep = TraceStep> {
    id?: string;
    locations: T[];
    properties?: { [name: string]: unknown };
}
export interface TraceLogicalLocation {
    name?: string;
    fullyQualifiedName?: string;
}

export type TraceImportance = 'essential' | 'important' | 'unimportant'

export interface CollapsedTraceGroup<T extends TraceStep = TraceStep> {
    type: 'collapsed';
    key: string;
    startIndex: number;
    endIndex: number;
    locations: T[];
}

export type TraceItem<T extends TraceStep = TraceStep> = T | CollapsedTraceGroup<T>

export function traceImportance(location: TraceStep): TraceImportance {
    // SARIF 2.1.0 section 3.38.13: absent importance defaults to "important".
    return location.importance ?? 'important';
}

export function isCollapsedTraceGroup<T extends TraceStep>(item: TraceItem<T> | ScopedTraceRow<T>): item is CollapsedTraceGroup<T> {
    return (item as CollapsedTraceGroup<T>).type === 'collapsed';
}

export function traceBaseNestingLevel(locations: TraceStep[]): number {
    const levels = locations
        .map(location => location.nestingLevel)
        .filter((level): level is number => level !== undefined);
    return levels.length ? Math.min(...levels) : 0;
}

export function traceNestingDepth(location: TraceStep, baseLevel: number): number {
    return location.nestingLevel === undefined
        ? 0
        : Math.max(0, location.nestingLevel - baseLevel);
}

export function defaultTraceThreadIndex(flows: ReadonlyArray<TraceFlow>): number {
    let bestIndex = 0;
    let bestLength = 0;
    flows.forEach((flow, index) => {
        const length = flow.id === 'global' ? 0 : flow.locations?.length ?? 0;
        if (length > bestLength) {
            bestIndex = index;
            bestLength = length;
        }
    });
    return bestIndex;
}

export function buildTraceItems<T extends TraceStep>(
    locations: T[],
    showAll: boolean,
    expandedGroups: ReadonlySet<string>,
): TraceItem<T>[] {
    if (showAll) return locations;

    const items: TraceItem<T>[] = [];
    for (let index = 0; index < locations.length;) {
        if (traceImportance(locations[index]) !== 'unimportant') {
            items.push(locations[index]);
            index++;
            continue;
        }

        const startIndex = index;
        while (index < locations.length && traceImportance(locations[index]) === 'unimportant') {
            index++;
        }
        const endIndex = index - 1;
        const key = `${startIndex}-${endIndex}`;
        const group: CollapsedTraceGroup<T> = {
            type: 'collapsed',
            key,
            startIndex,
            endIndex,
            locations: locations.slice(startIndex, index),
        };
        items.push(group);
        if (expandedGroups.has(key)) items.push(...group.locations);
    }
    return items;
}

export interface TraceScope {
    id: string;
    kind: string;
    parentId: string | null;
    startIndex: number;
    endIndex: number;
    relevant?: boolean;
}

export interface ScopeRow<T extends TraceStep = TraceStep> {
    type: 'scope';
    index: number;
    scope: TraceScope;
    label: string;
    open: boolean;
    depth: number;
    location: T;
}

export interface StepRow<T extends TraceStep = TraceStep> {
    type: 'step';
    index: number;
    location: T;
}

export type ScopedTraceRow<T extends TraceStep = TraceStep> = ScopeRow<T> | StepRow<T>;

export interface ThreadTraceRow<T extends TraceStep = TraceStep> {
    flowIndex: number;
    flowId?: string;
    item: TraceItem<T> | ScopedTraceRow<T>;
    locations: T[];
    baseNestingLevel: number;
}

/** Build one ordered list while keeping each flow's scope and nesting independent. */
export function buildThreadTraceRows<T extends TraceStep>(flows: TraceFlow<T>[], logicalLocations: TraceLogicalLocation[],
    expandedScopes: ReadonlyMap<string, boolean>, expandedGroups: ReadonlySet<string>, showAll: boolean): ThreadTraceRow<T>[] {
    return flows.reduce<ThreadTraceRow<T>[]>((rows, flow, flowIndex) => {
        const locations = flow.locations ?? [];
        const scopes = parseTraceHeaders(locations);
        const expansion = new Map<string, boolean>();
        expandedScopes.forEach((open, key) => {
            if (key.startsWith(`${flowIndex}:`)) expansion.set(key.slice(`${flowIndex}:`.length), open);
        });
        const groups = new Set<string>();
        expandedGroups.forEach(key => {
            if (key.startsWith(`${flowIndex}:`)) groups.add(key.slice(`${flowIndex}:`.length));
        });
        const items: Array<TraceItem<T> | ScopedTraceRow<T>> = scopes ? projectScopedTrace(locations, scopes, logicalLocations, expansion) :
            buildTraceItems(locations, showAll, groups);
        const baseNestingLevel = traceBaseNestingLevel(locations);
        rows.push(...items.map(item => ({flowIndex, flowId: flow.id, item, locations, baseNestingLevel})));
        return rows;
    }, []);
}

/** Parse preorder headers; IDs are flow-local TFL indexes and ends are exclusive.
 * No headers or malformed hierarchy means the caller must use the flat view.
 * Only headers can be parents. Old scope-table metadata is never consulted.
 */
export function parseTraceHeaders(locations: TraceStep[]): TraceScope[] | undefined {
    if (!locations.some(step => step.kinds?.includes('group'))) return undefined;
    const scopes: TraceScope[] = [];
    const stack: TraceScope[] = [];
    for (let index = 0; index < locations.length; index++) {
        const step = locations[index];
        const depth = step.nestingLevel;
        if (depth === undefined || !Number.isInteger(depth) || depth < 0) return undefined;
        while (stack.length && locations[stack[stack.length - 1].startIndex].nestingLevel! >= depth) {
            stack.pop()!.endIndex = index;
        }
        if (depth !== stack.length) return undefined;
        if (!step.kinds?.includes('group')) continue;
        const kinds = ['function', 'action', 'declarations'].filter(kind => step.kinds!.includes(kind));
        if (kinds.length !== 1) return undefined;
        const scope: TraceScope = {
            id: String(index), kind: kinds[0], parentId: stack.length ? stack[stack.length - 1].id : null,
            startIndex: index, endIndex: locations.length,
            relevant: kinds[0] === 'action' && traceImportance(step) !== 'unimportant',
        };
        scopes.push(scope);
        stack.push(scope);
    }
    return scopes;
}

function noteIsRelevant(location: TraceStep): boolean {
    const level = location.properties?.noteLevel;
    if (typeof level === 'number') return level <= 1 && level >= 0;
    return !!location.kinds?.includes('note') && traceImportance(location) !== 'unimportant';
}

function scopeLabel(scope: TraceScope, locations: TraceStep[]): string {
    return locations[scope.startIndex]?.location?.message?.text ||
        (scope.kind === 'declarations' ? 'Declarations' : scope.kind);
}

/** Project scope occurrences and TFLs into flat visible rows without React state. */
export function projectScopedTrace<T extends TraceStep>(
    locations: T[], scopes: TraceScope[], logicalLocations: TraceLogicalLocation[],
    expansion: ReadonlyMap<string, boolean>,
): ScopedTraceRow<T>[] {
    const headers = new Map<number, TraceScope[]>();
    const byId = new Map(scopes.map(scope => [scope.id, scope] as [string, TraceScope]));
    const defaultOpen = new Set<string>();
    const showOnCollapse = new Set<string>();
    const sourcesWithVitalNotes = new Set<number>();

    // Bridge opens the path to relevant action headers and vital notes. When
    // manually closed, preserve those rows and their ancestor headers.
    const markPath = (scope: TraceScope | undefined, includeSelf: boolean) => {
        if (scope) showOnCollapse.add(scope.id);
        for (let parent = includeSelf ? scope : scope && byId.get(scope.parentId || ''); parent;
            parent = byId.get(parent.parentId || '')) {
            showOnCollapse.add(parent.id);
            defaultOpen.add(parent.id);
        }
    };
    for (const scope of scopes) {
        const list = headers.get(scope.startIndex) || [];
        list.push(scope);
        headers.set(scope.startIndex, list);
        if (scope.kind === 'action' && scope.relevant) markPath(scope, false);
    }
    const notePath: TraceScope[] = [];
    for (let index = 0; index < locations.length; index++) {
        while (notePath.length && index >= notePath[notePath.length - 1].endIndex) notePath.pop();
        notePath.push(...(headers.get(index) || []));
        if (!noteIsRelevant(locations[index])) continue;
        const sourceIndex = locations[index].properties?.sourceStepIndex;
        if (typeof sourceIndex === 'number' && Number.isInteger(sourceIndex) &&
            sourceIndex >= 0 && sourceIndex < locations.length) sourcesWithVitalNotes.add(sourceIndex);
        markPath(notePath[notePath.length - 1], true);
    }

    const isOpen = (scope: TraceScope) => expansion.get(scope.id) ?? defaultOpen.has(scope.id);
    // A relevant descendant can remain visible beneath a manually closed ancestor.
    // If that visible descendant is explicitly reopened, show its own children
    // without reopening the ancestor or exposing unrelated sibling branches.
    const pathIsOpen = (path: TraceScope[]) => path.every(isOpen) || path.some((scope, index) =>
        expansion.get(scope.id) === true && showOnCollapse.has(scope.id) && path.slice(index).every(isOpen));
    const rows: ScopedTraceRow<T>[] = [];
    const active: TraceScope[] = [];
    const headerStepIndexes = new Set(scopes.map(scope => scope.startIndex));
    for (let index = 0; index < locations.length; index++) {
        while (active.length && index >= active[active.length - 1].endIndex) active.pop();
        const starting = headers.get(index) || [];
        for (const scope of starting) {
            const parentVisible = pathIsOpen(active);
            if (parentVisible || showOnCollapse.has(scope.id)) {
                rows.push({type: 'scope', index, scope, label: scopeLabel(scope, locations),
                    open: isOpen(scope), depth: active.length,
                    location: locations[scope.startIndex]});
            }
            active.push(scope);
        }
        if (headerStepIndexes.has(index)) continue;
        const pathOpen = pathIsOpen(active);
        const explicitlyOpen = active.some(scope => expansion.get(scope.id) === true);
        if (noteIsRelevant(locations[index]) || (pathOpen &&
            (explicitlyOpen || sourcesWithVitalNotes.has(index) || !active.length))) {
            rows.push({type: 'step', index, location: locations[index]});
        }
    }
    return rows;
}
