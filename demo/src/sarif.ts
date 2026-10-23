// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import type {TraceFlow, TraceLogicalLocation, TraceStep} from '@mutilin/trace-tree-core';
import type {StepDetails} from '@mutilin/react-trace-tree';

// Structural SARIF fields used by the demo; the trace library stays SARIF-free.
export interface SarifTraceStep extends TraceStep {
    location?: NonNullable<TraceStep['location']> & {
        physicalLocation?: {
            artifactLocation?: {uri?: string; index?: number};
            region?: {startLine?: number; startColumn?: number; snippet?: {text?: string}};
        };
    };
}

export interface SarifArtifact {
    location?: {uri?: string};
    contents?: {text?: string};
}

export interface SarifRun {
    artifacts?: SarifArtifact[];
    logicalLocations?: TraceLogicalLocation[];
    results?: Array<{
        message?: {text?: string};
        codeFlows?: {threadFlows?: TraceFlow<SarifTraceStep>[]}[];
    }>;
}

export interface SarifLog {
    runs: SarifRun[];
}

function resolveArtifact(step: SarifTraceStep, artifacts: SarifArtifact[]): SarifArtifact | undefined {
    const reference = step.location?.physicalLocation?.artifactLocation;
    if (!reference) return undefined;
    if (reference.index !== undefined && Number.isInteger(reference.index) && reference.index >= 0) {
        const artifact = artifacts[reference.index];
        if (artifact) return artifact;
    }
    return reference.uri === undefined ? undefined : artifacts.find(artifact => artifact.location?.uri === reference.uri);
}

export function getStepDetails(step: SarifTraceStep, artifacts: SarifArtifact[] = []): StepDetails {
    const physical = step.location?.physicalLocation;
    return {
        message: step.location?.message?.text ?? physical?.region?.snippet?.text,
        file: physical?.artifactLocation?.uri ?? resolveArtifact(step, artifacts)?.location?.uri,
        line: physical?.region?.startLine,
        column: physical?.region?.startColumn,
    };
}

export function getEmbeddedSource(step: SarifTraceStep, artifacts: SarifArtifact[]) {
    const artifact = resolveArtifact(step, artifacts);
    const text = artifact?.contents?.text;
    if (text === undefined) return undefined;
    return {
        file: getStepDetails(step, artifacts).file ?? 'Embedded source',
        text,
        line: step.location?.physicalLocation?.region?.startLine,
    };
}
