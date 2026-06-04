import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
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

function fontSize(node: NodeData): number {
  const s = node.data?.style?.fontSize;
  if (s) return Number(s);
  if (node.type === 'title') return 28;
  return 15;
}

// ── XML Escape ──────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  const dashArray = edge.data?.edgeStyle === 'dashed' || edge.style?.strokeDasharray?.includes('8')
    ? '6,4' : 'none';

  return `<path d="M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" stroke-linecap="round"/>`;
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

    innerHTML += `<g class="${cls.join(' ')}" data-node-id="${escapeXml(node.id)}" data-type="${escapeXml(node.type)}" data-title="${label}"${href}>`;

    const rx = Math.round(node.position.x);
    const ry = Math.round(node.position.y);
    const fs = fontSize(node);
    const { w, h } = dims;

    switch (node.type) {
      case 'title': {
        innerHTML += `<text x="${rx}" y="${ry + h / 2}" text-anchor="start" dominant-baseline="central" font-size="${fs}" font-weight="bold" fill="${node.data.color || '#000000'}" font-family="Arial, sans-serif">${label}</text>`;
        break;
      }
      case 'topic':
      case 'subtopic': {
        const bg = node.data.backgroundColor || node.data.borderColor || '#ffffff';
        const stroke = node.data.borderColor || node.data.color || '#2b78e4';
        innerHTML += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="5" ry="5" fill="${bg}" stroke="${stroke}" stroke-width="1.5"/>
          <text x="${rx + w / 2}" y="${ry + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${node.data.color || '#000000'}" font-family="Arial, sans-serif">${label}</text>`;
        break;
      }
      case 'paragraph': {
        const bg = node.data.backgroundColor || 'transparent';
        const stk = node.data.borderColor || '#000000';
        innerHTML += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="8" ry="8" fill="${bg}" stroke="${stk}" stroke-width="1" stroke-dasharray="5,5"/>`;
        break;
      }
      case 'label': {
        const color = node.data.color || '#0400ff';
        innerHTML += `<text x="${rx}" y="${ry + h / 2}" text-anchor="start" dominant-baseline="central" font-size="${fs}" fill="${color}" font-family="Arial, sans-serif">${label}</text>`;
        break;
      }
      case 'button':
      case 'link-item': {
        const bg = node.data.backgroundColor || '#4136D6';
        const color = node.data.color || '#ffffff';
        innerHTML += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="6" ry="6" fill="${bg}" stroke="${bg}" stroke-width="1"/>
          <text x="${rx + w / 2}" y="${ry + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${color}" font-family="Arial, sans-serif">${label}</text>`;
        break;
      }
      case 'resourceButton': {
        const badge = escapeXml(node.data.badge || '');
        const bg = node.data.backgroundColor || '#FFE599';
        const badgeColor = node.data.badgeColor || '#9900FF';
        const badgeW = badge ? badge.length * 10 + 12 : 0;
        const color = node.data.color || '#000000';
        innerHTML += `<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="6" ry="6" fill="${bg}" stroke="${bg}" stroke-width="1"/>
          ${badge ? `<rect x="${rx}" y="${ry}" width="${badgeW}" height="${h}" rx="6" ry="6" fill="${badgeColor}"/>
          <text x="${rx + badgeW / 2}" y="${ry + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="#ffffff" font-family="Arial, sans-serif">${badge}</text>` : ''}
          <text x="${rx + badgeW + (w - badgeW) / 2}" y="${ry + h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="${color}" font-family="Arial, sans-serif">${label}</text>`;
        break;
      }
      case 'todo':
      case 'todo-checkbox':
      case 'checklist-item': {
        const checkSize = 14;
        const cx = rx + checkSize;
        const cy = ry + h / 2;
        innerHTML += `<rect x="${cx - checkSize / 2}" y="${cy - checkSize / 2}" width="${checkSize}" height="${checkSize}" rx="2" ry="2" fill="#ffffff" stroke="#999999" stroke-width="1"/>
          <text x="${cx + checkSize}" y="${cy}" text-anchor="start" dominant-baseline="central" font-size="${fs}" fill="#000000" font-family="Arial, sans-serif">${label}</text>`;
        break;
      }
      case 'checklist': {
        const items = node.data.checklists || [];
        const itemH = 28;
        const totalH = items.length * itemH + 16;
        innerHTML += `<rect x="${rx}" y="${ry}" width="${w}" height="${totalH}" rx="6" ry="6" fill="#f8f9fa" stroke="#dee2e6" stroke-width="1"/>`;
        items.forEach((item, i) => {
          const il = escapeXml(item.label);
          const iy = ry + 10 + i * itemH;
          innerHTML += `<rect x="${rx + 8}" y="${iy + (itemH - 14) / 2}" width="14" height="14" rx="2" ry="2" fill="#ffffff" stroke="#999999" stroke-width="1" data-checklist-id="${escapeXml(item.id)}"/>
            <text x="${rx + 28}" y="${iy + itemH / 2}" text-anchor="start" dominant-baseline="central" font-size="13" fill="#000000" font-family="Arial, sans-serif" data-checklist-label="${il}">${il}</text>`;
        });
        break;
      }
      case 'vertical':
      case 'horizontal': {
        const isVert = node.type === 'vertical';
        const x2 = isVert ? rx : rx + (w || 100);
        const y2 = isVert ? ry + (h || 100) : ry;
        const strk = node.data?.style?.stroke || node.style?.stroke || '#2b78e4';
        const sw = node.data?.style?.strokeWidth || node.style?.strokeWidth || 2;
        const dash = node.data?.style?.strokeDasharray || node.style?.strokeDasharray || '0';
        innerHTML += `<line x1="${rx}" y1="${ry}" x2="${x2}" y2="${y2}" stroke="${strk}" stroke-width="${sw}" stroke-dasharray="${dash === '0' ? 'none' : dash}" stroke-linecap="round"/>`;
        break;
      }
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

export function generateRoadmapFromText(
  markdown: string | any[],
): { nodes: NodeData[]; edges: EdgeData[] } {
  if (Array.isArray(markdown)) {
    return { nodes: markdown as unknown as NodeData[], edges: [] };
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
