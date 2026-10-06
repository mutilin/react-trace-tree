// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import * as React from 'react';
import {
    buildThreadTraceRows, defaultTraceThreadIndex, isCollapsedTraceGroup, parseTraceScopes,
    TraceFlow, TraceLogicalLocation, TraceScope, TraceStep, ThreadTraceRow,
    traceImportance, traceNestingDepth,
} from '@mutilin/trace-tree-core';

export { defaultTraceThreadIndex } from '@mutilin/trace-tree-core';

export interface StepDetails {
    message?: string;
    file?: string;
    line?: number;
    column?: number;
}

export interface TraceNode<T extends TraceStep> {
    id: string;
    data: T;
    flowIndex: number;
    stepIndex: number;
}

export interface TraceTreeProps<T extends TraceStep> {
    flows: TraceFlow<T>[];
    logicalLocations?: TraceLogicalLocation[];
    getStepDetails?: (step: T) => StepDetails;
    selection?: string;
    onSelect?: (nodes: TraceNode<T>[]) => void;
    onActivate?: (node: TraceNode<T>) => void;
    onSelectStep?: (step: T, flowIndex: number, stepIndex: number) => void;
    onToggleScope?: (scope: TraceScope, location: T | undefined, flowIndex: number) => void;
    className?: string;
}

interface TraceTreeState {
    expandedScopes: Map<string, boolean>;
    expandedGroups: Set<string>;
    showAll: boolean;
    selectedKey?: string;
}

// Same palette and ordering as Bridge's ETVHtml.THREAD_COLORS.
const THREAD_COLORS = ['#5f54cb', '#85ff47', '#69c8ff', '#ff5de5', '#dfa720',
    '#0b67bf', '#fa92ff', '#57bfa8', '#bf425a', '#7d909e'];

export function threadGutter(flows: ReadonlyArray<TraceFlow>, flowIndex: number): React.CSSProperties {
    if (flows[flowIndex]?.id === 'global') return {};
    const index = flows.slice(0, flowIndex).filter(flow => flow.id !== 'global').length;
    return { marginLeft: 8 * (index + 1), borderLeft: `3px solid ${THREAD_COLORS[index % THREAD_COLORS.length]}` };
}

/** A trace-specific tree: relevant descendants may stay visible below closed ancestors. */
export class TraceTree<T extends TraceStep> extends React.Component<TraceTreeProps<T>, TraceTreeState> {
    state: TraceTreeState = {expandedScopes: new Map(), expandedGroups: new Set(), showAll: false};

    componentDidUpdate(previous: TraceTreeProps<T>) {
        if (previous.flows !== this.props.flows) {
            this.setState({expandedScopes: new Map(), expandedGroups: new Set(), showAll: false, selectedKey: undefined});
        }
    }

    private scopeKey(flowIndex: number, scopeId: string) { return `${flowIndex}:scope:${scopeId}`; }
    private groupKey(flowIndex: number, groupId: string) { return `${flowIndex}:group:${groupId}`; }

    private changeScope(flowIndex: number, scope: TraceScope, open: boolean) {
        this.setState(state => {
            const expandedScopes = new Map(state.expandedScopes);
            expandedScopes.set(`${flowIndex}:${scope.id}`, open);
            return {expandedScopes, selectedKey: undefined};
        });
    }

