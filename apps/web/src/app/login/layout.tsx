// Server Component — อ่าน GOOGLE_CLIENT_ID ตอน runtime (ไม่ใช่ build time)
// ต้องใช้ `force-dynamic` ไม่งั้น Next.js จะ pre-render ตอน build แล้ว bake ค่าว่างเปล่า
import GoogleAuthProvider from "./GoogleAuthProvider";

// บังคับให้ render ทุก request — Next.js จะอ่าน process.env ใหม่ทุกครั้ง
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  return <GoogleAuthProvider clientId={clientId}>{children}</GoogleAuthProvider>;
}
