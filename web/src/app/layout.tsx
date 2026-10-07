import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic } from 'next/font/google';
import { HydrationFlag } from '@/components/HydrationFlag';
import { DEBUG_SCRIPT } from '@/lib/debug-script';
import { site } from '@/site.config';
import './globals.css';

const kufi = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['700', '800', '900'],
  variable: '--f-kufi',
  display: 'swap',
});
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--f-bricolage',
  display: 'swap',
});
const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--f-plex',
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--f-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} · ${site.subtitle}`, template: `%s · ${site.name}` },
  description: site.description,
  authors: [{ name: site.author.name, url: site.author.linkedin }],
  creator: site.author.name,
  openGraph: {
    title: `${site.name} · ${site.subtitle}`,
    description: site.description,
    locale: 'ar',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: `${site.name}: ${site.subtitle}` }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export const viewport: Viewport = {
  themeColor: '#eef4e9',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${kufi.variable} ${bricolage.variable} ${plex.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: DEBUG_SCRIPT }} />
      </head>
      <body>
        <HydrationFlag />
        {children}
      </body>
    </html>
  );
}
