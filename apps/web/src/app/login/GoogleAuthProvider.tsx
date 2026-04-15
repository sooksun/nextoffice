"use client";

import { createContext, useContext } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";

const GoogleCtx = createContext(false);

/** ใช้ใน login/page.tsx เพื่อตรวจว่า Google Login พร้อมใช้หรือไม่ */
export const useGoogleEnabled = () => useContext(GoogleCtx);

interface Props {
  clientId: string;
  children: React.ReactNode;
}

/**
 * Client wrapper — Server Component ใน layout.tsx ส่ง clientId มาตอน runtime
 * ไม่ต้องพึ่ง NEXT_PUBLIC_* build-time variable อีกต่อไป
 */
export default function GoogleAuthProvider({ clientId, children }: Props) {
  if (!clientId) {
    return <GoogleCtx.Provider value={false}>{children}</GoogleCtx.Provider>;
  }
  return (
    <GoogleCtx.Provider value={true}>
      <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
    </GoogleCtx.Provider>
  );
}
