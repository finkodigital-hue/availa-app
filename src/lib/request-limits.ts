/** Small request guards shared by public API handlers. */
export function hasBodyOverLimit(request: Request, maxBytes: number): boolean {
  const length = request.headers.get("content-length");
  if (!length) return false;
  const parsed = Number(length);
  return Number.isFinite(parsed) && parsed > maxBytes;
}

/** Read an arbitrary request body without allowing chunked uploads to grow
 * beyond the route's documented limit. Returns null when the limit is hit. */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (hasBodyOverLimit(request, maxBytes)) return null;
  return readBodyBytes(request, maxBytes);
}

export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes: number,
): Promise<{ value: T } | { error: Response }> {
  const bytes = await readBodyWithLimit(request, maxBytes);
  if (!bytes) {
    return { error: new Response("Request body is too large", { status: 413 }) };
  }

  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) as T };
  } catch {
    return { error: new Response("Invalid JSON", { status: 400 }) };
  }
}

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
