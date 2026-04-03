import type { Metadata } from "next";
import { Be_Vietnam_Pro, Inter, Sarabun } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ChatPanel from "@/components/ChatPanel";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "700", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "NextOffice AI E-Office",
  description: "AI-powered document management for Thai schools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${beVietnamPro.variable} ${inter.variable} ${sarabun.variable} h-full`}>
      <body className="h-full flex bg-surface text-on-surface antialiased">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <div className="flex-1 flex overflow-hidden">
            <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">{children}</main>
            <ChatPanel />
          </div>
        </div>
      </body>
    </html>
  );
}
