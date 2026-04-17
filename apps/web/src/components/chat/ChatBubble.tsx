"use client";

import { useState, useCallback } from "react";
import {
  User,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
} from "lucide-react";
import { CitationCard, Citation } from "./CitationCard";
import { renderMarkdown } from "./renderMarkdown";

export type FeedbackRating = "up" | "down";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Citation[];
  queryId?: string;
  userQuery?: string;
  feedback?: FeedbackRating;
  feedbackPending?: boolean;
}

interface Props {
  message: ChatMessage;
  onFeedback?: (id: string, rating: FeedbackRating) => void;
}

export function ChatBubble({ message, onFeedback }: Props) {
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const hasSources = (message.sources?.length ?? 0) > 0;
  const canFeedback = !isUser && !!message.queryId && !!onFeedback;
  const canCopy = !isUser && message.content.length > 0;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be blocked in insecure contexts
    }
  }, [message.content]);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`${isUser ? "max-w-[90%]" : "w-full"}`}>
        <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
          {/* Avatar */}
          <div
            className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${
              isUser ? "bg-primary" : "bg-secondary"
            }`}
          >
            {isUser ? (
              <User size={12} className="text-on-primary" />
            ) : (
              <img
                src="/Favicon.png"
                alt="AI"
                className="w-3 h-3 object-contain brightness-0 invert"
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Bubble */}
            <div
              className={`px-3 py-2 rounded-xl text-xs leading-relaxed break-words ${
                isUser
                  ? "bg-primary text-on-primary rounded-tr-sm whitespace-pre-wrap"
                  : "bg-surface-low border border-outline-variant/10 text-on-surface rounded-tl-sm"
              }`}
            >
              {isUser ? (
                message.content
              ) : (
                <div className="prose-chat">{renderMarkdown(message.content)}</div>
              )}
            </div>

            {/* Action row */}
            {(hasSources || canFeedback || canCopy) && (
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                {hasSources && (
                  <button
                    type="button"
                    onClick={() => setShowSources((v) => !v)}
                    className="flex items-center gap-1 text-[10px] text-secondary hover:text-primary transition-colors font-bold"
                  >
                    <BookOpen size={9} />
                    {showSources ? "ซ่อน" : "ดู"}อ้างอิง ({message.sources!.length})
                    {showSources ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                  </button>
                )}

                {canCopy && (
                  <button
                    type="button"
                    onClick={copy}
                    title={copied ? "คัดลอกแล้ว" : "คัดลอก"}
                    aria-label="คัดลอกคำตอบ"
                    className="flex items-center gap-1 text-[10px] text-outline hover:text-on-surface transition-colors"
                  >
                    {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                  </button>
                )}

                {canFeedback && (
                  <div className="flex items-center gap-1 ml-auto">
                    <FeedbackButton
                      rating="up"
                      selected={message.feedback === "up"}
                      disabled={message.feedbackPending}
                      onClick={() => onFeedback!(message.id, "up")}
                    />
                    <FeedbackButton
                      rating="down"
                      selected={message.feedback === "down"}
                      disabled={message.feedbackPending}
                      onClick={() => onFeedback!(message.id, "down")}
                    />
                    {message.feedback && (
                      <span className="text-[10px] text-outline ml-0.5">
                        {message.feedback === "up" ? "ขอบคุณครับ" : "จะนำไปปรับปรุง"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Citations */}
            {hasSources && showSources && (
              <div className="mt-1.5 space-y-1">
                {message.sources!.map((s, i) => (
                  <CitationCard key={i} citation={s} index={i} compact />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackButton({
  rating,
  selected,
  disabled,
  onClick,
}: {
  rating: FeedbackRating;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = rating === "up" ? ThumbsUp : ThumbsDown;
  const activeColor = rating === "up" ? "text-emerald-500" : "text-rose-500";
  const title = rating === "up" ? "คำตอบนี้ดี" : "คำตอบนี้ยังไม่ดีพอ";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1 rounded-md transition-colors disabled:opacity-50 ${
        selected
          ? `${activeColor} bg-surface-high`
          : "text-outline hover:text-on-surface hover:bg-surface-high"
      }`}
    >
      <Icon size={11} />
    </button>
  );
}
