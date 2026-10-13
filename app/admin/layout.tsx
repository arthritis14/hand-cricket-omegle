import type { Metadata } from "next";

// The owner's stats page. Kept out of search results and the sitemap; what
// actually protects it is the sign-in check in the database, not obscurity.
export const metadata: Metadata = {
  title: "Admin | Hand Cricket Omegle",
  alternates: { canonical: null },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
