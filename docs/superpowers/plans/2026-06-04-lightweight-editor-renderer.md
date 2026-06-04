# Lightweight Editor Renderer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dummy `@roadmapsh/editor` shim with a real SVG renderer that takes `{ nodes, edges }` and produces interactive SVG.

**Architecture:** Single-file implementation in `src/lib/editor-shim.ts`. Core function `renderFlowJSON` builds an SVG DOM element from node/edge data. React components `Renderer` and `ReadonlyEditor` wrap it with `useEffect` injection into a container div. All 14 node types rendered as SVG `<g>` groups with `data-node-id`, `data-type`, `data-title` attributes for interaction.

**Tech Stack:** React 19, TypeScript (no new dependencies)

---

### Task 1: Rewrite `src/lib/editor-shim.ts` — Full SVG Renderer

**Files:**
- Modify: `src/lib/editor-shim.ts`
- Modify: `src/lib/editor-shim.css`

The file has 5 sections: types, SVG building functions, renderFlowJSON, React components, and AI helpers.

- [ ] **Step 1: Write the complete `editor-shim.ts`**

```typescript
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

type NodeData = {
  id: string;
  type: string;
  position: { x: number; y: number };
  positionAbsolute?: { x: number; y: number };
  data: {
    label: string;
    href?: string;
    color?: string;
    backgroundColor?: string;
    badge?: string;
    badgeColor?: string;
    borderColor?: string;
    legend?: { id: string; color: string; label: string; position: string };
    checklists?: { id: string; label: string }[];
    style?: Record<string, any>;
    oldId?: string;
    edgeStyle?: string;
  };
  width?: number;
  height?: number;
  style?: { width: number; height: number };
  measured?: { width: number; height: number };
  zIndex?: number;
};

type EdgeData = {
  id: string;
  source?: string;
  target?: string;
  sourceHandle: string;
  targetHandle: string;
  data?: { edgeStyle?: 'solid' | 'dashed' };
  style?: { stroke?: string; strokeWidth?: number; strokeDasharray?: string };
};

type RoadmapData = {
  nodes: NodeData[];
  edges: EdgeData[];
};

export type Node = any;
export type Edge = any;
export type XYPosition = { x: number; y: number };

// ── Helpers ─────────────────────────────────────────────────────────────────

const NODE_DEFAULTS: Record<string, { w: number; h: number }> = {
  topic: { w: 250, h: 48 },
  subtopic: { w: 250, h: 40 },
  title: { w: 0, h: 0 },
  paragraph: { w: 400, h: 200 },
  label: { w: 400, h: 32 },
  todo: { w: 350, h: 36 },
  'todo-checkbox': { w: 350, h: 36 },
  'checklist-item': { w: 350, h: 30 },
  checklist: { w: 350, h: 120 },
  button: { w: 180, h: 40 },
  'link-item': { w: 200, h: 36 },
  resourceButton: { w: 200, h: 52 },
  vertical: { w: 2, h: 0 },
  horizontal: { w: 0, h: 2 },
};

function getNodeDims(node: NodeData): { w: number; h: number } {
  const def = NODE_DEFAULTS[node.type] || { w: 200, h: 36 };
  return {
    w: node.measured?.width || node.style?.width || node.width || def.w,
    h: node.measured?.height || node.style?.height || node.height || def.h,
  };
}

function rgbToHex(color: string): string {
  if (!color || color.startsWith('#')) return color || '#000000';
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return color;
  return '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function fontSize(node: NodeData): number {
  const s = node.data?.style?.fontSize;
  if (s) return Number(s);
  if (node.type === 'title') return 28;
  return 15;
}

// ── Node Renderers ───────────────────────────────────────────────────────────

function renderTopicNode(node: NodeData, dims: { w: number; h: number }): string {
  const label = escapeXml(node.data.label || '');
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const fs = fontSize(node);
  const bgColor = node.data.backgroundColor || node.data.borderColor || '#ffffff';
  const strokeColor = node.data.borderColor || node.data.color || '#2b78e4';
  return `<rect x="${rx}" y="${ry}" width="${dims.w}" height="${dims.h}" rx="5" ry="5" fill="${bgColor}" stroke="${strokeColor}" stroke-width="1.5"/>
    <text x="${rx + dims.w / 2}" y="${ry + dims.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${node.data.color || '#000000'}" font-family="Arial, sans-serif">${label}</text>`;
}

function renderSubtopicNode(node: NodeData, dims: { w: number; h: number }): string {
  return renderTopicNode(node, dims);
}

function renderTitleNode(node: NodeData, dims: { w: number; h: number }): string {
  const label = escapeXml(node.data.label || '');
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const fs = fontSize(node);
  return `<text x="${rx}" y="${ry + dims.h / 2}" text-anchor="start" dominant-baseline="central" font-size="${fs}" font-weight="bold" fill="${node.data.color || '#000000'}" font-family="Arial, sans-serif">${label}</text>`;
}

function renderParagraphNode(node: NodeData, dims: { w: number; h: number }): string {
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const bg = node.data.backgroundColor || 'transparent';
  const stroke = node.data.borderColor || '#000000';
  return `<rect x="${rx}" y="${ry}" width="${dims.w}" height="${dims.h}" rx="8" ry="8" fill="${bg}" stroke="${stroke}" stroke-width="1" stroke-dasharray="5,5"/>`;
}

function renderLabelNode(node: NodeData, dims: { w: number; h: number }): string {
  const label = escapeXml(node.data.label || '');
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const color = node.data.color || '#0400ff';
  const fs = fontSize(node);
  return `<text x="${rx}" y="${ry + dims.h / 2}" text-anchor="start" dominant-baseline="central" font-size="${fs}" fill="${color}" font-family="Arial, sans-serif">${label}</text>`;
}

function renderButtonNode(node: NodeData, dims: { w: number; h: number }): string {
  const label = escapeXml(node.data.label || '');
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const bg = node.data.backgroundColor || '#4136D6';
  const color = node.data.color || '#ffffff';
  const fs = fontSize(node);
  return `<rect x="${rx}" y="${ry}" width="${dims.w}" height="${dims.h}" rx="6" ry="6" fill="${bg}" stroke="${bg}" stroke-width="1"/>
    <text x="${rx + dims.w / 2}" y="${ry + dims.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${color}" font-family="Arial, sans-serif">${label}</text>`;
}

function renderResourceButtonNode(node: NodeData, dims: { w: number; h: number }): string {
  const label = escapeXml(node.data.label || '');
  const badge = escapeXml(node.data.badge || '');
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const bg = node.data.backgroundColor || '#FFE599';
  const badgeColor = node.data.badgeColor || '#9900FF';
  const fs = fontSize(node);
  const badgeW = badge ? badge.length * 10 + 12 : 0;
  return `<rect x="${rx}" y="${ry}" width="${dims.w}" height="${dims.h}" rx="6" ry="6" fill="${bg}" stroke="${bg}" stroke-width="1"/>
    ${badge ? `<rect x="${rx}" y="${ry}" width="${badgeW}" height="${dims.h}" rx="6" ry="6" fill="${badgeColor}"/>
    <text x="${rx + badgeW / 2}" y="${ry + dims.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#ffffff" font-family="Arial, sans-serif">${badge}</text>` : ''}
    <text x="${rx + badgeW + (dims.w - badgeW) / 2}" y="${ry + dims.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${node.data.color || '#000000'}" font-family="Arial, sans-serif">${label}</text>`;
}

function renderTodoNode(node: NodeData, dims: { w: number; h: number }): string {
  const label = escapeXml(node.data.label || '');
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const fs = fontSize(node);
  const checkSize = 14;
  const cx = rx + checkSize;
  const cy = ry + dims.h / 2;
  return `<rect x="${cx - checkSize / 2}" y="${cy - checkSize / 2}" width="${checkSize}" height="${checkSize}" rx="2" ry="2" fill="#ffffff" stroke="#999999" stroke-width="1"/>
    <text x="${cx + checkSize}" y="${cy}" text-anchor="start" dominant-baseline="central" font-size="${fs}" fill="#000000" font-family="Arial, sans-serif">${label}</text>`;
}

function renderChecklistNode(node: NodeData, dims: { w: number; h: number }): string {
  const items = node.data.checklists || [];
  const rx = Math.round(node.position.x);
  const ry = Math.round(node.position.y);
  const itemH = 28;
  const totalH = items.length * itemH + 16;
  let html = `<rect x="${rx}" y="${ry}" width="${dims.w}" height="${totalH}" rx="6" ry="6" fill="#f8f9fa" stroke="#dee2e6" stroke-width="1"/>`;
  items.forEach((item, i) => {
    const label = escapeXml(item.label);
    const iy = ry + 10 + i * itemH;
    html += `<rect x="${rx + 8}" y="${iy + (itemH - 14) / 2}" width="14" height="14" rx="2" ry="2" fill="#ffffff" stroke="#999999" stroke-width="1" data-checklist-id="${escapeXml(item.id)}"/>
      <text x="${rx + 28}" y="${iy + itemH / 2}" text-anchor="start" dominant-baseline="central" font-size="13" fill="#000000" font-family="Arial, sans-serif" data-checklist-label="${label}">${label}</text>`;
  });
  return html;
}

function renderLineNode(node: NodeData, dims: { w: number; h: number }, isVertical: boolean): string {
  const x1 = Math.round(node.position.x);
  const y1 = Math.round(node.position.y);
  const x2 = isVertical ? x1 : x1 + (dims.w || 100);
  const y2 = isVertical ? y1 + (dims.h || 100) : y1;
  const stroke = node.data?.style?.stroke || node.style?.stroke || '#2b78e4';
  const strokeWidth = node.data?.style?.strokeWidth || node.style?.strokeWidth || 2;
  const dash = node.data?.style?.strokeDasharray || node.style?.strokeDasharray || '0';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dash === '0' ? 'none' : dash}" stroke-linecap="round"/>`;
}

