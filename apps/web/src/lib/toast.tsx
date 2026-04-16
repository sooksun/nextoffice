"use client";

/**
 * toast.tsx — centralized notification & confirm utilities
 *
 * Simple notifications:
 *   toastSuccess("บันทึกแล้ว")
 *   toastError("เกิดข้อผิดพลาด")
 *   toastInfo("กำลังดำเนินการ...")
 *   toastWarning("โปรดตรวจสอบ")
 *
 * Promise-based confirm dialogs (await → boolean):
 *   if (await confirmDelete("ต้องการลบรายการนี้?")) { ... }
 *   if (await confirmSave("บันทึกการเปลี่ยนแปลง?"))  { ... }
 *   if (await confirmUpdate("อัปเดตข้อมูลนี้?"))      { ... }
 *   if (await confirmAction({ title, message, ... }))  { ... }   // custom
 */

import { toast, ToastOptions } from "react-toastify";
import {
  CheckCircle,
  XCircle,
  Info,
  AlertTriangle,
  Trash2,
  Save,
  RefreshCw,
  HelpCircle,
} from "lucide-react";

// ─── Base options ─────────────────────────────────────────────────────────────

const BASE: ToastOptions = {
  position: "top-right",
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

// ─── Simple notifications ─────────────────────────────────────────────────────

export const toastSuccess = (msg: string) =>
  toast.success(msg, { ...BASE });

export const toastError = (msg: string) =>
  toast.error(msg, { ...BASE, autoClose: 5000 });

export const toastInfo = (msg: string) =>
  toast.info(msg, { ...BASE });

export const toastWarning = (msg: string) =>
  toast.warning(msg, { ...BASE });

// ─── Confirm modal types ──────────────────────────────────────────────────────

type ConfirmVariant = "delete" | "save" | "update" | "confirm" | "info";

interface ConfirmOptions {
  title?: string;
  message: string;
  variant?: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

const VARIANT_CONFIG: Record<
  ConfirmVariant,
  {
    Icon: React.FC<{ size?: number; className?: string }>;
    iconClass: string;
    confirmClass: string;
    defaultTitle: string;
    defaultConfirm: string;
  }
> = {
  delete: {
    Icon: Trash2,
    iconClass: "text-red-500 bg-red-50",
    confirmClass: "bg-red-600 hover:bg-red-700 text-white",
    defaultTitle: "ยืนยันการลบ",
    defaultConfirm: "ลบ",
  },
  save: {
    Icon: Save,
    iconClass: "text-green-600 bg-green-50",
    confirmClass: "bg-green-600 hover:bg-green-700 text-white",
    defaultTitle: "ยืนยันการบันทึก",
    defaultConfirm: "บันทึก",
  },
  update: {
    Icon: RefreshCw,
    iconClass: "text-blue-600 bg-blue-50",
    confirmClass: "bg-blue-600 hover:bg-blue-700 text-white",
    defaultTitle: "ยืนยันการอัปเดต",
    defaultConfirm: "อัปเดต",
  },
  confirm: {
    Icon: HelpCircle,
    iconClass: "text-amber-500 bg-amber-50",
    confirmClass: "bg-amber-500 hover:bg-amber-600 text-white",
    defaultTitle: "ยืนยัน",
    defaultConfirm: "ยืนยัน",
  },
  info: {
    Icon: Info,
    iconClass: "text-sky-600 bg-sky-50",
    confirmClass: "bg-sky-600 hover:bg-sky-700 text-white",
    defaultTitle: "ข้อมูล",
    defaultConfirm: "รับทราบ",
  },
};

// ─── Core confirm builder ─────────────────────────────────────────────────────

function buildConfirmContent(
  opts: ConfirmOptions,
  resolve: (v: boolean) => void,
  closeToast: (() => void) | undefined,
) {
  const variant = opts.variant ?? "confirm";
  const cfg = VARIANT_CONFIG[variant];
  const title = opts.title ?? cfg.defaultTitle;
  const confirmLabel = opts.confirmLabel ?? cfg.defaultConfirm;
  const cancelLabel = opts.cancelLabel ?? "ยกเลิก";
  const Icon = cfg.Icon;

  const confirm = () => { resolve(true); closeToast?.(); };
  const cancel  = () => { resolve(false); closeToast?.(); };

  // Info variant has no cancel button
  const isInfo = variant === "info";

  return (
    <div className="flex gap-3 items-start w-full">
      {/* Icon */}
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${cfg.iconClass}`}>
        <Icon size={18} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opts.message}</p>

        <div className={`flex gap-2 mt-3 ${isInfo ? "justify-end" : ""}`}>
          {!isInfo && (
            <button
              onClick={cancel}
              className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={confirm}
            className={`${isInfo ? "px-5" : "flex-1"} py-1.5 text-xs font-semibold rounded-lg transition-colors ${cfg.confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    toast(
      ({ closeToast }) => buildConfirmContent(opts, resolve, closeToast),
      {
        position: "top-center",
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        icon: false,
        className: "!p-4 !rounded-2xl !shadow-xl !min-w-[300px] !max-w-sm",
        onClose: () => resolve(false),
      },
    );
  });
}

// ─── Shorthand helpers ────────────────────────────────────────────────────────

/** ยืนยันการลบ — ปุ่มแดง */
export function confirmDelete(
  message = "ต้องการลบรายการนี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้",
  title?: string,
): Promise<boolean> {
  return confirmAction({ variant: "delete", title, message });
}

/** ยืนยันการบันทึก — ปุ่มเขียว */
export function confirmSave(
  message = "ต้องการบันทึกการเปลี่ยนแปลงหรือไม่?",
  title?: string,
): Promise<boolean> {
  return confirmAction({ variant: "save", title, message });
}

/** ยืนยันการอัปเดต — ปุ่มน้ำเงิน */
export function confirmUpdate(
  message = "ต้องการอัปเดตข้อมูลนี้หรือไม่?",
  title?: string,
): Promise<boolean> {
  return confirmAction({ variant: "update", title, message });
}

/** แจ้งข้อมูล — ปุ่มรับทราบ (ไม่มี ยกเลิก) */
export function showInfo(
  message: string,
  title?: string,
): Promise<boolean> {
  return confirmAction({ variant: "info", title, message });
}

// ─── Legacy alias (backward compat) ──────────────────────────────────────────
export const confirmToast = (message: string) =>
  confirmAction({ variant: "confirm", message });
