"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ChatPanel from "@/components/ChatPanel";
import ImpersonateBanner from "@/components/ImpersonateBanner";
import { useSideMenu } from "@/hooks/useSideMenu";

const SHELL_EXCLUDED = ["/login", "/liff"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showShell = !SHELL_EXCLUDED.some((p) => pathname.startsWith(p));

  const {
    compactMenu,
    compactMenuOnHover,
    mobileMenuOpen,
    scrolled,
    toggleCompactMenu,
    onMouseEnterSideMenu,
    onMouseLeaveSideMenu,
    openMobileMenu,
    closeMobileMenu,
    onScrollContent,
  } = useSideMenu();

  if (!showShell) {
    return <>{children}</>;
  }

  const contentMargin =
    compactMenu && !compactMenuOnHover ? "xl:ml-[80px]" : "xl:ml-[275px]";

  return (
    <div className="min-h-screen w-full relative">
      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={closeMobileMenu}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm xl:hidden"
          aria-hidden
        />
      )}

      <Sidebar
        compactMenu={compactMenu}
        compactMenuOnHover={compactMenuOnHover}
        mobileMenuOpen={mobileMenuOpen}
        onMouseEnter={onMouseEnterSideMenu}
        onMouseLeave={onMouseLeaveSideMenu}
        onToggleCompact={toggleCompactMenu}
        onCloseMobile={closeMobileMenu}
      />

      {/* Content column: ImpersonateBanner (static) + scroll area | ChatPanel */}
      <div
        className={clsx(
          "relative flex flex-col h-screen transition-[margin] duration-200",
          contentMargin,
        )}
      >
        <ImpersonateBanner />

        {/* Flex row: [scroll area] [chat panel] */}
        <div className="flex flex-1 min-h-0">
          <div
            onScroll={onScrollContent}
            className="content__scroll-area flex-1 min-w-0 overflow-y-auto custom-scrollbar"
          >
            <div className="px-4 sm:px-6 lg:px-7 pt-4 pb-6">
              <Header scrolled={scrolled} onOpenMobileMenu={openMobileMenu} />

              <main className="rubick-content mt-4 p-4 sm:p-6">{children}</main>
            </div>
          </div>

          <Suspense>
            <ChatPanel />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
