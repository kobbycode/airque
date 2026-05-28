import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://sonicstream-radio-2026.web.app'),
  title: 'AirCue – Ghana Radio Streaming',
  description: 'Stream live radio stations from Ghana — JoyFM, Empire FM, Agoo FM and more. Free, real-time, premium quality.',
  openGraph: {
    title: 'AirCue – Ghana Radio Streaming',
    description: 'Stream live radio stations from Ghana — JoyFM, Empire FM, Agoo FM and more. Free, real-time, premium quality.',
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
    title: 'AirCue – Ghana Radio Streaming',
    description: 'Stream live radio stations from Ghana — JoyFM, Empire FM, Agoo FM and more.',
    images: ['https://sonicstream-radio-2026.web.app/logo.png'],
  },
};

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
    </>
  );
}
