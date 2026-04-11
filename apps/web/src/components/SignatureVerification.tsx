"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from "lucide-react";

interface SignatureInfo {
  signerName: string;
  reason: string;
  signedAt: string | null;
  integrity: "valid" | "tampered" | "error";
  certificateInfo: {
    subject: string;
    validFrom: string;
    validTo: string;
    isSelfSigned: boolean;
  } | null;
}

interface VerifyResult {
  signatures: SignatureInfo[];
  message?: string;
}

interface Props {
  type: "intake" | "outbound";
  id: number;
}

export default function SignatureVerification({ type, id }: Props) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint =
      type === "intake"
        ? `/digital-signature/verify/intake/${id}`
        : `/digital-signature/verify/outbound/${id}`;

    apiFetch<VerifyResult>(endpoint)
      .then(setResult)
      .catch(() => setResult({ signatures: [] }))
      .finally(() => setLoading(false));
  }, [type, id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-on-surface-variant py-2">
        <Loader2 size={14} className="animate-spin" />
        ตรวจสอบลายเซ็นดิจิทัล...
      </div>
    );
  }

  if (!result || result.signatures.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-bright text-on-surface-variant text-xs">
        <ShieldQuestion size={16} className="text-outline shrink-0" />
        <span>ยังไม่มีลายเซ็นดิจิทัล</span>
      </div>
    );
  }

  const allValid = result.signatures.every((s) => s.integrity === "valid");
  const hasTampered = result.signatures.some((s) => s.integrity === "tampered");

  return (
    <div className={`rounded-xl border p-3 text-xs space-y-2 ${
      allValid
        ? "bg-green-50 border-green-200"
        : hasTampered
        ? "bg-red-50 border-red-200"
        : "bg-yellow-50 border-yellow-200"
    }`}>
      <div className="flex items-center gap-2 font-semibold">
        {allValid ? (
          <>
            <ShieldCheck size={16} className="text-green-600 shrink-0" />
            <span className="text-green-800">ลายเซ็นดิจิทัลถูกต้อง ({result.signatures.length} รายการ)</span>
          </>
        ) : hasTampered ? (
          <>
            <ShieldAlert size={16} className="text-red-600 shrink-0" />
            <span className="text-red-800">เอกสารถูกแก้ไขหลังลงนาม</span>
          </>
        ) : (
          <>
            <ShieldAlert size={16} className="text-yellow-600 shrink-0" />
            <span className="text-yellow-800">ไม่สามารถตรวจสอบลายเซ็นได้</span>
          </>
        )}
      </div>

      {result.signatures.map((sig, i) => (
        <div key={i} className="pl-6 border-l-2 border-current/10">
          <p className="font-medium text-on-surface">{sig.signerName}</p>
          <p className="text-on-surface-variant">{sig.reason}</p>
          {sig.certificateInfo && (
            <p className="text-on-surface-variant">
              {sig.certificateInfo.subject}
              {sig.certificateInfo.isSelfSigned ? " (Self-signed)" : ""}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
