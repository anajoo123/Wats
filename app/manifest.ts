import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Awn | عَون — Mutual Aid Circles',
    short_name: 'Awn',
    description: 'Privacy-first community mutual aid circles platform with strict RLS and offline safe retry.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F8FAFC',
    theme_color: '#0D6E5B',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
