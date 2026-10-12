// Google Analytics 4. Nothing here loads or sends until the visitor accepts
// analytics in the banner (see components/Analytics.tsx), and with no
// NEXT_PUBLIC_GA_ID set the whole thing is inert.
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const CONSENT_KEY = "hc-analytics-consent";

type Gtag = (...args: unknown[]) => void;

/** Sends a game event. A no-op until analytics has been accepted and loaded. */
export function track(event: string, params?: Record<string, string | number>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  gtag?.("event", event, params);
}
