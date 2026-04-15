// Server Component — อ่าน GOOGLE_CLIENT_ID ตอน runtime (ไม่ใช่ build time)
// ทำให้ Google Login ไม่หายแม้ rebuild web image โดยไม่ export env ก่อน
import GoogleAuthProvider from "./GoogleAuthProvider";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  return <GoogleAuthProvider clientId={clientId}>{children}</GoogleAuthProvider>;
}
