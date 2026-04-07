"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ChatPanel from "@/components/ChatPanel";
import ImpersonateBanner from "@/components/ImpersonateBanner";
import AdminSwitchPanel from "@/components/AdminSwitchPanel";

const SHELL_EXCLUDED = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showShell = !SHELL_EXCLUDED.some((p) => pathname.startsWith(p));

  if (!showShell) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ImpersonateBanner />
        <Header />
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {children}
          </main>
          <Suspense><ChatPanel /></Suspense>
        </div>
      </div>
      <AdminSwitchPanel />
    </>
  );
}
