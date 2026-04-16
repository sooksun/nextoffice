import { requireRole } from "@/lib/auth-server";

/** Horizon Intelligence pages — management roles only */
export default async function HorizonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["ADMIN", "DIRECTOR", "VICE_DIRECTOR"]);
  return <>{children}</>;
}
