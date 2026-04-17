import { requireRole } from "@/lib/auth-server";

/** Admin pages — ADMIN and DIRECTOR only */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["ADMIN", "DIRECTOR"]);
  return <>{children}</>;
}
