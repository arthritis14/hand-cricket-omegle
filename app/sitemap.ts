import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The whole game lives on one page, so that is the only URL to list.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: "weekly", priority: 1 }];
}
