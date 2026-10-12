// Tells the browser whether this visitor is in a place where analytics needs
// opt-in consent. Vercel adds the country header at the edge; locally it is
// missing, which counts as "needs consent" so the banner is always testable.
const CONSENT_COUNTRIES = new Set([
  // EU
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // rest of the EEA, the UK and Switzerland
  "IS", "LI", "NO", "GB", "CH",
]);

export async function GET(request: Request) {
  const country = request.headers.get("x-vercel-ip-country");
  const needsConsent = !country || CONSENT_COUNTRIES.has(country.toUpperCase());
  return Response.json({ needsConsent }, { headers: { "Cache-Control": "private, no-store" } });
}
