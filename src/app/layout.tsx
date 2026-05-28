import type { Metadata } from "next";
import { Geist, Hanken_Grotesk, Exo_2 } from "next/font/google";
import "./globals.css";
import CustomCursor from "@/components/CustomCursor";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
});

const exo2 = Exo_2({
  variable: "--font-exo2",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://sonicstream-radio-2026.web.app'),
  title: "AirCue - Ghana Radio Streaming",
  description: "Stream live radio stations from Ghana — JoyFM, Empire FM, Agoo FM and more. Free, real-time, premium quality.",
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png' }],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: "AirCue - Ghana Radio Streaming",
    description: "Stream live radio stations from Ghana — JoyFM, Empire FM, Agoo FM and more. Free, real-time, premium quality.",
    url: 'https://sonicstream-radio-2026.web.app/listener-directory/',
    siteName: 'AirCue',
    type: 'website',
    images: [
      {
        url: 'https://sonicstream-radio-2026.web.app/logo.png',
        width: 300,
        height: 300,
        alt: 'AirCue – Ghana Radio Streaming',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: "AirCue - Ghana Radio Streaming",
    description: "Stream live radio stations from Ghana — JoyFM, Empire FM, Agoo FM and more.",
    images: ['https://sonicstream-radio-2026.web.app/logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600&display=swap" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
      </head>
      <body
        className={`${geist.variable} ${hankenGrotesk.variable} ${exo2.variable} antialiased`}
      >
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
