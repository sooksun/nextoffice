export type ApiListResponse<T> = T[] | { data?: T[] };

export function unwrapList<T>(value: ApiListResponse<T> | null | undefined): T[] {
  return Array.isArray(value) ? value : value?.data ?? [];
}
