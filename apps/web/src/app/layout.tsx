import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";
import ToastProvider from "@/components/ToastProvider";

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
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
    <html lang="th" className={`${sarabun.variable} h-full`}>
      <body className="h-full flex bg-surface text-on-surface antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <ToastProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
