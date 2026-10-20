import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NotificationProvider } from "./misc/NotificationContext";
import { APIKeysProvider } from "./misc/APIKeysContext";
import NotificationContainer from "./components/NotificationContainer";
import SiteHeader from "./components/SiteHeader";
import FontInitializer from "./components/FontInitializer";

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
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NotificationProvider>
          <APIKeysProvider>
            <SiteHeader />
            {children}
          </APIKeysProvider>
          <NotificationContainer />
          <FontInitializer />
        </NotificationProvider>
      </body>
    </html>
  );
}
