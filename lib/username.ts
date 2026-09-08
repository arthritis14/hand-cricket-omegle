// A user-chosen, persistent per-browser username - this is what a friend
// actually types in to add someone, replacing the old auto-generated
// random code. Stored in localStorage once claimed.
//
// There's still no backend of our own here: "creating an account" means
// claiming the matching PeerJS ID and holding it open (see
// usePresenceHub's claimUsername) - PeerJS's own "that ID's taken" error
// IS the uniqueness check. That makes it a best-effort, not a permanent
// registry: a name is only "taken" while someone is actively connected
// under it right now, not forever, so it's possible (if unlikely) for
// someone else to grab a name while you're offline. Worth knowing, not
// worth pretending isn't true.
const STORAGE_KEY = "hc-omegle-username";
const MIN_LENGTH = 3;
const MAX_LENGTH = 16;

export function getSavedUsername(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function saveUsername(username: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, username);
}

/** Lowercase letters, digits, and single hyphens/underscores only - easy
 * to read aloud or type from memory, and safe to fold into a PeerJS ID. */
export function normalizeUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_LENGTH);
}

export function isValidUsername(username: string): boolean {
  return username.length >= MIN_LENGTH && username.length <= MAX_LENGTH;
}
