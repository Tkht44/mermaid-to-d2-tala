# mermaid-to-d2-tala

Mermaid flowchart source is converted to D2 source, then optionally rendered by D2 with the TALA layout engine.

## Design

This tool converts semantic graph structure, not ELK coordinates. Mermaid's ELK integration is useful as a reference for layout intent, but ELK's computed coordinates should not be copied into D2 because doing so prevents TALA from performing its own layout. Mermaid directions and subgraphs are instead mapped to D2 directions and containers.

## Requirements

- Node.js 20 or later
- D2 CLI for rendering
- TALA installed and licensed/evaluation-enabled for `--layout tala`

Conversion alone does not require D2 or TALA.

## Usage

```bash
npm test
node src/cli.js example.mmd -o example.d2
node src/cli.js example.mmd --render example.svg
node src/cli.js example.mmd --render example.svg --seed 42
```

Install as a local command:

```bash
npm link
mmd2d2 example.mmd --render example.svg
```

## Supported Mermaid subset

- `flowchart` and `graph`
- Directions: `TB`, `TD`, `BT`, `LR`, `RL`
- Nodes: rectangle, rounded/oval, circle, diamond, cylinder, queue-like double rectangle, parallelogram
- Directed, bidirectional, undirected, dotted, and thick edges
- Edge labels using `|label|`
- `subgraph`, nested containers, local `direction`
- Comments, semicolon-separated statements, YAML frontmatter

## Deliberate limitations

- `classDef`, `class`, `style`, `linkStyle`, and `click` are reported and omitted.
- Sequence, class, state, ER, Gantt, mindmap, and other Mermaid diagram families are rejected.
- The converter does not import Mermaid's internal flowchart database because it is not a stable public AST contract. The parser is intentionally isolated in `src/convert.js`, so it can later be replaced without changing the CLI.
- Rendering depends on a working local D2/TALA installation. The CLI treats the renderer exit code as authoritative.

Use `--strict` in CI to fail when any statement cannot be represented.
