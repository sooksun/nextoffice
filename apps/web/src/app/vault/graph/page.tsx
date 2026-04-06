import { apiFetch } from "@/lib/api";
import Link from "next/link";
import {
  GitFork,
  ArrowLeft,
  Circle,
  ArrowRight,
  Database,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface GraphNode {
  id: number;
  title: string;
  noteType: string;
}

interface GraphEdge {
  fromId: number;
  fromTitle: string;
  toId: number;
  toTitle: string;
  relation: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

async function getGraph(): Promise<GraphData | null> {
  try {
    return await apiFetch<GraphData>("/vault/graph?organizationId=1");
  } catch {
    return null;
  }
}

function NoteTypeBadge({ noteType }: { noteType: string }) {
  const colorMap: Record<string, string> = {
    policy: "bg-primary-fixed text-primary",
    letter: "bg-secondary-fixed text-secondary",
    project: "bg-tertiary-fixed text-tertiary",
    report: "bg-amber-100 text-amber-700",
    agenda: "bg-green-100 text-green-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${colorMap[noteType] ?? "bg-surface-high text-on-surface-variant"}`}
    >
      {noteType}
    </span>
  );
}

export default async function VaultGraphPage() {
  const graph = await getGraph();

  if (!graph) {
    return (
      <div className="text-center py-16">
        <Database size={48} className="text-outline/30 mx-auto mb-4" />
        <h3 className="font-bold text-on-surface-variant mb-2">ไม่สามารถโหลดข้อมูล Graph ได้</h3>
        <Link
          href="/vault"
          className="inline-flex items-center gap-2 text-primary font-bold text-sm hover:underline"
        >
          <ArrowLeft size={14} />
          กลับไปคลังความรู้
        </Link>
      </div>
    );
  }

  const groupedNodes: Record<string, GraphNode[]> = {};
  for (const node of graph.nodes) {
    if (!groupedNodes[node.noteType]) {
      groupedNodes[node.noteType] = [];
    }
    groupedNodes[node.noteType].push(node);
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/vault"
        className="inline-flex items-center gap-1 text-sm text-primary font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        คลังความรู้
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-primary font-[family-name:var(--font-be-vietnam-pro)] tracking-tight">
          Knowledge Graph
        </h1>
        <p className="text-on-surface-variant mt-1">
          แผนภาพความเชื่อมโยงระหว่างบันทึกความรู้
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-fixed rounded-2xl flex items-center justify-center">
            <Circle size={20} className="text-primary" />
          </div>
          <div>
            <p className="text-2xl font-black text-primary">{graph.nodes.length}</p>
            <p className="text-xs text-on-surface-variant font-medium">โหนดทั้งหมด</p>
          </div>
        </div>
        <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary-fixed rounded-2xl flex items-center justify-center">
            <GitFork size={20} className="text-secondary" />
          </div>
          <div>
            <p className="text-2xl font-black text-secondary">{graph.edges.length}</p>
            <p className="text-xs text-on-surface-variant font-medium">เส้นเชื่อมต่อ</p>
          </div>
        </div>
      </div>

      {/* Nodes grouped by type */}
      <div>
        <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
          <Circle size={14} />
          โหนดตามประเภท
        </h2>
        {Object.keys(groupedNodes).length === 0 ? (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-8 text-center text-outline shadow-sm">
            ยังไม่มีโหนด
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedNodes).map(([type, nodes]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <NoteTypeBadge noteType={type} />
                  <span className="text-xs text-outline">({nodes.length} รายการ)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {nodes.map((node) => (
                    <Link
                      key={node.id}
                      href={`/vault/${node.id}`}
                      className="bg-surface-lowest rounded-xl border border-outline-variant/10 px-4 py-3 hover:shadow-sm transition-shadow text-sm font-medium text-on-surface hover:text-primary"
                    >
                      {node.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edges */}
      <div>
        <h2 className="text-sm font-black text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
          <GitFork size={14} />
          เส้นเชื่อมต่อ
        </h2>
        {graph.edges.length === 0 ? (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 p-8 text-center text-outline shadow-sm">
            ยังไม่มีเส้นเชื่อมต่อ
          </div>
        ) : (
          <div className="bg-surface-lowest rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-surface-low border-b border-outline-variant/10">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">จาก</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-outline">ความสัมพันธ์</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-outline">ไปยัง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {graph.edges.map((edge, i) => (
                  <tr key={i} className="hover:bg-surface-low transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/vault/${edge.fromId}`} className="text-primary font-medium text-xs hover:underline">
                        {edge.fromTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant">
                        <ArrowRight size={12} className="text-outline" />
                        {edge.relation}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/vault/${edge.toId}`} className="text-primary font-medium text-xs hover:underline">
                        {edge.toTitle}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
