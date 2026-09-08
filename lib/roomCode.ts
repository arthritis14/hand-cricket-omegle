// Private rooms reuse the exact same trick the public lobby already uses -
// claim a fixed PeerJS ID and have the other side connect directly to it -
// just with a per-room ID derived from a short code the two friends share
// out of band (text, WhatsApp, shouting across the room) instead of one
// fixed ID everyone on the site shares. No backend of our own is needed:
// PeerJS's own public broker already works as the directory.
const CODE_LENGTH = 6;

/** A fresh 6-digit code for a new private room. Plain digits only - no
 * letters to mishear or mistype over a call. 1,000,000 possible codes is
 * comfortably more than this app will ever have concurrently open rooms,
 * so the odds of two unrelated rooms colliding are effectively zero. */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

/** Strips anything that isn't a digit and caps the length, so pasting a
 * code with spaces or a stray "code: " prefix still works. */
export function normalizeRoomCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isCompleteRoomCode(code: string): boolean {
  return code.length === CODE_LENGTH;
}

/** The PeerJS ID a room's code maps to - what the host claims and the
 * guest connects to. */
export function roomIdFromCode(code: string): string {
  return `hc-omegle-private-${code}`;
}
