import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const arabicFont = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

const sansFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0D6E5B',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Awn | عَون',
  description: 'Privacy-first community mutual aid circles platform with strict RLS, explainable matching, and global readiness.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Awn',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Awn | عَون',
    description: 'Privacy-first community mutual aid circles platform with strict RLS, explainable matching, and global readiness.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${arabicFont.variable} ${sansFont.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
