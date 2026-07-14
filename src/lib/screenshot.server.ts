// Thin wrapper around ScreenshotOne's REST API. Returns null (rather than
// throwing) on any failure — a missing key, a network error, or an
// unreachable target URL (e.g. localhost in local dev) should degrade the
// caller to a text-only flow, not break the whole AI editing feature.
const SCREENSHOTONE_ENDPOINT = "https://api.screenshotone.com/take";

export async function captureScreenshot(pageUrl: string): Promise<{ base64: string } | null> {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (!accessKey) return null;

  const params = new URLSearchParams({
    url: pageUrl,
    access_key: accessKey,
    format: "png",
    viewport_width: "1280",
    viewport_height: "1600",
    full_page: "false",
    block_ads: "true",
    block_cookie_banners: "true",
    image_quality: "80",
    device_scale_factor: "1",
  });

  try {
    const res = await fetch(`${SCREENSHOTONE_ENDPOINT}?${params.toString()}`);
    if (!res.ok) {
      console.error("Screenshot capture failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    return { base64: arrayBufferToBase64(await res.arrayBuffer()) };
  } catch (err) {
    console.error("Screenshot capture error", err);
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
