import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const TITLE = "Hand Cricket Omegle: Play Hand Cricket Online on Camera";
const DESCRIPTION =
  "Play hand cricket online with a friend or the computer over video. Throw 1 to 6 fingers at your webcam, it reads the throw and keeps score. Free to play in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  category: "games",
  // Both handcricketomegle.lol and the vercel.app address serve the site.
  // Pointing every copy at one URL stops search engines splitting it into
  // two half-ranked duplicates.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

// Structured data: tells Google in its own vocabulary that this page is a
// free browser game, which is what makes it eligible for richer results.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: SITE_NAME,
  url: SITE_URL,
  description: DESCRIPTION,
  genre: ["Sports", "Cricket", "Hand game"],
  gamePlatform: "Web browser",
  playMode: ["MultiPlayer", "SinglePlayer"],
  inLanguage: "en",
  isAccessibleForFree: true,
  author: { "@type": "Organization", name: "Vilicon Salley" },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    availability: "https://schema.org/InStock",
  },
  image: `${SITE_URL}/opengraph-image`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page paint under the notch and the home indicator. Without
  // it every env(safe-area-inset-*) in the stylesheet resolves to 0.
  viewportFit: "cover",
  // Makes Android Chrome shrink the layout viewport when the keyboard
  // opens, so 100dvh and the bottom-anchored controls react the way they
  // already do on iOS.
  interactiveWidget: "resizes-content",
  // The page commits to one look rather than shipping a dark variant, so
  // the browser chrome gets the ground colour in both schemes instead of
  // a white bar above a lime page.
  themeColor: "#C8F03C",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="antialiased">
      <body>
        <JsonLd data={jsonLd} />
        {children}
      </body>
    </html>
  );
}
