import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Instrument_Serif } from 'next/font/google'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import ThemeProvider from '@/components/ThemeProvider'
import './globals.css'

const geist = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
})

const uxum = localFont({
  src: [
    { path: './fonts/uxumlight.otf', weight: '300', style: 'normal' },
    { path: './fonts/uxumregular.otf', weight: '400', style: 'normal' },
    { path: './fonts/uxumbold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-uxum',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'The Daley Dash',
  description: 'Jouw werkportaal — offertes, facturen & meer',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Daley Dash',
  },
}

export const viewport: Viewport = {
  themeColor: '#7F719D',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${geist.variable} ${uxum.variable} ${instrumentSerif.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('daley_dash_theme');
                  var isDark = theme === 'dark' ||
                    (theme === 'system' &&
                    window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) document.documentElement.classList.add('dark');
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ServiceWorkerRegistration />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
