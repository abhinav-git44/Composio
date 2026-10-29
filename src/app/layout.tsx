import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OAuth Compass", template: "%s · OAuth Compass" },
  description:
    "How long will it take to get your OAuth app approved? Evidence-labelled setup guides for developers building AI agents, plus live research for any app.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="brand" aria-label="OAuth Compass home">
              <span className="brand-mark" aria-hidden="true">◎</span> OAuth Compass
            </Link>
            <nav aria-label="Primary">
              <Link href="/#library">Library</Link>
              <Link href="/#generate">Generate</Link>
              <Link href="/about">How it works</Link>
            </nav>
          </div>
        </header>
        <main id="main" className="wrap">
          {children}
        </main>
        <footer className="site-footer wrap">
          Guides describe third-party providers and can go stale. Check the linked sources before you rely on a claim.
        </footer>
      </body>
    </html>
  );
}
