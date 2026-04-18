"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toastSuccess, toastError, confirmToast } from "@/lib/toast";
import {
  ChevronDown, ChevronRight, Save, RotateCcw, Check, Loader2,
  Thermometer, Hash, Info, Settings2,
} from "lucide-react";

interface SystemPrompt {
  id: number;
  promptKey: string;
  groupName: string;
  label: string;
  description: string | null;
  promptText: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

interface EditState {
  promptText: string;
  temperature: number;
  maxTokens: number;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  resetting: boolean;
}

// ตัวแปรที่รองรับใน template
const TEMPLATE_VARS: Record<string, string[]> = {
  "ocr.pdf": [],
  "ocr.image": [],
  "classify.llm": ["{{extracted_text}}"],
  "extract.metadata": ["{{extracted_text}}"],
  "reasoning.options": ["{{query}}", "{{horizon_context}}", "{{policy_context}}"],
  "chat.system": ["{{rag_context}}"],
  "action.summarize": ["{{doc_section}}", "{{rag_section}}"],
  "action.translate": ["{{doc_section}}", "{{rag_section}}"],
  "action.extract_key": ["{{doc_section}}", "{{rag_section}}"],
  "action.draft_reply": ["{{subject}}", "{{doc_section}}", "{{rag_section}}"],
  "action.create_memo": ["{{subject}}", "{{doc_section}}", "{{rag_section}}"],
  "action.assign_task": ["{{doc_section}}", "{{rag_section}}"],
  "action.freeform": ["{{user_text}}", "{{doc_section}}", "{{rag_section}}"],
};

export default function PromptsSettingsPage() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const fetchPrompts = useCallback(async () => {
    try {
      const data = await apiFetch<SystemPrompt[]>("/system-prompts");
      setPrompts(data);
      // init edit state
      const initEdits: Record<string, EditState> = {};
      for (const p of data) {
        initEdits[p.promptKey] = {
          promptText: p.promptText,
          temperature: p.temperature,
          maxTokens: p.maxTokens,
          dirty: false,
          saving: false,
          saved: false,
          resetting: false,
        };
      }
      setEdits(initEdits);
      // expand all groups by default
      const groups = [...new Set(data.map((p) => p.groupName))];
      const exp: Record<string, boolean> = {};
      groups.forEach((g) => (exp[g] = true));
      setExpandedGroups(exp);
    } catch (err: unknown) {
      toastError((err as Error).message || "โหลด prompts ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const setEdit = (key: string, patch: Partial<EditState>) => {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSave = async (promptKey: string) => {
    const e = edits[promptKey];
    if (!e || !e.dirty) return;
    setEdit(promptKey, { saving: true });
    try {
      await apiFetch(`/system-prompts/${encodeURIComponent(promptKey)}`, {
        method: "PATCH",
        body: JSON.stringify({
          promptText: e.promptText,
          temperature: e.temperature,
          maxTokens: e.maxTokens,
        }),
      });
      setEdit(promptKey, { saving: false, dirty: false, saved: true });
      toastSuccess("บันทึกสำเร็จ");
      setTimeout(() => setEdit(promptKey, { saved: false }), 2500);
    } catch (err: unknown) {
      setEdit(promptKey, { saving: false });
      toastError((err as Error).message || "บันทึกไม่สำเร็จ");
    }
  };

  const handleReset = async (promptKey: string) => {
    if (!(await confirmToast("รีเซ็ต prompt นี้กลับเป็นค่าเริ่มต้นหรือไม่?"))) return;
    setEdit(promptKey, { resetting: true });
    try {
      const updated = await apiFetch<SystemPrompt>(`/system-prompts/${encodeURIComponent(promptKey)}/reset`, { method: "POST" });
      setEdit(promptKey, {
        promptText: updated.promptText,
        temperature: updated.temperature,
        maxTokens: updated.maxTokens,
        dirty: false,
        resetting: false,
        saved: true,
      });
      toastSuccess("รีเซ็ตสำเร็จ");
      setTimeout(() => setEdit(promptKey, { saved: false }), 2500);
    } catch (err: unknown) {
      setEdit(promptKey, { resetting: false });
      toastError((err as Error).message || "รีเซ็ตไม่สำเร็จ");
    }
  };

  // จัดกลุ่ม
  const grouped: Record<string, SystemPrompt[]> = {};
  for (const p of prompts) {
    if (!grouped[p.groupName]) grouped[p.groupName] = [];
    grouped[p.groupName].push(p);
  }

  const groupOrder = ["OCR", "จำแนกประเภทเอกสาร", "สกัดข้อมูล", "วิเคราะห์ทางเลือก", "แชทบอท", "LINE Action"];

  const sortedGroups = [
    ...groupOrder.filter((g) => grouped[g]),
    ...Object.keys(grouped).filter((g) => !groupOrder.includes(g)),
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-on-surface-variant">
        <Loader2 className="animate-spin mr-2" size={20} />
        กำลังโหลด...
      </div>
    );
  }

  const totalDirty = Object.values(edits).filter((e) => e.dirty).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <Settings2 size={22} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">ตั้งค่า System Prompts</h1>
            <p className="text-sm text-on-surface-variant">กำหนดคำสั่ง AI สำหรับแต่ละขั้นตอนการทำงาน</p>
          </div>
        </div>
        {totalDirty > 0 && (
          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1 rounded-full font-medium">
            มีการแก้ไขที่ยังไม่บันทึก {totalDirty} รายการ
          </span>
        )}
      </div>

      {/* Groups */}
      <div className="space-y-4">
        {sortedGroups.map((groupName) => {
          const items = grouped[groupName] || [];
          const isOpen = expandedGroups[groupName] !== false;
          const dirtyInGroup = items.filter((p) => edits[p.promptKey]?.dirty).length;

          return (
            <div key={groupName} className="bg-surface-bright rounded-2xl shadow-sm border border-outline-variant/40 overflow-hidden">
              {/* Group Header */}
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-low transition-colors"
                onClick={() => setExpandedGroups((prev) => ({ ...prev, [groupName]: !isOpen }))}
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={18} className="text-on-surface-variant/70" /> : <ChevronRight size={18} className="text-on-surface-variant/70" />}
                  <span className="font-semibold text-gray-800">{groupName}</span>
                  <span className="text-xs bg-surface-mid text-on-surface-variant px-2 py-0.5 rounded-full">{items.length} prompts</span>
                  {dirtyInGroup > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">{dirtyInGroup} ที่ยังไม่บันทึก</span>
                  )}
                </div>
              </button>

              {/* Prompt Items */}
              {isOpen && (
                <div className="divide-y divide-gray-50">
                  {items.map((prompt) => {
                    const e = edits[prompt.promptKey];
                    if (!e) return null;
                    const templateVars = TEMPLATE_VARS[prompt.promptKey] || [];

                    return (
                      <div key={prompt.promptKey} className="px-5 py-5">
                        {/* Prompt Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-800 text-sm">{prompt.label}</h3>
                              <code className="text-xs bg-surface-mid text-on-surface-variant px-1.5 py-0.5 rounded font-mono">{prompt.promptKey}</code>
                              {e.dirty && <span className="text-xs text-amber-600 font-medium">• ยังไม่บันทึก</span>}
                            </div>
                            {prompt.description && (
                              <p className="text-xs text-on-surface-variant mt-1 flex items-start gap-1">
                                <Info size={11} className="shrink-0 mt-0.5 text-on-surface-variant/70" />
                                {prompt.description}
                              </p>
                            )}
                            {templateVars.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-1.5">
                                {templateVars.map((v) => (
                                  <span key={v} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{v}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Prompt Textarea */}
                        <textarea
                          className="w-full text-sm font-mono bg-surface-low border border-outline-variant/60 rounded-xl px-3 py-2.5 resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-colors"
                          value={e.promptText}
                          onChange={(ev) => setEdit(prompt.promptKey, { promptText: ev.target.value, dirty: true, saved: false })}
                          rows={6}
                          spellCheck={false}
                        />

                        {/* Parameters + Actions */}
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          {/* Temperature */}
                          <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                            <Thermometer size={13} className="text-orange-400" />
                            Temperature
                            <input
                              type="number"
                              className="w-16 text-center border border-outline-variant/60 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              min={0} max={1} step={0.05}
                              value={e.temperature}
                              onChange={(ev) => setEdit(prompt.promptKey, { temperature: parseFloat(ev.target.value) || 0, dirty: true, saved: false })}
                            />
                          </label>

                          {/* Max Tokens */}
                          <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                            <Hash size={13} className="text-purple-400" />
                            Max Tokens
                            <input
                              type="number"
                              className="w-20 text-center border border-outline-variant/60 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              min={64} max={8192} step={64}
                              value={e.maxTokens}
                              onChange={(ev) => setEdit(prompt.promptKey, { maxTokens: parseInt(ev.target.value) || 1024, dirty: true, saved: false })}
                            />
                          </label>

                          {/* Updated info */}
                          {prompt.updatedBy && (
                            <span className="text-xs text-on-surface-variant/70 ml-auto hidden sm:block">
                              แก้ไขล่าสุดโดย {prompt.updatedBy}
                            </span>
                          )}

                          {/* Buttons */}
                          <div className="flex gap-2 ml-auto">
                            <button
                              onClick={() => handleReset(prompt.promptKey)}
                              disabled={e.resetting || e.saving}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-outline-variant/60 text-on-surface-variant rounded-lg hover:bg-surface-low disabled:opacity-50 transition-colors"
                            >
                              {e.resetting ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <RotateCcw size={12} />
                              )}
                              รีเซ็ต
                            </button>
                            <button
                              onClick={() => handleSave(prompt.promptKey)}
                              disabled={!e.dirty || e.saving}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                                e.saved
                                  ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-green-200"
                                  : e.dirty
                                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                  : "bg-surface-mid text-on-surface-variant/70 cursor-not-allowed"
                              }`}
                            >
                              {e.saving ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : e.saved ? (
                                <Check size={12} />
                              ) : (
                                <Save size={12} />
                              )}
                              {e.saved ? "บันทึกแล้ว" : "บันทึก"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
