"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchical Swimlane Diagram
// Resources are grouped into layer-based boundaries (Network → Compute →
// Database → Storage → Data) arranged top-to-bottom. Dependency arrows
// flow between layers as bezier curves. Each boundary has a visible label
// column on the left and a shaded backdrop.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback, memo } from "react";
import { select } from "d3-selection";
import { zoom, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
// Re-export as d3 namespace shape for minimal code churn
const d3 = { select, zoom };
import { ChangeAction, CloudProvider, ResourceLayer, type GraphModel, type GraphNode } from "@terraform-viz/graph-schema";
import { estimateCost } from "@/lib/pricing-estimates";
import { applyUsageOverrides } from "@/lib/usage-utils";
import { useTheme } from "../layout/ThemeProvider";

// ── Layer ordering (top → bottom in diagram) ───────────────────────────────
const LAYER_ORDER: ResourceLayer[] = [
  ResourceLayer.NETWORK,
  ResourceLayer.COMPUTE,
  ResourceLayer.DATABASE,
  ResourceLayer.STORAGE,
  ResourceLayer.DATA,
  ResourceLayer.UNKNOWN,
];

const LAYER_COLOR: Record<ResourceLayer, string> = {
  [ResourceLayer.NETWORK]:  "#4f8ef7",
  [ResourceLayer.COMPUTE]:  "#7ed321",
  [ResourceLayer.DATABASE]: "#f5a623",
  [ResourceLayer.STORAGE]:  "#a78bfa",
  [ResourceLayer.DATA]:     "#1abc9c",
  [ResourceLayer.UNKNOWN]:  "#64748b",
};

const LAYER_BG: Record<ResourceLayer, string> = {
  [ResourceLayer.NETWORK]:  "rgba(79,142,247,0.06)",
  [ResourceLayer.COMPUTE]:  "rgba(126,211,33,0.06)",
  [ResourceLayer.DATABASE]: "rgba(245,166,35,0.06)",
  [ResourceLayer.STORAGE]:  "rgba(167,139,250,0.06)",
  [ResourceLayer.DATA]:     "rgba(26,188,156,0.06)",
  [ResourceLayer.UNKNOWN]:  "rgba(100,116,139,0.06)",
};

const LAYER_LABEL: Record<ResourceLayer, string> = {
  [ResourceLayer.NETWORK]:  "Network Boundary",
  [ResourceLayer.COMPUTE]:  "Compute Boundary",
  [ResourceLayer.DATABASE]: "Database Boundary",
  [ResourceLayer.STORAGE]:  "Storage Boundary",
  [ResourceLayer.DATA]:     "Data & Analytics",
  [ResourceLayer.UNKNOWN]:  "Other Resources",
};

// ── Change-action colours / symbols ─────────────────────────────────────────
const ACTION_COLOR: Partial<Record<ChangeAction, string>> = {
  [ChangeAction.CREATE]:  "#22c55e",
  [ChangeAction.UPDATE]:  "#f59e0b",
  [ChangeAction.DELETE]:  "#ef4444",
  [ChangeAction.REPLACE]: "#f97316",
};

const ACTION_SYMBOL: Partial<Record<ChangeAction, string>> = {
  [ChangeAction.CREATE]:  "+",
  [ChangeAction.UPDATE]:  "~",
  [ChangeAction.DELETE]:  "−",
  [ChangeAction.REPLACE]: "±",
};

const ACTION_LABEL: Partial<Record<ChangeAction, string>> = {
  [ChangeAction.CREATE]:  "CREATE",
  [ChangeAction.UPDATE]:  "UPDATE",
  [ChangeAction.DELETE]:  "DELETE",
  [ChangeAction.REPLACE]: "REPLACE",
};

// ── Provider logo paths & dimensions (served from /public/providers/) ───────
const PROVIDER_LOGO: Partial<Record<CloudProvider, { path: string; w: number; h: number }>> = {
  [CloudProvider.AWS]:   { path: "/providers/aws.svg",   w: 30, h: 18 },
  [CloudProvider.GCP]:   { path: "/providers/gcp.svg",   w: 22, h: 22 },
  [CloudProvider.AZURE]: { path: "/providers/azure.svg", w: 22, h: 22 },
};

// ── Edge colour constants ────────────────────────────────────────────────────
const EDGE_COLOR = {
  light: "#cbd5e1",
  dark:  "#3a4155",
  accent: "#f78166", // focus highlight
} as const;

// ── Layout constants ────────────────────────────────────────────────────────
const LABEL_COL = 140; // left column width for layer labels
const H_PAD     = 50;  // horizontal padding inside band content area
const NODE_R    = 24;  // node circle radius
const BAND_H    = 200; // height of each swimlane band (extra room for action label)
const BAND_GAP  = 18;  // vertical gap between bands
const MIN_SPACE = 96;  // minimum px between node centres

interface LayoutNode {
  graphNode: GraphNode;
  x: number;
  y: number;
}

function buildLayout(
  model: GraphModel,
  svgW: number,
): {
  bands: Array<{ layer: ResourceLayer; y: number }>;
  nodeMap: Map<string, LayoutNode>;
  totalH: number;
} {
  const activeLayers = LAYER_ORDER.filter((l) =>
    model.nodes.some((n) => n.layer === l),
  );

  const nodeMap = new Map<string, LayoutNode>();
  const bands: Array<{ layer: ResourceLayer; y: number }> = [];
  let currentY = 0;

  const bandContentW = svgW - LABEL_COL - H_PAD * 2;

  for (const layer of activeLayers) {
    const layerNodes = model.nodes.filter((n) => n.layer === layer);
    const N = layerNodes.length;
    const spacing = Math.max(MIN_SPACE, bandContentW / N);
    const totalSpan = spacing * (N - 1);
    const startX =
      N === 1
        ? LABEL_COL + H_PAD + bandContentW / 2
        : LABEL_COL + H_PAD + (bandContentW - totalSpan) / 2;

    layerNodes.forEach((gn, i) => {
      nodeMap.set(gn.id, {
        graphNode: gn,
        x: N === 1 ? startX : startX + i * spacing,
        y: currentY + BAND_H / 2,
      });
    });

    bands.push({ layer, y: currentY });
    currentY += BAND_H + BAND_GAP;
  }

  return { bands, nodeMap, totalH: currentY };
}

// ── Focus / dim helper ────────────────────────────────────────────────────────
// Called on node click. Dims all unrelated nodes and edges; highlights edges
// connected to the focused node in a vivid accent colour. Pass null to reset.
function applyFocus(
  el: SVGSVGElement,
  focusedId: string | null,
  model: GraphModel,
  isLight: boolean,
): void {
  const svg = select(el);

  if (!focusedId) {
    // Reset everything
    svg.selectAll<SVGGElement, unknown>(".graph-node").attr("opacity", null);
    svg.selectAll<SVGPathElement, unknown>(".graph-edge")
      .attr("stroke", isLight ? EDGE_COLOR.light : EDGE_COLOR.dark)
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.65);
    return;
  }

  // Build set of connected node ids
  const connected = new Set<string>([focusedId]);
  for (const edge of model.edges) {
    if (edge.source === focusedId) connected.add(edge.target);
    if (edge.target === focusedId) connected.add(edge.source);
  }

  // Dim / restore nodes
  svg.selectAll<SVGGElement, unknown>(".graph-node")
    .attr("opacity", function () {
      const id = (this as SVGGElement).getAttribute("data-node-id");
      return id && connected.has(id) ? null : "0.15";
    });

  // Highlight / dim edges
  svg.selectAll<SVGPathElement, unknown>(".graph-edge")
    .each(function () {
      const path = select<SVGPathElement, unknown>(this as SVGPathElement);
      const src = (this as SVGPathElement).getAttribute("data-edge-source") ?? "";
      const tgt = (this as SVGPathElement).getAttribute("data-edge-target") ?? "";
      const isRelated = src === focusedId || tgt === focusedId;
      if (isRelated) {
        path
          .attr("stroke", EDGE_COLOR.accent)
          .attr("stroke-width", 2.5)
          .attr("opacity", 1);
      } else {
        path
          .attr("stroke", isLight ? EDGE_COLOR.light : EDGE_COLOR.dark)
          .attr("stroke-width", 1.5)
          .attr("opacity", 0.08);
      }
    });
}