// ── Edge Renderer ────────────────────────────────────────────────────────────

function renderEdgePath(edge: EdgeData, nodeMap: Map<string, NodeData>): string {
  const sourceNode = edge.source ? nodeMap.get(edge.source) : undefined;
  const targetNode = edge.target ? nodeMap.get(edge.target) : undefined;
  if (!sourceNode || !targetNode) return '';

  const sd = getNodeDims(sourceNode);
  const td = getNodeDims(targetNode);
  const sx = sourceNode.position.x + sd.w / 2;
  const sy = sourceNode.position.y + sd.h / 2;
  const tx = targetNode.position.x + td.w / 2;
  const ty = targetNode.position.y + td.h / 2;

  const dx = Math.abs(tx - sx) * 0.5;
  const stroke = edge.style?.stroke || '#2b78e4';
  const strokeWidth = edge.style?.strokeWidth || 2;
  const dashArray = edge.data?.edgeStyle === 'dashed' || edge.style?.strokeDasharray === '0.8 8'
    ? '6,4' : 'none';

  return `<path d="M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" stroke-linecap="round"/>`;
}

// ── XML Escape ──────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Main: renderFlowJSON ────────────────────────────────────────────────────

export async function renderFlowJSON(
  data: RoadmapData | { nodes: NodeData[]; edges: EdgeData[] },
): Promise<SVGElement | null> {
  const nodes: NodeData[] = Array.isArray(data?.nodes) ? data.nodes : [];
  const edges: EdgeData[] = Array.isArray(data?.edges) ? data.edges : [];
  if (nodes.length === 0) return null;

  // Build node map for edge lookups
  const nodeMap = new Map<string, NodeData>();
  nodes.forEach((n) => n.id && nodeMap.set(n.id, n));

  // Calculate viewBox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((node) => {
    const d = getNodeDims(node);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + d.w);
    maxY = Math.max(maxY, node.position.y + d.h);
  });

  const pad = 40;
  const vbX = minX === Infinity ? 0 : minX - pad;
  const vbY = minY === Infinity ? 0 : minY - pad;
  const vbW = maxX === -Infinity ? 800 : maxX - minX + pad * 2;
  const vbH = maxY === -Infinity ? 600 : maxY - minY + pad * 2;

  // Build SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
  svg.setAttribute('width', String(vbW));
  svg.setAttribute('height', String(vbH));
  svg.style.overflow = 'visible';

  // Sort nodes by zIndex
  const sorted = [...nodes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  let innerHTML = '<g class="roadmap-svg-content">';

  // Draw edges first (behind nodes)
  edges.forEach((edge) => {
    innerHTML += renderEdgePath(edge, nodeMap);
  });

  // Draw nodes
  sorted.forEach((node) => {
    const dims = getNodeDims(node);
    const label = escapeXml(node.data?.label || '');
    const href = node.data?.href ? ` data-link="${escapeXml(node.data.href)}"` : '';
    const cls = ['clickable-group'];
    if (node.type === 'topic' || node.type === 'subtopic') cls.push('topic-group');

    innerHTML += `<g class="${cls.join(' ')}" data-node-id="${escapeXml(node.id)}" data-type="${escapeXml(node.type)}" data-title="${label}"${href}>`;

    switch (node.type) {
      case 'title':
        innerHTML += renderTitleNode(node, dims);
        break;
      case 'topic':
        innerHTML += renderTopicNode(node, dims);
        break;
      case 'subtopic':
        innerHTML += renderSubtopicNode(node, dims);
        break;
      case 'paragraph':
        innerHTML += renderParagraphNode(node, dims);
        break;
      case 'label':
        innerHTML += renderLabelNode(node, dims);
        break;
      case 'button':
      case 'link-item':
        innerHTML += renderButtonNode(node, dims);
        break;
      case 'resourceButton':
        innerHTML += renderResourceButtonNode(node, dims);
        break;
      case 'todo':
      case 'todo-checkbox':
        innerHTML += renderTodoNode(node, dims);
        break;
      case 'checklist':
        innerHTML += renderChecklistNode(node, dims);
        break;
      case 'checklist-item':
        innerHTML += renderTodoNode(node, dims);
        break;
      case 'vertical':
        innerHTML += renderLineNode(node, dims, true);
        break;
      case 'horizontal':
        innerHTML += renderLineNode(node, dims, false);
        break;
      default:
        break;
    }

    innerHTML += '</g>';
  });

  innerHTML += '</g>';
  svg.innerHTML = innerHTML;
  return svg;
}

