# Image Upload Security Policy

Kaiplan accepts one user-uploaded image path before launch: the wedding website
hero image.

## Current Controls

- Uploads use Cloudflare Images Direct Creator Upload URLs. The API creates a
  short-lived upload intent and sends the one-time upload URL to the browser, so
  the Cloudflare Images API token is never exposed to clients.
- The API accepts only `image/jpeg`, `image/png`, `image/webp`, and
  `image/avif` upload intents. SVG, PDF, HTML, and GIF uploads are rejected.
- The dashboard file picker uses the same image type allowlist.
- The dashboard rejects files larger than 10 MB before requesting an upload
  intent. Cloudflare Images also enforces a 10 MB hosted-image upload limit.
- Uploaded images are served from Cloudflare Images delivery URLs, not from
  Kaiplan application workers.

## Malware Policy

Kaiplan does not run a separate malware scanner for wedding website hero images
because the product does not store or execute arbitrary uploaded files. Uploads
are restricted to raster image formats, processed by Cloudflare Images, and
served back as image assets through Cloudflare's image delivery pipeline.

If Kaiplan later adds uploads for documents, archives, SVG, HTML, vendor
contracts, CSV attachments, or any file type not transformed and served by
Cloudflare Images, that upload path must add a dedicated malware scan step
before files become downloadable or visible to other users.

## Operational Response

If a hero image is reported as abusive, private, or unsafe, remove it from the
affected wedding website draft/published content and delete the corresponding
asset from Cloudflare Images.
