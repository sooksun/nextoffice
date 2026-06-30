export function getErrorMessage(error: unknown, fallback = "เกิดข้อผิดพลาด"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
