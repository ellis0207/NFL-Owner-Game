// The page carries its big data files gzipped and base64-encoded (see
// `packedJson` in vite.config.ts): about a fifth of their size as plain JSON.
// Each one is unpacked once, before the modules that import it run, through
// the browser's own gzip support. Tests and the dev server import the JSON
// files directly and never come here.
export async function inflateJson<T = unknown>(b64: string): Promise<T> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text) as T;
}
