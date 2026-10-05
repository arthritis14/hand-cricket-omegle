// Username rules. Usernames are unique per account in the hc_profiles table
// (see useAuth's claimUsername) and double as the PeerJS presence ID, so
// they stay lowercase and URL-safe.
const MIN_LENGTH = 3;
const MAX_LENGTH = 16;

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
