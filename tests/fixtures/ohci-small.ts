// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import {readFileSync} from 'fs';
import {join} from 'path';
import {TraceFlow, TraceStep, TraceLogicalLocation} from '../../packages/core/src';

export interface OhciStep extends TraceStep {
    location: NonNullable<TraceStep['location']> & {
        physicalLocation?: {
            artifactLocation: {uri: string; index: number};
            region: {startLine: number; snippet?: {text: string}};
        };
    };
}

/** Fresh data per test: no Python, sibling repository or external file access. */
export function loadOhci() {
    const sarif = JSON.parse(readFileSync(join(__dirname, 'ohci-small.sarif'), 'utf8'));
    const run = sarif.runs[0];
    return {
        sarif,
        flows: run.results[0].codeFlows[0].threadFlows as TraceFlow<OhciStep>[],
        logicalLocations: run.logicalLocations as TraceLogicalLocation[],
        artifacts: run.artifacts as Array<{location: {uri: string}; contents: {text: string}}>,
    };
}
