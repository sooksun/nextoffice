import type { Metadata } from "next";
import { Be_Vietnam_Pro, Inter, Sarabun } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";
import ToastProvider from "@/components/ToastProvider";

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
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <ToastProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
