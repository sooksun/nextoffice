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

/**
 * Inline script: applies `.dark` class + `data-color-scheme` attribute to
 * <html> before React hydrates, to prevent a flash of the wrong theme.
 * Keep in sync with `useDarkMode` and `useColorScheme`.
 */
const THEME_INIT = `
(function(){try{var r=document.documentElement;
var m=localStorage.getItem('theme.mode');
var dark=m==='dark'||(m!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(dark){r.classList.add('dark');r.style.colorScheme='dark';}else{r.style.colorScheme='light';}
var c=localStorage.getItem('theme.colorScheme');
if(c&&c!=='purple'&&['blue','emerald','rose','amber'].indexOf(c)>=0){r.setAttribute('data-color-scheme',c);}
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="h-full bg-surface text-on-surface antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <ToastProvider />
        </AuthProvider>
      </body>
    </html>
  );
}
