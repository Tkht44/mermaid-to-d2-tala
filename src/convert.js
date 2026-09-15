const SHAPES = [
  [/^\(\((.*)\)\)$/s, 'circle'],
  [/^\[\((.*)\)\]$/s, 'cylinder'],
  [/^\(\[(.*)\]\)$/s, 'oval'],
  [/^\[\[(.*)\]\]$/s, 'queue'],
  [/^\{(.*)\}$/s, 'diamond'],
  [/^\(>(.*)\)$/s, 'callout'],
  [/^\((.*)\)$/s, 'oval'],
  [/^\[\/(.*)\/\]$/s, 'parallelogram'],
  [/^\[\\(.*)\\\]$/s, 'parallelogram'],
  [/^\[(.*)\]$/s, 'rectangle'],
];

const quote = value => JSON.stringify(String(value).replace(/<br\s*\/?>/gi, '\\n'));
const safeId = value => quote(value.trim());
const pathKey = parts => parts.join('\u0000');

function stripFrontmatter(source) {
  return source.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

function splitStatements(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/%%.*$/, '').trim();
    if (!line) continue;
    let current = '', depth = 0, quoteChar = null;
    for (const ch of line) {
      if (quoteChar) {
        current += ch;
        if (ch === quoteChar) quoteChar = null;
      } else if (ch === '"' || ch === "'") { quoteChar = ch; current += ch; }
      else if ('[({'.includes(ch)) { depth++; current += ch; }
      else if (']})'.includes(ch)) { depth--; current += ch; }
      else if (ch === ';' && depth === 0) {
        if (current.trim()) out.push({ line: i + 1, text: current.trim() });
        current = '';
      } else current += ch;
    }
    if (current.trim()) out.push({ line: i + 1, text: current.trim() });
  }
  return out;
}

