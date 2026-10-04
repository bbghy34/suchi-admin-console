import './globals.css';
import { Geist, Geist_Mono } from 'next/font/google';
import AuthProvider from '@/components/providers/AuthProvider';
import { PreferencesProvider } from '@/components/providers/PreferencesProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { BRAND } from '@/lib/branding';
import { PREF_BOOT_SCRIPT } from '@/lib/preferences';

const sans = Geist({ subsets: ['latin'], variable: '--console-font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--console-font-mono', display: 'swap' });

export const metadata = {
  title: {
    default: BRAND.fullName,
    template: `%s · ${BRAND.product}`,
  },
  applicationName: BRAND.fullName,
  description: BRAND.description,
  // Internal system. Keep it out of search engines.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-mat-bg text-mat-on antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: PREF_BOOT_SCRIPT }} />
        <AuthProvider>
          <PreferencesProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

