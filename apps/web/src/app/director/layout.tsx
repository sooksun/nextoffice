import { requireRole } from "@/lib/auth-server";

/** Director pages — DIRECTOR and ADMIN only */
export default async function DirectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["ADMIN", "DIRECTOR"]);
  return <>{children}</>;
}
