import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { connection } from "next/server";
import { AppStateProvider } from "@/components/AppStateProvider";
import { CatalogProvider } from "@/components/CatalogProvider";
import { catalogVersion } from "@/lib/catalog";
import { loadCatalog } from "@/lib/db/catalog-server";
import { CartPanel } from "@/components/cart/CartPanel";
import { ViewCartBar } from "@/components/cart/ViewCartBar";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { NoticeToast } from "@/components/layout/NoticeToast";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { OutletBar } from "@/components/outlets/OutletBar";
import { OutletPicker } from "@/components/outlets/OutletPicker";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const body = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "US Pizza Demo – order pizza online",
  description:
    "Order pizza for delivery or pickup, plan group orders, and get help from the AI assistant.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#c8102e",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render per request with the live menu and outlets from the database
  // (or the original data if it is unavailable).
  await connection();
  const { catalog } = await loadCatalog();
  return (
    <html lang="en" className={`${display.variable} ${body.variable} antialiased`}>
      <body className="flex min-h-[100dvh] flex-col pb-[var(--bottom-bar-h)]">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-ink px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <CatalogProvider initial={catalog} version={catalogVersion(catalog)}>
        <AppStateProvider>
          <SiteHeader />
          <OutletBar />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <CartPanel />
          <ViewCartBar />
          <NoticeToast />
          <ChatWidget />
          <OutletPicker />
        </AppStateProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
