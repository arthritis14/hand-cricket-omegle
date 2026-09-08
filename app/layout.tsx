import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hand Cricket Omegle",
  description:
    "Get matched with a stranger on camera, throw hand cricket numbers, let the camera do the scoring.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--brutal-cream)]">
        {children}
      </body>
    </html>
  );
}
