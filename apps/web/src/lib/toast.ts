import { toast, ToastOptions } from "react-toastify";

const BASE: ToastOptions = {
  position: "top-right",
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

export const toastSuccess = (msg: string) =>
  toast.success(msg, { ...BASE });

export const toastError = (msg: string) =>
  toast.error(msg, { ...BASE, autoClose: 5000 });

export const toastInfo = (msg: string) =>
  toast.info(msg, { ...BASE });

export const toastWarning = (msg: string) =>
  toast.warning(msg, { ...BASE });

/**
 * Promise-based confirm dialog using toast.
 * Usage: if (!(await confirmToast("ยืนยัน?"))) return;
 */
export function confirmToast(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    toast.warning(
      ({ closeToast }) => (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-800">{message}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { resolve(true); closeToast?.(); }}
              className="flex-1 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
            >
              ยืนยัน
            </button>
            <button
              onClick={() => { resolve(false); closeToast?.(); }}
              className="flex-1 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-300 transition-colors"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ),
      {
        position: "top-center",
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        icon: false,
        className: "!p-4 !rounded-2xl",
        onClose: () => resolve(false),
      },
    );
  });
}
