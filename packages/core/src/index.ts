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
    properties?: { scopes?: unknown };
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
    logicalLocationIndex?: number;
    relevant?: boolean;
}

export interface ScopeRow<T extends TraceStep = TraceStep> {
    type: 'scope';
    scope: TraceScope;
    label: string;
    open: boolean;
    depth: number;
    location?: T;
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
        const scopes = parseTraceScopes(flow.properties?.scopes, locations.length);
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

// A property bag is untrusted: reject invalid or crossing ranges instead of
// constructing a misleading trace. The caller then uses the legacy flat view.
export function parseTraceScopes(value: unknown, locationCount: number): TraceScope[] | undefined {
    if (!Array.isArray(value) || !value.length) return undefined;
    const scopes = value as TraceScope[];
    const byId = new Map<string, TraceScope>();
    for (const scope of scopes) {
        if (!scope || typeof scope.id !== 'string' || !scope.id || byId.has(scope.id) ||
            typeof scope.kind !== 'string' || (scope.parentId !== null && typeof scope.parentId !== 'string') ||
            !Number.isInteger(scope.startIndex) || !Number.isInteger(scope.endIndex) ||
            scope.startIndex < 0 || scope.endIndex > locationCount || scope.startIndex >= scope.endIndex ||
            (scope.logicalLocationIndex !== undefined &&
                (!Number.isInteger(scope.logicalLocationIndex) || scope.logicalLocationIndex < 0))) return undefined;
        byId.set(scope.id, scope);
    }
    for (const scope of scopes) {
        if (scope.parentId !== null) {
            const parent = byId.get(scope.parentId);
            if (!parent || parent === scope || parent.startIndex > scope.startIndex ||
                parent.endIndex < scope.endIndex) return undefined;
        }
    }
    const depth = (scope: TraceScope): number => {
        let count = 0;
        const seen = new Set<string>();
        for (let parent = scope.parentId; parent; parent = byId.get(parent)?.parentId ?? null) {
            if (seen.has(parent)) return Number.POSITIVE_INFINITY;
            seen.add(parent);
            count++;
        }
        return count;
    };
    const ordered = scopes.slice().sort((a, b) => a.startIndex - b.startIndex ||
        b.endIndex - a.endIndex || depth(a) - depth(b));
    if (ordered.some(scope => !Number.isFinite(depth(scope)))) return undefined;
    const stack: TraceScope[] = [];
    for (const scope of ordered) {
        while (stack.length && scope.startIndex >= stack[stack.length - 1].endIndex) stack.pop();
        const parent = stack[stack.length - 1];
        if (scope.parentId !== (parent?.id ?? null) ||
            (parent && scope.endIndex > parent.endIndex)) return undefined;
        stack.push(scope);
    }
    return ordered;
}

function noteIsRelevant(location: TraceStep): boolean {
    const level = location.properties?.noteLevel;
    return typeof level === 'number' && level <= 1 && level >= 0;
}

function scopeLabel(scope: TraceScope, logicalLocations: TraceLogicalLocation[], locations: TraceStep[]): string {
    const logical = scope.logicalLocationIndex === undefined ? undefined : logicalLocations[scope.logicalLocationIndex];
    const entry = locations[scope.startIndex]?.location?.message?.text;
    return logical?.name || logical?.fullyQualifiedName ||
        (scope.kind === 'functionCall' ? entry : undefined) ||
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
    for (let index = 0; index < locations.length; index++) {
        if (!noteIsRelevant(locations[index])) continue;
        const sourceIndex = locations[index].properties?.sourceStepIndex;
        if (typeof sourceIndex === 'number' && Number.isInteger(sourceIndex) &&
            sourceIndex >= 0 && sourceIndex < locations.length) sourcesWithVitalNotes.add(sourceIndex);
        const containing = scopes.filter(scope => scope.startIndex <= index && index < scope.endIndex);
        markPath(containing[containing.length - 1], true);
    }

    const isOpen = (scope: TraceScope) => expansion.get(scope.id) ?? defaultOpen.has(scope.id);
    // A relevant descendant can remain visible beneath a manually closed ancestor.
    // If that visible descendant is explicitly reopened, show its own children
    // without reopening the ancestor or exposing unrelated sibling branches.
    const pathIsOpen = (path: TraceScope[]) => path.every(isOpen) || path.some((scope, index) =>
        expansion.get(scope.id) === true && showOnCollapse.has(scope.id) && path.slice(index).every(isOpen));
    const rows: ScopedTraceRow<T>[] = [];
    const active: TraceScope[] = [];
    const headerStepIndexes = new Set<number>();
    const callEntryIndexes = new Map<string, number>();
    for (const scope of scopes) {
        if (scope.kind !== 'functionCall') continue;
        // Notes associated with the call can precede its entry step.
        const entry = locations.findIndex((step, index) => index >= scope.startIndex && index < scope.endIndex &&
            step.kinds?.includes('enter') && step.kinds?.includes('function') &&
            !scopes.some(child => child.parentId === scope.id && child.startIndex <= index && index < child.endIndex));
        if (entry >= 0) {
            headerStepIndexes.add(entry);
            callEntryIndexes.set(scope.id, entry);
        }
    }
    for (let index = 0; index < locations.length; index++) {
        while (active.length && index >= active[active.length - 1].endIndex) active.pop();
        const starting = headers.get(index) || [];
        for (const scope of starting) {
            const parentVisible = pathIsOpen(active);
            if (parentVisible || showOnCollapse.has(scope.id)) {
                rows.push({type: 'scope', scope, label: scopeLabel(scope, logicalLocations, locations),
                    open: isOpen(scope), depth: active.length,
                    location: scope.kind === 'functionCall' ? locations[callEntryIndexes.get(scope.id) ?? scope.startIndex] :
                        locations[scope.startIndex]});
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