function parseNode(token) {
  const m = token.trim().match(/^([\w.-]+)\s*(.*)$/s);
  if (!m) return null;
  const id = m[1], suffix = m[2].trim();
  if (!suffix) return { id, label: id, shape: null, explicit: false };
  for (const [re, shape] of SHAPES) {
    const sm = suffix.match(re);
    if (sm) return {
      id,
      label: sm[1].replace(/^['"]|['"]$/g, ''),
      shape,
      explicit: true,
    };
  }
  return null;
}

function edgeArrow(op) {
  return {
    arrow: op.startsWith('<') && op.endsWith('>') ? '<->'
      : op.startsWith('<') ? '<-'
      : op.endsWith('>') || op.endsWith('o') || op.endsWith('x') ? '->'
      : '--',
    dotted: op.includes('.'),
    thick: op.includes('='),
  };
}

function parseEdge(statement) {
  const arrowRe = /\s*(<[-.=]+>|<[-.=]+|[-.=]+>|[-.=]+(?:o|x))\s*/g;
  const parts = [];
  let last = 0, m;
  while ((m = arrowRe.exec(statement))) {
    parts.push(statement.slice(last, m.index).trim(), m[1]);
    last = arrowRe.lastIndex;
  }
  parts.push(statement.slice(last).trim());
  if (parts.length < 3) return null;

  const result = [];
  for (let i = 0; i + 2 < parts.length; i += 2) {
    const lhs = parts[i], op = parts[i + 1];
    let rhs = parts[i + 2], label = '';
    const pipe = rhs.match(/^\|([^|]*)\|\s*(.*)$/s);
    if (pipe) { label = pipe[1]; rhs = pipe[2]; }
    const from = parseNode(lhs), to = parseNode(rhs);
    if (!from || !to) return null;
    result.push({ from, to, label, ...edgeArrow(op) });
  }
  return result;
}

function emitNode(node, indent) {
  const attrs = [];
  if (node.label !== node.id) attrs.push(`label: ${quote(node.label)}`);
  if (node.shape) attrs.push(`shape: ${node.shape}`);
  return attrs.length
    ? `${indent}${safeId(node.id)}: { ${attrs.join('; ')} }`
    : `${indent}${safeId(node.id)}`;
}

function ref(node) {
  return [...node.containerPath, node.id].map(safeId).join('.');
}

export function convertMermaidFlowchartToD2(source, options = {}) {
  const statements = splitStatements(stripFrontmatter(source));
  const warnings = [], nodes = new Map(), edges = [], containers = [], classAssignments = [];
  const stack = [];

  const header = statements.shift();
  const hm = header?.text.match(/^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)$/i);
  if (!hm) throw new Error('Only Mermaid flowchart/graph diagrams are supported');
  const direction = ({ TB:'down', TD:'down', BT:'up', LR:'right', RL:'left' })[hm[1].toUpperCase()];

  function registerNode(parsed, currentPath) {
    const existing = nodes.get(parsed.id);
    if (!existing) {
      const node = { ...parsed, containerPath: [...currentPath] };
      nodes.set(parsed.id, node);
      return node;
    }
    if (parsed.explicit) {
      existing.label = parsed.label;
      existing.shape = parsed.shape;
      existing.explicit = true;
    }
    // A declaration/reference inside a subgraph determines final membership.
    if (currentPath.length) existing.containerPath = [...currentPath];
    return existing;
  }

  for (const item of statements) {
    const s = item.text;
    let m;
    if ((m = s.match(/^subgraph\s+([^\s\[]+)?\s*(?:\[(.*)\])?$/i))) {
      const id = m[1] || `subgraph_${item.line}`;
      const container = { id, label: m[2] || id, parentPath: [...stack], direction: null };
      containers.push(container);
      stack.push(id);
      continue;
    }
    if (/^end$/i.test(s)) {
      if (!stack.length) warnings.push({ line:item.line, message:'unmatched end' });
      else stack.pop();
      continue;
    }
    if ((m = s.match(/^direction\s+(TB|TD|BT|LR|RL)$/i))) {
      const current = containers.find(c => pathKey([...c.parentPath, c.id]) === pathKey(stack));
      if (current) current.direction = ({ TB:'down', TD:'down', BT:'up', LR:'right', RL:'left' })[m[1].toUpperCase()];
      else warnings.push({ line:item.line, message:'top-level direction statement omitted; header direction is used' });
      continue;
    }
    if ((m = s.match(/^class\s+([^\s]+)\s+([^\s;]+)\s*;?$/i))) {
      const ids = m[1].split(',').map(id => id.trim()).filter(Boolean);
      const className = m[2].trim();
      for (const id of ids) classAssignments.push({ id, className, line: item.line });
      continue;
    }
    if (/^(classDef|style|linkStyle|click)\b/i.test(s)) {
      warnings.push({ line:item.line, message:`styling or interaction omitted: ${s.split(/\s/)[0]}` });
      continue;
    }
    const parsedEdges = parseEdge(s);
    if (parsedEdges) {
      for (const e of parsedEdges) {
        const from = registerNode(e.from, stack);
        const to = registerNode(e.to, stack);
        edges.push({ ...e, fromId: from.id, toId: to.id });
      }
      continue;
    }
    const parsedNode = parseNode(s);
    if (parsedNode) { registerNode(parsedNode, stack); continue; }
    warnings.push({ line:item.line, message:`unsupported statement omitted: ${s}` });
  }

  while (stack.length) {
    warnings.push({ line:0, message:`unclosed subgraph: ${stack.pop()}` });
  }
  if (options.strict && warnings.length) {
    throw new Error(warnings.map(w => `line ${w.line}: ${w.message}`).join('\n'));
  }

  const output = ['# Generated by mmd2d2', `direction: ${direction}`, ''];
  const children = parentPath => containers.filter(c => pathKey(c.parentPath) === pathKey(parentPath));
  const emitContainer = (container, depth) => {
    const indent = '  '.repeat(depth);
    output.push(`${indent}${safeId(container.id)}: ${quote(container.label)} {`);
    if (container.direction) output.push(`${indent}  direction: ${container.direction}`);
    const fullPath = [...container.parentPath, container.id];
    for (const node of nodes.values()) {
      if (pathKey(node.containerPath) === pathKey(fullPath)) output.push(emitNode(node, `${indent}  `));
    }
    for (const child of children(fullPath)) emitContainer(child, depth + 1);
    output.push(`${indent}}`);
  };

  for (const node of nodes.values()) {
    if (!node.containerPath.length) output.push(emitNode(node, ''));
  }
  for (const container of children([])) emitContainer(container, 0);

  for (const assignment of classAssignments) {
    const node = nodes.get(assignment.id);
    if (!node) {
      warnings.push({ line: assignment.line, message: `class target not found: ${assignment.id}` });
      continue;
    }
    output.push(`${ref(node)}.class: ${safeId(assignment.className)}`);
  }
  output.push('');

  for (const e of edges) {
    const from = nodes.get(e.fromId), to = nodes.get(e.toId);
    const attrs = [];
    if (e.dotted) attrs.push('style.stroke-dash: 4');
    if (e.thick) attrs.push('style.stroke-width: 3');
    const label = e.label ? `: ${quote(e.label)}` : '';
    const block = attrs.length ? ` { ${attrs.join('; ')} }` : '';
    output.push(`${ref(from)} ${e.arrow} ${ref(to)}${label}${block}`);
  }
  return { d2: output.join('\n') + '\n', warnings };
}
