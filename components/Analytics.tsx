"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { CONSENT_KEY, GA_ID } from "@/lib/analytics";

type Choice = "granted" | "denied";

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/** Loads Google Analytics only after the visitor says yes, and asks once.
 *  The choice is kept in this browser so the banner does not return. */
export function Analytics() {
  // null until the stored choice has been read, so nothing flashes on load.
  const [choice, setChoice] = useState<Choice | null | "unread">("unread");
  // Whether this visitor's country needs opt-in consent. Unknown until asked,
  // and anything that goes wrong counts as "needs consent".
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/region")
      .then((r) => r.json())
      .then((d) => setNeedsConsent(d.needsConsent !== false))
      .catch(() => setNeedsConsent(true));

    // Reading browser storage after mount, so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(readChoice());
  }, []);

  if (!GA_ID || choice === "unread" || needsConsent === null) return null;

  // Outside the EU and UK analytics just runs. Inside, only after Accept.
  const loadGa = choice === "granted" || (!needsConsent && choice !== "denied");

  const decide = (next: Choice) => {
    try {
      localStorage.setItem(CONSENT_KEY, next);
    } catch {
      // Private mode: the choice just lasts until the page is closed.
    }
    setChoice(next);
  };

  return (
    <>
      {loadGa && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {needsConsent && choice === null && (
        <div
          role="dialog"
          aria-label="Analytics"
          className="gc-card gc-card--cream"
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: "calc(12px + env(safe-area-inset-bottom))",
            zIndex: 60,
            maxWidth: 440,
            margin: "0 auto",
            padding: 12,
          }}
        >
          <p className="gc-lede" style={{ fontSize: 13 }}>
            We use cookies for analytics.{" "}
            <a href="/privacy" className="underline">
              Learn more
            </a>
          </p>
          <div className="mt-2 flex gap-2">
            <button className="gc-btn gc-btn--sm gc-btn--yellow" onClick={() => decide("granted")}>
              Accept
            </button>
            <button className="gc-btn gc-btn--sm" onClick={() => decide("denied")}>
              No thanks
            </button>
          </div>
        </div>
      )}
    </>
  );
}