interface TwoDGraphProps {
  model: GraphModel;
  onNodeSelect: (node: GraphNode) => void;
  usageOverrides?: Record<string, Record<string, number>>;
}

function _TwoDGraph({ model, onNodeSelect, usageOverrides }: TwoDGraphProps) {
  const { theme } = useTheme();
  const svgRef = useRef<SVGSVGElement>(null);
  const stableSelect = useCallback(onNodeSelect, [onNodeSelect]);
  // Stable model ref so the ResizeObserver callback can always read current model
  const modelRef = useRef(model);
  modelRef.current = model;
  // Track currently focused node id
  const focusedNodeRef = useRef<string | null>(null);

  // Stable usage-overrides ref so draw() always reads the latest value
  const usageOverridesRef = useRef(usageOverrides);
  usageOverridesRef.current = usageOverrides;

  // Persist zoom/pan state across redraws
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform | null>(null);

  const draw = useCallback(() => {
    const el = svgRef.current;
    if (!el) return;

    const viewW = el.clientWidth || 960;
    const viewH = el.clientHeight || 700;
    const model = modelRef.current;

    // Expand the canvas width so nodes never overflow their boundary when
    // a layer has many resources (each node needs at least MIN_SPACE px).
    const maxNodesInLayer = Math.max(
      1,
      ...LAYER_ORDER.map((l) => model.nodes.filter((n) => n.layer === l).length),
    );
    const requiredW = LABEL_COL + H_PAD * 2 + maxNodesInLayer * MIN_SPACE;
    const svgW = Math.max(viewW, 960, requiredW);

    const isLight = theme === "light";

    const svg = d3.select<SVGSVGElement, unknown>(el);
    svg.selectAll("*").remove();

    // ── Defs ──────────────────────────────────────────────────────────────
    const defs = svg.append("defs");

    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -4 9 8")
      .attr("refX", 9).attr("refY", 0)
      .attr("markerWidth", 5).attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path").attr("d", "M0,-4L9,0L0,4").attr("fill", isLight ? "#94a3b8" : "#4a5568");

    const filter = defs.append("filter")
      .attr("id", "node-shadow")
      .attr("x", "-30%").attr("y", "-30%")
      .attr("width", "160%").attr("height", "160%");
    filter.append("feDropShadow")
      .attr("dx", 0).attr("dy", 2).attr("stdDeviation", 4)
      .attr("flood-color", "#000").attr("flood-opacity", isLight ? 0.15 : 0.35);

    // ── Canvas & zoom ─────────────────────────────────────────────────────
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.12, 4])
      .on("zoom", (ev) => {
        transformRef.current = ev.transform;
        g.attr("transform", ev.transform.toString());
      });
    zoomRef.current = zoom;
    svg.call(zoom);
    // Restore previous zoom/pan position if one exists (preserves state across redraws)
    if (transformRef.current) {
      svg.call(zoom.transform, transformRef.current);
    }

    // ── Layout ─────────────────────────────────────────────────────────────
    const { bands, nodeMap, totalH } = buildLayout(model, svgW);
    const initY = Math.max(16, (viewH - totalH) / 2);
    g.attr("transform", `translate(0, ${initY})`);

    // ── Swimlane boundaries ───────────────────────────────────────────────
    for (const { layer, y } of bands) {
      const color = LAYER_COLOR[layer];
      const bg    = LAYER_BG[layer];
      const count = model.nodes.filter((n) => n.layer === layer).length;

      // Content area
      g.append("rect")
        .attr("x", LABEL_COL).attr("y", y + 6)
        .attr("width", svgW - LABEL_COL - 10).attr("height", BAND_H - 12)
        .attr("rx", 12).attr("fill", bg)
        .attr("stroke", color).attr("stroke-width", 1).attr("stroke-opacity", isLight ? 0.2 : 0.3);

      // Label column background
      g.append("rect")
        .attr("x", 4).attr("y", y + 6)
        .attr("width", LABEL_COL - 12).attr("height", BAND_H - 12)
        .attr("rx", 8)
        .attr("fill", isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.015)")
        .attr("stroke", color).attr("stroke-width", 0.5).attr("stroke-opacity", isLight ? 0.15 : 0.25);

      // Accent left bar
      g.append("rect")
        .attr("x", 4).attr("y", y + 6)
        .attr("width", 3).attr("height", BAND_H - 12)
        .attr("rx", 2).attr("fill", color);

      // Layer name
      g.append("text")
        .attr("x", 14).attr("y", y + BAND_H / 2 - 7)
        .attr("font-size", 10.5).attr("font-weight", "700")
        .attr("letter-spacing", "0.4").attr("fill", color)
        .attr("font-family", "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
        .text(LAYER_LABEL[layer]);

      // Resource count
      g.append("text")
        .attr("x", 14).attr("y", y + BAND_H / 2 + 10)
        .attr("font-size", 9).attr("fill", color).attr("opacity", 0.5)
        .attr("font-family", "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
        .text(`${count} resource${count !== 1 ? "s" : ""}`);
    }

    // ── Dependency edges ──────────────────────────────────────────────────
    for (const edge of model.edges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (!src || !tgt) continue;

      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const endX  = tgt.x - Math.cos(angle) * (NODE_R + 4);
      const endY  = tgt.y - Math.sin(angle) * (NODE_R + 4);
      const stX   = src.x + Math.cos(angle) * (NODE_R + 2);
      const stY   = src.y + Math.sin(angle) * (NODE_R + 2);

      const dy = endY - stY;
      const cp = Math.max(Math.abs(dy) * 0.45, 35);

      g.append("path")
        .attr("d", `M ${stX} ${stY} C ${stX} ${stY + cp}, ${endX} ${endY - cp}, ${endX} ${endY}`)
        .attr("fill", "none")
        .attr("stroke", isLight ? EDGE_COLOR.light : EDGE_COLOR.dark).attr("stroke-width", 1.5).attr("opacity", 0.65)
        .attr("marker-end", "url(#arrowhead)")
        .attr("data-edge-source", edge.source)
        .attr("data-edge-target", edge.target)
        .attr("class", "graph-edge");
    }

    // ── Nodes ─────────────────────────────────────────────────────────────
    for (const { graphNode, x, y } of nodeMap.values()) {
      const color      = LAYER_COLOR[graphNode.layer];
      const actColor   = ACTION_COLOR[graphNode.changeAction] ?? null;
      const actSymbol  = ACTION_SYMBOL[graphNode.changeAction] ?? null;
      const actLabel   = ACTION_LABEL[graphNode.changeAction] ?? null;
      const isDel      = graphNode.changeAction === ChangeAction.DELETE;
      const borderColor = actColor ?? color;

      const nodeG = g.append("g")
        .attr("transform", `translate(${x},${y})`)
        .attr("cursor", "pointer")
        .attr("data-node-id", graphNode.id)
        .attr("class", "graph-node")
        .on("click", (event) => {
          event.stopPropagation();
          stableSelect(graphNode);
          const clickedId = graphNode.id;
          const isSame = focusedNodeRef.current === clickedId;
          focusedNodeRef.current = isSame ? null : clickedId;
          applyFocus(el, focusedNodeRef.current, modelRef.current, isLight);
        });

      // Dim deleted nodes to signal removal
      if (isDel) nodeG.attr("opacity", 0.55);

      // Drop shadow
      nodeG.append("circle")
        .attr("r", NODE_R + 2).attr("fill", isLight ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.28)").attr("cy", 3);

      // Main circle — border uses action colour when changed
      nodeG.append("circle")
        .attr("r", NODE_R)
        .attr("fill", actColor ? `${actColor}22` : `${color}1a`)
        .attr("stroke", borderColor)
        .attr("stroke-width", actColor ? 2.5 : 2)
        .attr("stroke-dasharray", isDel ? "5,2.5" : null);

      // Inner ring
      nodeG.append("circle")
        .attr("r", NODE_R - 9).attr("fill", "none")
        .attr("stroke", borderColor).attr("stroke-width", 0.5).attr("stroke-opacity", 0.3);

      // Action badge — large circle + symbol at top-right
      if (actColor && actSymbol) {
        const badgeR = 9;
        const bx = NODE_R - 1;
        const by = -(NODE_R - 1);
        nodeG.append("circle")
          .attr("r", badgeR)
          .attr("cx", bx).attr("cy", by)
          .attr("fill", actColor)
          .attr("stroke", isLight ? "#fff" : "#0d0f18").attr("stroke-width", 1.5);
        nodeG.append("text")
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("x", bx).attr("y", by)
          .attr("font-size", 10).attr("font-weight", "900")
          .attr("fill", "#ffffff").attr("pointer-events", "none")
          .attr("font-family", "monospace")
          .text(actSymbol);
      }

      // Provider logo (or fallback letter) inside circle
      const logo = PROVIDER_LOGO[graphNode.provider];
      if (logo) {
        nodeG.append("image")
          .attr("href", logo.path)
          .attr("x", -logo.w / 2)
          .attr("y", -logo.h / 2)
          .attr("width", logo.w)
          .attr("height", logo.h)
          .attr("pointer-events", "none")
          .attr("opacity", isDel ? 0.5 : 0.92);
      } else {
        nodeG.append("text")
          .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
          .attr("font-size", 8).attr("fill", actColor ?? color).attr("opacity", 0.9)
          .attr("pointer-events", "none").attr("font-family", "monospace").attr("font-weight", "700")
          .text(graphNode.provider.slice(0, 2));
      }

      // Resource name below
      const displayName = graphNode.name.length > 14
        ? graphNode.name.slice(0, 12) + "…" : graphNode.name;
      nodeG.append("text")
        .attr("text-anchor", "middle").attr("y", NODE_R + 14)
        .attr("font-size", 9.5).attr("fill", isLight ? "#334155" : "#cbd5e1").attr("pointer-events", "none")
        .attr("font-family", "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
        .attr("font-weight", "600")
        .text(displayName);

      // Resource class / type label (the "what is it")
      const typeShort = graphNode.type.replace(/^(aws_|azurerm_|google_)/, "");
      const displayType = typeShort.length > 16 ? typeShort.slice(0, 14) + "…" : typeShort;
      nodeG.append("text")
        .attr("text-anchor", "middle").attr("y", NODE_R + 26)
        .attr("font-size", 8).attr("fill", color).attr("opacity", 0.85)
        .attr("pointer-events", "none").attr("font-family", "monospace")
        .text(displayType);

      // Action label — coloured text under type (only for changed resources)
      if (actColor && actLabel) {
        nodeG.append("text")
          .attr("text-anchor", "middle").attr("y", NODE_R + 38)
          .attr("font-size", 7.5).attr("fill", actColor)
          .attr("font-weight", "700").attr("letter-spacing", "0.6")
          .attr("pointer-events", "none")
          .attr("font-family", "monospace")
          .text(actLabel);
      }

      // Estimated monthly cost
      const nodeOverrides = usageOverridesRef.current?.[graphNode.id];
      const effectiveAttrs = applyUsageOverrides(
        (graphNode.attributes ?? {}) as Record<string, unknown>,
        nodeOverrides
      );
      const effectiveNode = nodeOverrides ? { ...graphNode, attributes: effectiveAttrs } : graphNode;
      const { monthly } = estimateCost(effectiveNode);
      if (monthly !== null) {
        const costLabel = monthly === 0 ? "free" : `$${monthly.toFixed(0)}/mo`;
        nodeG.append("text")
          .attr("text-anchor", "middle").attr("y", NODE_R + (actLabel ? 50 : 40))
          .attr("font-size", 7.5)
          .attr("fill", monthly === 0 ? "#22c55e" : "#f59e0b")
          .attr("opacity", 0.85).attr("pointer-events", "none")
          .attr("font-family", "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
          .text(costLabel);
      }
    }

    // ── Background click — deselect focus ─────────────────────────────────
    svg.on("click", () => {
      focusedNodeRef.current = null;
      applyFocus(el, null, modelRef.current, isLight);
    });

    // ── Action legend ──────────────────────────────────────────────────────
    const legendItems = [
      { color: "#22c55e", symbol: "+", label: "Create" },
      { color: "#f59e0b", symbol: "~", label: "Update" },
      { color: "#f97316", symbol: "±", label: "Replace" },
      { color: "#ef4444", symbol: "−", label: "Delete" },
      { color: "#64748b", symbol: "=", label: "No-op" },
    ];
    const lgW = 110;
    const lgItemH = 22;
    const lgPad = 10;
    const lgH = legendItems.length * lgItemH + lgPad * 2;
    const lgX = Math.max(viewW - lgW - 12, LABEL_COL + 8);
    const lgY = 12;

    const legendG = svg.append("g").attr("transform", `translate(${lgX},${lgY})`);
    legendG.append("rect")
      .attr("width", lgW).attr("height", lgH)
      .attr("rx", 7)
      .attr("fill", isLight ? "rgba(255,255,255,0.92)" : "rgba(13,15,24,0.88)")
      .attr("stroke", isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.09)").attr("stroke-width", 1);

    legendItems.forEach(({ color, symbol, label }, i) => {
      const ly = lgPad + i * lgItemH + lgItemH / 2;
      legendG.append("circle")
        .attr("r", 8).attr("cx", lgPad + 8).attr("cy", ly)
        .attr("fill", color)
        .attr("stroke", isLight ? "#fff" : "#0d0f18").attr("stroke-width", 1);
      legendG.append("text")
        .attr("x", lgPad + 8).attr("y", ly)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("font-size", 9).attr("font-weight", "900")
        .attr("fill", "#fff")
        .attr("font-family", "monospace")
        .text(symbol);
      legendG.append("text")
        .attr("x", lgPad + 22).attr("y", ly)
        .attr("dominant-baseline", "middle")
        .attr("font-size", 10.5)
        .attr("fill", isLight ? "#475569" : "#94a3b8")
        .attr("font-family", "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
        .text(label);
    });

    // ── Provider legend ────────────────────────────────────────────────────
    const usedProviders = [...new Set(model.nodes.map((n) => n.provider))];
    const providerItems: Array<{ provider: CloudProvider; label: string }> = [
      { provider: CloudProvider.AWS,   label: "Amazon Web Services" },
      { provider: CloudProvider.GCP,   label: "Google Cloud" },
      { provider: CloudProvider.AZURE, label: "Microsoft Azure" },
    ].filter(({ provider }) => usedProviders.includes(provider));

    if (providerItems.length > 0) {
      const plgW    = 172;
      const plgItemH = 26;
      const plgPad  = 10;
      const plgH    = providerItems.length * plgItemH + plgPad * 2 + 14;
      const plgX    = Math.max(viewW - plgW - 12, LABEL_COL + 8);
      const plgY    = lgY + lgH + 10;

      const plgG = svg.append("g").attr("transform", `translate(${plgX},${plgY})`);
      plgG.append("rect")
        .attr("width", plgW).attr("height", plgH)
        .attr("rx", 7)
        .attr("fill", isLight ? "rgba(255,255,255,0.92)" : "rgba(13,15,24,0.88)")
        .attr("stroke", isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.09)").attr("stroke-width", 1);
      plgG.append("text")
        .attr("x", plgPad).attr("y", plgPad + 9)
        .attr("font-size", 8.5).attr("font-weight", "700")
        .attr("letter-spacing", "0.5")
        .attr("fill", isLight ? "#64748b" : "#475569")
        .attr("font-family", "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
        .text("PROVIDERS");

      providerItems.forEach(({ provider, label }, i) => {
        const logo = PROVIDER_LOGO[provider];
        const py = plgPad + 14 + i * plgItemH + plgItemH / 2;
        if (logo) {
          // scale to 24x14-ish keeping ratio
          const maxH = 16;
          const scale = maxH / Math.max(logo.h, 1);
          const rw = logo.w * scale;
          const rh = logo.h * scale;
          plgG.append("image")
            .attr("href", logo.path)
            .attr("x", plgPad + 2)
            .attr("y", py - rh / 2)
            .attr("width", rw)
            .attr("height", rh)
            .attr("opacity", 0.9);
        }
        plgG.append("text")
          .attr("x", plgPad + 30).attr("y", py)
          .attr("dominant-baseline", "middle")
          .attr("font-size", 10)
          .attr("fill", isLight ? "#475569" : "#94a3b8")
          .attr("font-family", "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif")
          .text(label);
      });
    }
  }, [stableSelect, theme]);

  // Redraw on model change
  useEffect(() => { draw(); }, [draw, model, usageOverrides]);

  // Redraw on container resize (debounced)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(draw, 120);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [draw]);

  return (
    <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
  );
}

// Wrapped in memo: GraphPage re-renders (baseline pin, history open) won't retrigger the D3 draw cycle
// when model/onNodeSelect haven't actually changed.
export const TwoDGraph = memo(_TwoDGraph);

