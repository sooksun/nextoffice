import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // LINE LIFF SDK loads extension scripts from static.line-scdn.net
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com https://static.line-scdn.net https://*.line-scdn.net",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      // LINE LIFF may embed pages from line.me domain
      "frame-src 'self' https://accounts.google.com https://*.line.me https://*.line-scdn.net",
      "frame-ancestors 'self'",
    ].join("; "),
  },
  {
    // "same-origin-allow-popups" still severs window.opener for the cross-origin
    // Google Sign-In popup, so @react-oauth/google's popup ux_mode can't
    // postMessage the credential back ("COOP would block the window.postMessage
    // call") and login fails. "unsafe-none" restores the OAuth popup callback.
    // XS-Leak exposure is minimal here; the other headers (CSP, XFO, HSTS) stay.
    key: "Cross-Origin-Opener-Policy",
    value: "unsafe-none",
  },
  {
    key: "X-Powered-By",
    value: "",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders.filter((h) => h.value !== ""),
    },
  ],
};

export default nextConfig;