// ── React Components ────────────────────────────────────────────────────────

type SvgRendererProps = {
  roadmap: RoadmapData;
  onRendered?: (ref: React.RefObject<HTMLDivElement | null>) => void;
  className?: string;
};

function SvgRenderer(
  props: SvgRendererProps,
  ref: React.ForwardedRef<HTMLDivElement | null>,
) {
  const { roadmap, onRendered, className } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

  const render = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';
    const svg = await renderFlowJSON(roadmap);
    if (svg) {
      el.appendChild(svg);
      el.setAttribute('data-renderer', 'editor');
    }
    onRendered?.({ current: containerRef.current });
  }, [roadmap]);

  useEffect(() => {
    render();
  }, [render]);

  return <div ref={containerRef} className={className} />;
}

export const Renderer = forwardRef(SvgRenderer);
export const ReadonlyEditor = memo(SvgRenderer);

// ── AI Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse markdown text into a basic node/edge structure.
 * Expects lines like "- [ ] Topic Name" or "- [x] Completed Topic".
 */
export function generateRoadmapFromText(
  markdown: string | any[],
): { nodes: NodeData[]; edges: EdgeData[] } {
  if (Array.isArray(markdown)) {
    // Already structured — pass through
    return {
      nodes: markdown as unknown as NodeData[],
      edges: [],
    };
  }

  const lines = markdown.split('\n').filter((l) => l.trim());
  const nodes: NodeData[] = [];
  const edges: EdgeData[] = [];
  let y = 0;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isCheckbox = trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]');
    const label = trimmed.replace(/^-\s*\[.\]\s*/, '').replace(/^#+\s*/, '');
    if (!label) return;

    nodes.push({
      id: `node-${i}`,
      type: isCheckbox ? 'todo-checkbox' : 'topic',
      position: { x: 50, y },
      data: { label, style: {} },
      width: 300,
      height: 36,
    });

    if (i > 0) {
      edges.push({
        id: `edge-${i}`,
        source: `node-${i - 1}`,
        target: `node-${i}`,
        sourceHandle: 'bottom',
        targetHandle: 'top',
      });
    }

    y += 50;
  });

  return { nodes, edges };
}

