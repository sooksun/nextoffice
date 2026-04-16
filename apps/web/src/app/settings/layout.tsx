import { requireRole } from "@/lib/auth-server";

/** Settings pages — ADMIN only */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["ADMIN"]);
  return <>{children}</>;
}
