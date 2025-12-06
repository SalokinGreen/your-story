import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./misc/AuthContext";
import { NotificationProvider } from "./misc/NotificationContext";
import { APIKeysProvider } from "./misc/APIKeysContext";
import { SubscriptionProvider } from "./misc/SubscriptionContext";
import NotificationContainer from "./components/NotificationContainer";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import SiteHeader from "./components/SiteHeader";
import FontInitializer from "./components/FontInitializer";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Your Story",
  description: "Interactive story game powered by AI",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Your Story",
    startupImage: "/icon-512x512.png",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#9333ea",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="application-name" content="Your Story" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Your Story" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#9333ea" />
        <meta name="msapplication-tap-highlight" content="no" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="apple-touch-startup-image" href="/icon-512x512.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NotificationProvider>
          <AuthProvider>
            <SubscriptionProvider>
              <APIKeysProvider>
                <SiteHeader />
                {children}
              </APIKeysProvider>
            </SubscriptionProvider>
          </AuthProvider>
          <NotificationContainer />
          <PWAInstallPrompt />
          <FontInitializer />
        </NotificationProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