export function generateAIRoadmapFromText(
  markdown: string | any[],
): { nodes: NodeData[]; edges: EdgeData[] } {
  return generateRoadmapFromText(markdown);
}
```

- [ ] **Step 2: Update `src/lib/editor-shim.css`**

The dummy-editor CSS is no longer needed since we render our own SVG.

```css
/* SVG rendered by editor-shim uses inline styles and existing FrameRenderer.css */
```

- [ ] **Step 3: Run local build to verify**

```
pnpm build
```

Expected: Build succeeds without errors related to `@roadmapsh/editor` or `editor-shim`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/editor-shim.ts src/lib/editor-shim.css
git commit -m "feat: replace dummy editor shim with real SVG renderer

Renderer now produces SVG directly from {nodes, edges} data instead of
showing 'Private Component' placeholder. Supports all 14 node types
with proper data attributes for click interaction and progress tracking.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Verify and Push

**Files:** None

- [ ] **Step 1: Run local dev server and spot-check**

```
pnpm dev
```
Open http://127.0.0.1:4321/backend — verify the roadmap renders as SVG instead of "Private Component".

- [ ] **Step 2: Push to GitHub**

```bash
git push origin master
```

- [ ] **Step 3: Verify Vercel deploy**

After Vercel auto-deploys, open the Backend roadmap page and confirm it renders.

---

### Self-Review Checklist

1. **Spec coverage:** All 14 node types handled in the switch statement. All 3 exports (Renderer, ReadonlyEditor, renderFlowJSON) implemented. Plus generateAIRoadmapFromText and generateRoadmapFromText.
2. **Placeholder scan:** No TBD, TODO, or vague instructions.
3. **Type consistency:** `RoadmapData` used consistently across renderFlowJSON and React components. `Node` and `Edge` types exported as `any` to match existing usage.
