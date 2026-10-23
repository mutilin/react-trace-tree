// Copyright (c) 2026 Vadim Mutilin.
// Licensed under the MIT License.

import assert from 'assert';
import {getEmbeddedSource, getStepDetails, SarifArtifact, SarifTraceStep} from './sarif';

describe('Demo SARIF adapter', () => {
    const artifacts: SarifArtifact[] = [{location: {uri: 'example.c'}, contents: {text: 'int count;\n'}}];

    it('reads generic step details and resolves index-only artifact references', () => {
        const step: SarifTraceStep = {location: {message: {text: 'Declare counter'}, physicalLocation: {
            artifactLocation: {index: 0}, region: {startLine: 1, startColumn: 5, snippet: {text: 'int count;'}},
        }}};
        assert.deepStrictEqual(getStepDetails(step, artifacts), {
            message: 'Declare counter', file: 'example.c', line: 1, column: 5,
        });
        assert.deepStrictEqual(getEmbeddedSource(step, artifacts), {
            file: 'example.c', text: 'int count;\n', line: 1,
        });
    });

    it('uses snippets as fallback messages and supports URI-only artifact references', () => {
        const step: SarifTraceStep = {location: {physicalLocation: {
            artifactLocation: {uri: 'example.c'}, region: {startLine: 1, snippet: {text: 'int count;'}},
        }}};
        assert.strictEqual(getStepDetails(step).message, 'int count;');
        assert.strictEqual(getEmbeddedSource(step, artifacts)!.text, 'int count;\n');
        step.location!.physicalLocation!.artifactLocation!.index = 99;
        assert.strictEqual(getEmbeddedSource(step, artifacts)!.file, 'example.c');
    });

    it('handles missing locations, regions, artifacts and embedded contents', () => {
        assert.deepStrictEqual(getStepDetails({}), {message: undefined, file: undefined, line: undefined, column: undefined});
        assert.strictEqual(getEmbeddedSource({}, artifacts), undefined);
        assert.strictEqual(getEmbeddedSource({location: {physicalLocation: {artifactLocation: {index: 99}}}}, artifacts), undefined);
        const step: SarifTraceStep = {location: {physicalLocation: {artifactLocation: {index: 0}}}};
        assert.strictEqual(getEmbeddedSource(step, [{location: {uri: 'external.c'}}]), undefined);
        assert.deepStrictEqual(getEmbeddedSource(step, [{contents: {text: ''}}]), {
            file: 'Embedded source', text: '', line: undefined,
        });
    });
});
