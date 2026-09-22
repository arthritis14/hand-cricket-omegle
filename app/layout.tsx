import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hand Cricket Omegle",
  description:
    "Get matched with a stranger on camera and play hand cricket. Your webcam reads the throw, the scoreboard does the rest.",
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
      <body>{children}</body>
    </html>
  );
}
