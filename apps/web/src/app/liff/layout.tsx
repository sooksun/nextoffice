// Server Component — อ่าน LIFF_ID ตอน runtime (เหมือน pattern GOOGLE_CLIENT_ID)
// LINE MINI App รันใน LINE client; frontend ต้องเรียก liff.init(liffId) ก่อนใช้งาน
import LiffBoot from "./LiffBoot";

export const dynamic = "force-dynamic";

export default function LiffLayout({ children }: { children: React.ReactNode }) {
  const liffId = process.env.LIFF_ID ?? "";
  return <LiffBoot liffId={liffId}>{children}</LiffBoot>;
}
