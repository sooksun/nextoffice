import { apiFetch } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Prediction {
  id: number;
  caseId: number;
  type: string;
  value: Record<string, unknown>;
  confidence: number;
  isAccepted: boolean | null;
  createdAt: string;
}

async function getPredictions(id: string) {
  try {
    return await apiFetch<Prediction[]>(`/cases/${id}/predictions`);
  } catch {
    return [];
  }
}

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  next_step: { label: "ขั้นตอนถัดไป", icon: "📋" },
  risk: { label: "ความเสี่ยง", icon: "⚠️" },
  deadline: { label: "กำหนดส่ง", icon: "📅" },
  routing: { label: "แนะนำฝ่าย", icon: "🔀" },
  assignee: { label: "แนะนำผู้รับผิดชอบ", icon: "👤" },
};

function confidenceColor(c: number) {
  if (c >= 0.8) return "bg-green-100 text-green-800";
  if (c >= 0.6) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-red-100 text-red-800",
  };
  const labels: Record<string, string> = {
    low: "ต่ำ",
    medium: "ปานกลาง",
    high: "สูง",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[level] || "bg-gray-100 text-gray-800"}`}>
      {labels[level] || level}
    </span>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function PredictionCard({ prediction }: { prediction: Prediction }) {
  const typeInfo = TYPE_LABELS[prediction.type] || { label: prediction.type, icon: "🔮" };
  const val = prediction.value as Record<string, any>;

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeInfo.icon}</span>
          <h3 className="font-semibold text-gray-900">{typeInfo.label}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${confidenceColor(prediction.confidence)}`}>
            ความมั่นใจ {Math.round(prediction.confidence * 100)}%
          </span>
          {prediction.isAccepted === true && (
            <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">ยอมรับแล้ว</span>
          )}
          {prediction.isAccepted === false && (
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800">ปฏิเสธ</span>
          )}
        </div>
      </div>

      {prediction.type === "next_step" && (
        <div>
          <p className="text-sm text-gray-600 mb-2">{(val.description as string) || ""}</p>
          {Array.isArray(val.steps) && (
            <ol className="list-decimal list-inside text-sm space-y-1">
              {(val.steps as string[]).map((step, i) => (
                <li key={i} className="text-gray-700">{step}</li>
              ))}
            </ol>
          )}
          {val.estimatedDays && (
            <p className="text-xs text-gray-500 mt-2">ระยะเวลาโดยประมาณ: {String(val.estimatedDays)} วัน</p>
          )}
        </div>
      )}

      {prediction.type === "risk" && (
        <div>
          <div className="mb-2">
            <span className="text-sm text-gray-600 mr-2">ระดับความเสี่ยง:</span>
            <RiskBadge level={val.level as string} />
          </div>
          {Array.isArray(val.factors) && (
            <ul className="list-disc list-inside text-sm space-y-1">
              {(val.factors as string[]).map((f, i) => (
                <li key={i} className="text-gray-700">{f}</li>
              ))}
            </ul>
          )}
          {val.mitigation && (
            <p className="text-xs text-gray-500 mt-2">แนวทางลดเสี่ยง: {String(val.mitigation)}</p>
          )}
        </div>
      )}

      {prediction.type === "deadline" && (
        <div>
          <p className="text-sm text-gray-700">
            กำหนดส่งแนะนำ: <strong>{String(val.suggestedDeadline || "-")}</strong>
          </p>
          <p className="text-sm text-gray-600">{String(val.reason || "")}</p>
          {val.daysFromNow != null && (
            <p className="text-xs text-gray-500 mt-1">
              เหลืออีก {String(val.daysFromNow)} วัน
            </p>
          )}
        </div>
      )}

      {prediction.type === "routing" && (
        <div>
          <p className="text-sm text-gray-700">
            ฝ่ายที่แนะนำ: <strong>{String(val.suggestedDepartment || "-")}</strong>
          </p>
          <p className="text-sm text-gray-600">{String(val.reason || "")}</p>
        </div>
      )}
    </div>
  );
}

export default async function PredictionsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const predictions = await getPredictions(id);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/cases/${id}`} className="text-sm text-blue-600 hover:underline mb-1 block">
            &larr; กลับไปหน้ารายละเอียด
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">AI Predictions</h1>
          <p className="text-sm text-gray-500">การทำนายขั้นตอนถัดไป ความเสี่ยง และคำแนะนำ</p>
        </div>
      </div>

      {predictions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">ยังไม่มี predictions สำหรับ case นี้</p>
          <p className="text-sm mt-1">ระบบจะสร้าง predictions อัตโนมัติเมื่อวิเคราะห์หนังสือเสร็จ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {predictions.map((pred) => (
            <PredictionCard key={pred.id} prediction={pred} />
          ))}
        </div>
      )}
    </div>
  );
}
