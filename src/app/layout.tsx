import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FINN · ENAM Intelligence Layer',
  description: 'Financial Investment Agent: a noise-cancelling push digest, configurable EOD triggers and primary-source research for an Indian equity portfolio.',
  applicationName: 'FINN',
  appleWebApp: { capable: true, title: 'FINN', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
