"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
      กำลังโหลด Graph...
    </div>
  ),
});

interface GraphNode {
  id: number;
  title: string;
  noteType: string;
  status: string;
}

interface GraphEdge {
  from: number;
  to: number;
  relation: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const NOTE_TYPE_COLORS: Record<string, string> = {
  policy: "#6750A4",
  letter: "#625B71",
  project: "#7D5260",
  report: "#B07D00",
  agenda: "#1E6B3C",
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  policy: "นโยบาย",
  letter: "หนังสือ",
  project: "โครงการ",
  report: "รายงาน",
  agenda: "วาระ",
};

export default function VaultGraphPage() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    apiFetch<GraphData>("/vault/graph?organizationId=1")
      .then(setGraph)
      .catch(() => setGraph({ nodes: [], edges: [] }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const handleZoomIn = useCallback(() => {
    graphRef.current?.zoom(1.5, 400);
  }, []);

  const handleZoomOut = useCallback(() => {
    graphRef.current?.zoom(0.7, 400);
  }, []);

  const handleFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40);
  }, []);

  const graphData = graph
    ? {
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          label: n.title,
          noteType: n.noteType,
          status: n.status,
          color: NOTE_TYPE_COLORS[n.noteType] ?? "#888",
        })),
        links: graph.edges.map((e) => ({
          source: e.from,
          target: e.to,
          relation: e.relation,
        })),
      }
    : { nodes: [], links: [] };

  const noteTypes = graph
    ? [...new Set(graph.nodes.map((n) => n.noteType))]
    : [];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/vault"
            className="inline-flex items-center gap-1 text-sm text-primary font-bold hover:underline"
          >
            <ArrowLeft size={14} />
            คลังความรู้
          </Link>
          <div>
            <h1 className="text-2xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
              Knowledge Graph
            </h1>
            <p className="text-xs text-on-surface-variant">
              {graph?.nodes.length ?? 0} โหนด · {graph?.edges.length ?? 0} เส้นเชื่อม
            </p>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-xl bg-surface-lowest border border-outline-variant/20 hover:bg-surface-bright transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} className="text-on-surface-variant" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-xl bg-surface-lowest border border-outline-variant/20 hover:bg-surface-bright transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} className="text-on-surface-variant" />
          </button>
          <button
            onClick={handleFit}
            className="p-2 rounded-xl bg-surface-lowest border border-outline-variant/20 hover:bg-surface-bright transition-colors"
            title="Fit all"
          >
            <Maximize2 size={16} className="text-on-surface-variant" />
          </button>
        </div>
      </div>

      {/* Graph canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 rounded-2xl overflow-hidden bg-[#0f0f14] border border-outline-variant/10"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
            กำลังโหลด...
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-outline text-sm">ยังไม่มีบันทึกในคลังความรู้</p>
            <Link
              href="/vault"
              className="text-primary text-sm font-bold hover:underline"
            >
              กลับไปดูรายการ
            </Link>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            backgroundColor="#0f0f14"
            nodeRelSize={6}
            nodeVal={(node: any) => 1 + (graphData.links.filter(
              (l: any) => l.source === node.id || l.target === node.id ||
                (typeof l.source === "object" && l.source?.id === node.id) ||
                (typeof l.target === "object" && l.target?.id === node.id)
            ).length * 0.5)}
            nodeColor={(node: any) => node.color}
            nodeLabel=""
            linkColor={() => "rgba(255,255,255,0.12)"}
            linkWidth={1.5}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleColor={() => "rgba(255,255,255,0.4)"}
            onNodeHover={(node: any) => setHoveredNode(node ?? null)}
            onNodeClick={(node: any) => {
              window.location.href = `/vault/${node.id}`;
            }}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const isHovered = hoveredNode?.id === node.id;
              const r = 5 + (graphData.links.filter(
                (l: any) =>
                  (typeof l.source === "object" ? l.source?.id : l.source) === node.id ||
                  (typeof l.target === "object" ? l.target?.id : l.target) === node.id
              ).length * 0.8);

              // Glow for hovered
              if (isHovered) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
                ctx.fillStyle = node.color + "44";
                ctx.fill();
              }

              // Node circle
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = node.color;
              ctx.fill();

              // White border on hover
              if (isHovered) {
                ctx.strokeStyle = "rgba(255,255,255,0.8)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }

              // Label
              const label = node.label as string;
              const fontSize = Math.max(8, 10 / globalScale);
              ctx.font = `${isHovered ? "bold " : ""}${fontSize}px sans-serif`;
              ctx.fillStyle = isHovered ? "#ffffff" : "rgba(255,255,255,0.65)";
              ctx.textAlign = "center";
              ctx.fillText(
                label.length > 20 ? label.substring(0, 20) + "…" : label,
                node.x,
                node.y + r + fontSize + 2
              );
            }}
            cooldownTicks={120}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
          />
        )}

        {/* Tooltip on hover */}
        {hoveredNode && (
          <div className="absolute top-4 left-4 bg-surface-lowest/95 backdrop-blur-sm border border-outline-variant/20 rounded-xl px-4 py-3 max-w-xs pointer-events-none shadow-lg">
            <p className="font-bold text-on-surface text-sm leading-tight">{hoveredNode.title}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: NOTE_TYPE_COLORS[hoveredNode.noteType] ?? "#888" }}
              />
              <span className="text-xs text-on-surface-variant">
                {NOTE_TYPE_LABELS[hoveredNode.noteType] ?? hoveredNode.noteType}
              </span>
              <span className="text-xs text-outline">· {hoveredNode.status}</span>
            </div>
            <p className="text-[10px] text-outline mt-1">คลิกเพื่อเปิด</p>
          </div>
        )}

        {/* Legend */}
        {noteTypes.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-surface-lowest/90 backdrop-blur-sm border border-outline-variant/20 rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
            {noteTypes.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: NOTE_TYPE_COLORS[type] ?? "#888" }}
                />
                <span className="text-[11px] text-on-surface-variant">
                  {NOTE_TYPE_LABELS[type] ?? type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
