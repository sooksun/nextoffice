"use client";

import { useState } from "react";
import { BookOpen, TrendingUp, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

export type CitationType = "policy" | "horizon";

export interface Citation {
  type: CitationType;
  title: string;
  summary: string;
  score: number;          // 0–1 retrieval score
  rerankScore?: number;   // 0–10 reranker score (optional)
  documentNumber?: string;
  section?: string;
  href?: string;          // optional deep-link to source
}

interface Props {
  citation: Citation;
  index?: number;
  compact?: boolean;      // tighter spacing for sidebar panel
}

/**
 * Expandable citation card used under assistant answers.
 * Compact-mode fits the 320px ChatPanel sidebar.
 */
export function CitationCard({ citation, index, compact = true }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isPolicy = citation.type === "policy";

  const tone = isPolicy
    ? {
        Icon: BookOpen,
        label: "ระเบียบ",
        iconColor: "text-secondary",
        textColor: "text-secondary",
        stripe: "bg-secondary/60",
        bar: "bg-secondary",
      }
    : {
        Icon: TrendingUp,
        label: "แนวโน้ม",
        iconColor: "text-tertiary",
        textColor: "text-tertiary",
        stripe: "bg-tertiary/60",
        bar: "bg-tertiary",
      };

  const scorePct = Math.max(0, Math.min(100, Math.round(citation.score * 100)));
  const summaryTooLong = citation.summary.length > 140;

  return (
    <div
      className={`group relative bg-surface-low border border-outline-variant/10 rounded-xl overflow-hidden hover:border-outline-variant/30 transition-colors ${
        compact ? "text-[11px]" : "text-xs"
      }`}
    >
      {/* Left color stripe indicating source type */}
      <div className={`absolute inset-y-0 left-0 w-0.5 ${tone.stripe}`} />

      <div className={compact ? "pl-3 pr-2.5 py-2" : "pl-4 pr-3 py-2.5"}>
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-1">
          <tone.Icon size={compact ? 10 : 12} className={`${tone.iconColor} shrink-0`} />
          <span className={`font-bold uppercase tracking-wider ${tone.textColor} text-[10px]`}>
            {tone.label}
          </span>
          {typeof index === "number" && (
            <span className="text-outline font-mono text-[10px]">[{index + 1}]</span>
          )}
          {citation.documentNumber && (
            <span className="text-outline font-mono text-[10px] truncate">
              {citation.documentNumber}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Score bar */}
            <div className="w-10 h-1 bg-surface-high rounded-full overflow-hidden" title={`${scorePct}% relevance`}>
              <div
                className={`h-full ${tone.bar} transition-all`}
                style={{ width: `${scorePct}%` }}
              />
            </div>
            <span className="text-outline font-mono text-[10px] tabular-nums w-7 text-right">
              {scorePct}%
            </span>
          </div>
        </div>

        {/* Title */}
        <p className="font-semibold text-on-surface leading-snug line-clamp-2">
          {citation.title}
        </p>
        {citation.section && (
          <p className="text-outline text-[10px] mt-0.5">{citation.section}</p>
        )}

        {/* Summary — collapsed by default */}
        {citation.summary && (
          <div className="mt-1.5">
            <p
              className={`text-on-surface-variant leading-relaxed whitespace-pre-wrap ${
                expanded ? "" : "line-clamp-2"
              }`}
            >
              {citation.summary}
            </p>
            {summaryTooLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className={`mt-1 flex items-center gap-0.5 font-semibold ${tone.textColor} hover:underline`}
              >
                {expanded ? (
                  <>
                    ย่อ <ChevronUp size={10} />
                  </>
                ) : (
                  <>
                    อ่านต่อ <ChevronDown size={10} />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* External link */}
        {citation.href && (
          <a
            href={citation.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-1.5 inline-flex items-center gap-1 font-semibold ${tone.textColor} hover:underline`}
          >
            ดูต้นฉบับ <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
}
