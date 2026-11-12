import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'PXL — Character Collection',
    short_name: 'PXL',
    description: 'Collect little pixel characters. Connect in temporary conversations.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0e1621',
    theme_color: '#0e1621',
    orientation: 'any',
    categories: ['games', 'social'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
