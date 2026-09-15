import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMermaidFlowchartToD2 } from '../src/convert.js';

test('converts nodes, labels, shapes and edges', () => {
  const input = `flowchart LR
A[Start] --> B{Ready?}
B -->|Yes| C((Done))
B -.->|No| A`;
  const { d2, warnings } = convertMermaidFlowchartToD2(input);
  assert.equal(warnings.length, 0);
  assert.match(d2, /direction: right/);
  assert.match(d2, /"B": \{ label: "Ready\?"; shape: diamond \}/);
  assert.match(d2, /"B" -> "C": "Yes"/);
  assert.match(d2, /stroke-dash: 4/);
});

test('converts subgraph to container', () => {
  const { d2 } = convertMermaidFlowchartToD2(`graph TD
subgraph api[API]
A[Web] --> B[(DB)]
end`);
  assert.match(d2, /"api": "API" \{/);
  assert.match(d2, /shape: cylinder/);
});

test('strict mode rejects omitted syntax', () => {
  assert.throws(() => convertMermaidFlowchartToD2('flowchart TD\nclassDef hot fill:red', {strict:true}));
});