    private renderRow(row: ThreadTraceRow<T>): React.ReactNode {
        const {item, flowIndex, locations, baseNestingLevel} = row;
        const gutter = threadGutter(this.props.flows, flowIndex);
        if ('type' in item && item.type === 'scope') {
            const key = this.scopeKey(flowIndex, item.scope.id);
            const details = item.location && this.props.getStepDetails?.(item.location);
            return <div className="rtt-row" style={gutter} key={key}>
                <div className="rtt-main rtt-scope" style={{paddingLeft: item.depth * 16}}>
                    <button type="button" aria-expanded={item.open} onClick={() => {
                        this.changeScope(flowIndex, item.scope, !item.open);
                        this.props.onToggleScope?.(item.scope, item.location, flowIndex);
                    }}>
                        <span aria-hidden="true">{item.open ? '▾' : '▸'}</span> {item.label}
                        {item.scope.relevant && <span className="rtt-relevant">relevant</span>}
                    </button>
                </div>
                <div className="rtt-file">{details?.file ?? '—'}</div>
                <div className="rtt-line">{details?.line ?? '—'}</div>
            </div>;
        }
        if (isCollapsedTraceGroup(item)) {
            const key = this.groupKey(flowIndex, item.key);
            const expanded = this.state.expandedGroups.has(`${flowIndex}:${item.key}`);
            return <div className="rtt-row" style={gutter} key={key}>
                <div className="rtt-main rtt-collapsed"><button type="button" aria-expanded={expanded}
                    onClick={() => this.setState(state => {
                        const expandedGroups = new Set(state.expandedGroups);
                        if (expanded) expandedGroups.delete(`${flowIndex}:${item.key}`);
                        else expandedGroups.add(`${flowIndex}:${item.key}`);
                        return {expandedGroups};
                    })}>
                    {expanded ? 'Hide' : 'Show'} {item.locations.length} unimportant {item.locations.length === 1 ? 'step' : 'steps'}
                </button></div>
            </div>;
        }
        const step = 'type' in item ? item.location : item;
        const stepIndex = 'type' in item ? item.index : locations.indexOf(item);
        const key = `${flowIndex}:step:${stepIndex}`;
        const details = this.props.getStepDetails?.(step) ?? {message: step.location?.message?.text};
        const depth = traceNestingDepth(step, baseNestingLevel);
        return <div className={`rtt-row rtt-step rtt-${traceImportance(step)}${(this.props.selection ?? this.state.selectedKey) === key ? ' rtt-selected' : ''}`}
            style={gutter} key={key} tabIndex={0} role="button" aria-label={`Step ${stepIndex + 1}: ${details.message ?? '—'}`}
            onClick={() => this.selectStep(step, flowIndex, stepIndex, key)}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.selectStep(step, flowIndex, stepIndex, key);
                }
            }}>
            <div className="rtt-main" title={`Step ${stepIndex + 1}: ${details.message ?? '—'}`}>
                <span className="rtt-indent" style={{width: depth * 16}} />
                <span className="rtt-number">{stepIndex + 1}</span>
                <span className="rtt-text">{details.message ?? '—'}</span>
                {step.kinds?.map(kind => <span className="rtt-kind" key={kind}>{kind}</span>)}
            </div>
            <div className="rtt-file">{details.file ?? '—'}</div>
            <div className="rtt-line">{details.line === undefined ? '—' : `${details.line}:${details.column ?? 1}`}</div>
        </div>;
    }

    private selectStep(step: T, flowIndex: number, stepIndex: number, key: string) {
        this.setState({selectedKey: key});
        const node = {id: key, data: step, flowIndex, stepIndex};
        this.props.onSelect?.([node]);
        this.props.onActivate?.(node);
        this.props.onSelectStep?.(step, flowIndex, stepIndex);
    }

    render() {
        const {flows, logicalLocations = [], className} = this.props;
        const {expandedScopes, expandedGroups, showAll} = this.state;
        const rows = buildThreadTraceRows(flows, logicalLocations, expandedScopes, expandedGroups, showAll);
        const scopes = flows.map(flow => parseTraceScopes(flow.properties?.scopes, flow.locations.length));
        const unimportantCount = flows.reduce((count, flow, index) => count +
            (scopes[index] ? 0 : flow.locations.filter(step => traceImportance(step) === 'unimportant').length), 0);
        const visibleSteps = rows.filter(row => !isCollapsedTraceGroup(row.item) &&
            (!('type' in row.item) || row.item.type === 'step')).length;
        return <div className={`rtt-tree${className ? ` ${className}` : ''}`}>
            <div className="rtt-toolbar">
                <span>{visibleSteps} visible steps across {flows.length} threads</span>
                {scopes.some(Boolean) && <>
                    <button type="button" onClick={() => {
                        const all = new Map(expandedScopes);
                        scopes.forEach((list, flowIndex) => list?.forEach(scope => all.set(`${flowIndex}:${scope.id}`, true)));
                        this.setState({expandedScopes: all});
                    }}>Expand all</button>
                    <button type="button" onClick={() => {
                        const all = new Map(expandedScopes);
                        scopes.forEach((list, flowIndex) => list?.forEach(scope => all.set(`${flowIndex}:${scope.id}`, false)));
                        this.setState({expandedScopes: all, selectedKey: undefined});
                    }}>Collapse all</button>
                </>}
                {unimportantCount > 0 && <button type="button" onClick={() => this.setState({
                    showAll: !showAll, expandedGroups: showAll ? new Set<string>() : expandedGroups,
                    selectedKey: showAll ? undefined : this.state.selectedKey,
                })}>{showAll ? 'Hide unimportant steps' : `Show full trace (${unimportantCount})`}</button>}
            </div>
            <div className="rtt-list" role="list" aria-label="Analysis steps">
                {rows.length ? rows.map(row => this.renderRow(row)) :
                    <div className="rtt-empty">No analysis steps in selected result.</div>}
            </div>
        </div>;
    }
}
