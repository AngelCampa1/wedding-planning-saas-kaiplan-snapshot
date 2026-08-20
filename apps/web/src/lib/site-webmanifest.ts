export function createSiteWebManifestResponse() {
  return new Response(
    JSON.stringify(
      {
        name: "Kaiplan - Wedding Planning Software",
        short_name: "Kaiplan",
        description:
          "Plan your wedding budget, guests, vendors, and seating in one place - without vendor ads.",
        start_url: "/",
        display: "standalone",
        background_color: "#f5f1ea",
        theme_color: "#b0432a",
        icons: [
          { src: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
          {
            src: "/apple-touch-icon.png",
            type: "image/png",
            sizes: "180x180",
          },
        ],
      },
      null,
      2,
    ),
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
      },
    },
  );
}
