import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/settings/", "/library/", "/chat/", "/paper/"],
      },
    ],
    sitemap: "https://refly.ai/sitemap.xml",
  }
}