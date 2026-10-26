// Minimal structural typing for the Cloudflare bindings this project uses.
// The assets binding is provided by the Cloudflare adapter (ADR 0008);
// replace this with `wrangler types` output when more bindings appear.
declare module "cloudflare:workers" {
  export const env: {
    ASSETS: { fetch(request: Request): Promise<Response> };
  };
}
