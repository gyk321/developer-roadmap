# Lightweight Editor Renderer — Design Spec

2026-06-04 | Status: Approved

## Context

The `@roadmapsh/editor` package (Renderer, ReadonlyEditor, renderFlowJSON) depends on a private repo (`roadmapsh/web-draw`). Without it, all editor-format roadmaps show "Private Component" placeholder. This design replaces the dummy editor with a self-contained SVG renderer.

## Architecture

Replace `src/lib/editor-shim.ts` with a real implementation that produces SVG directly from `{ nodes, edges }` data. No external dependencies beyond what already exists in the project.

```
src/lib/editor-shim.ts
├── renderFlowJSON({ nodes, edges }) → Promise<SVGElement>
│     Iterates nodes (sorted by zIndex), draws each by type.
│     Iterates edges, draws connection lines between nodes.
│     Returns the populated SVG element.
├── SvgRenderer (internal React component)
│     useEffect → calls renderFlowJSON → appends SVG to container div
│     Handles: click, contextmenu events → dispatches to existing handlers
│     Handles: data-renderer attribute, onRendered callback
├── Renderer = forwardRef(SvgRenderer)
└── ReadonlyEditor = memo(SvgRenderer)
```

## Node Rendering (14 types)

Each node type gets a `<g>` group with `data-node-id`, `data-type`, `data-title` attributes:

| Type | SVG output | Key data attributes |
|---|---|---|
| `title` | `<text>` large font | label |
| `topic` | `<rect>` rounded + `<text>` | label, oldId |
| `subtopic` | `<rect>` smaller rounded + `<text>` | label, oldId (+ optional legend) |
| `paragraph` | `<rect>` with border, optional children | label, borderColor, backgroundColor |
| `label` | `<text>` colored | label, color |
| `button` | `<rect>` + `<text>`, colored bg | label, href, backgroundColor |
| `resourceButton` | `<rect>` + badge + `<text>` | label, href, badge, badgeColor, backgroundColor |
| `todo` / `todo-checkbox` | `<rect>` checkbox + `<text>` | label |
| `checklist` | Container `<g>` with child items | checklists[] |
| `checklist-item` | `<rect>` checkbox + `<text>` per item | label, data-checklist-id |
| `vertical` | `<line>` or `<path>` | stroke, strokeWidth |
| `horizontal` | `<line>` or `<path>` | stroke, strokeWidth |

## Edge Rendering

Edges are `<path>` elements with bezier curves connecting source node to target node. Edge style (`solid`/`dashed`) determined by `data.edgeStyle` or `style.strokeDasharray`.

## Position Mapping

Node positions are in canvas coordinates from the editor. The SVG viewBox is derived from the bounding box of all nodes + padding. Each node at `(position.x, position.y)` with `width × height`.

## Interaction Support

- **Click**: target → `getNodeDetails()` → dispatch `roadmap.node.click` or `roadmap.checklist.click` CustomEvent
- **Right-click**: toggle progress state (done/pending) via existing `updateResourceProgress`
- **Button/link clicks**: `window.open(href)` for external, `window.location.href` for internal

## Progress Rendering

CSS classes `.done`, `.learning`, `.skipped`, `.pending` applied to node `<g>` groups. These map to existing CSS rules in `FrameRenderer.css`.

## Files to Modify

| File | Change |
|---|---|
| `src/lib/editor-shim.ts` | Rewrite: real SVG renderer + React components |
| `src/lib/editor-shim.css` | Remove (styles handled inline or by existing CSS) |

## Verification

1. `pnpm build` succeeds
2. Local dev: Backend roadmap renders SVG instead of "Private Component"
3. Clicking nodes triggers topic detail popup
4. Right-clicking toggles progress
5. Vercel deploy: same behavior
