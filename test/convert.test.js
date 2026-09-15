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


test('resolves node membership declared after an earlier edge reference', () => {
  const input = `---
config:
  layout: elk
---
flowchart LR
  user([User]) -->|Request| gateway{Authorized?}
  gateway -->|Yes| api[API]
  gateway -.->|No| denied[Denied]
  subgraph backend[Backend]
    api --> db[(Database)]
  end`;
  const { d2, warnings } = convertMermaidFlowchartToD2(input);
  assert.equal(warnings.length, 0);
  assert.doesNotMatch(d2, /^"api":/m);
  assert.match(d2, /"backend": "Backend" \{[\s\S]*"api": \{ label: "API"; shape: rectangle \}/);
  assert.match(d2, /"gateway" -> "backend"\."api": "Yes"/);
  assert.match(d2, /"backend"\."api" -> "backend"\."db"/);
  assert.match(d2, /"gateway" -> "denied": "No" \{ style\.stroke-dash: 4 \}/);
});


test('converts Mermaid class assignments including container-qualified nodes', () => {
  const input = `flowchart LR
FMS --> TCP
subgraph backend[Backend]
ECU --> DBCLoader
end
class FMS,ECU server;
class TCP component;
class DBCLoader database;`;
  const { d2, warnings } = convertMermaidFlowchartToD2(input);
  assert.equal(warnings.length, 0);
  assert.match(d2, /"FMS"\.class: "server"/);
  assert.match(d2, /"backend"\."ECU"\.class: "server"/);
  assert.match(d2, /"TCP"\.class: "component"/);
  assert.match(d2, /"backend"\."DBCLoader"\.class: "database"/);
});
