import { requireRole } from "@/lib/auth-server";

/** District-level reports — ADMIN only */
export default async function DistrictReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["ADMIN"]);
  return <>{children}</>;
}
