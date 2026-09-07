# Image integration testing rules
- Always use base64-encoded images (JPEG/PNG/WEBP only) with real visual features — no blank/solid images.
- Re-detect MIME after any transformation; transcode unsupported formats to JPEG/PNG.
- For animated formats, extract first frame. Resize oversized images before upload.
- Extractor endpoint: POST /api/field/jobs/{id}/capture (multipart: file, kind=docket_photo) with crew Bearer token.
- EXTRACTOR_MODE=fixture in backend/.env makes extraction deterministic (no LLM call) for CI-style tests.
