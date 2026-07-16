// Client-side image resize + compress
export async function compressImage(file: File, maxSide = 1920, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality),
  );
}

export function publicUrl(path: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
  return `${base}/storage/v1/object/public/business-assets/${path}`;
}

// For private bucket, use signed URLs. Cached per path for the page life.
import { supabase } from "@/integrations/supabase/client";
const cache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path: string, expiresIn = 3600): Promise<string> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.exp > now + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from("business-assets").createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("Failed to sign URL");
  cache.set(path, { url: data.signedUrl, exp: now + expiresIn * 1000 });
  return data.signedUrl;
}

// business-public-assets is a genuinely public bucket (unlike business-assets,
// whose anon read access was deliberately removed) — for assets rendered
// directly on the public booking page, like the theme logo.
export async function uploadPublicAsset(businessId: string, folder: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `${businessId}/${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("business-public-assets")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return supabase.storage.from("business-public-assets").getPublicUrl(path).data.publicUrl;
}
