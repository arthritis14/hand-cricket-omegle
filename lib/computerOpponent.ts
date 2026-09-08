// The "computer" opponent for practice mode. Kept deliberately simple:
// hand cricket numbers are just a 0-6 die roll with a fist and a thumbs-up
// added on either end (see fingerCounting.ts), so a uniform random throw
// is exactly as fair as a real stranger's guess - no difficulty setting or
// strategy needed for a game this simple.

/** The computer's thrown number for one ball (toss or delivery). */
export function computerThrow(): number {
  return Math.floor(Math.random() * 7);
}

/** After the computer wins a toss, it picks bat/bowl on a coin flip -
 * there's no runs on the board yet, so there's no strategic reason to
 * prefer one over the other. */
export function computerSideChoice(): "bat" | "bowl" {
  return Math.random() < 0.5 ? "bat" : "bowl";
}
