import type { MetadataRoute } from 'next';

// Lets "Add to Home Screen" open FINN full-screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FINN · ENAM Intelligence Layer',
    short_name: 'FINN',
    description: 'Noise-cancelling push digest, EOD triggers and primary-source research for an Indian equity portfolio.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
