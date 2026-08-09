/**
 * Public origin of the running app, for building absolute redirect URLs.
 *
 * Behind a reverse proxy (Railway), `new URL(req.url).origin` resolves to the
 * container's internal localhost address, so post-OAuth redirects would send
 * the browser to localhost. Prefer, in order: an explicit APP_BASE_URL env
 * var, the proxy's x-forwarded-* headers, then the raw request origin.
 */
export function appOrigin(req: Request): string {
  const base = process.env.APP_BASE_URL;
  if (base) {
    return base.replace(/\/+$/, "");
  }
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
}
