// The "is my friend online, and can I invite them" system reuses the same
// trick as everything else in this app: claim a PeerJS ID and see if
// connecting to someone else's succeeds. Here that ID is derived from a
// person's chosen username (see username.ts) rather than a one-time match
// code, and the peer that claims it stays open as long as someone's
// sitting on the Private Match screen - not just during a match. That's
// the "online" beacon, and claiming it successfully is also what "account
// creation" actually means in this app - see usePresenceHub.
export function presenceIdFromUsername(username: string): string {
  return `hc-omegle-presence-${username}`;
}

// What can flow over a presence connection - these are short-lived probe
// or invite exchanges, never game data (that's a separate connection
// entirely, opened only once an invite is accepted).
export type PresenceMessage =
  | { type: "probe" }
  | { type: "invite"; roomCode: string; fromUsername: string }
  | { type: "invite-accepted" }
  | { type: "invite-declined" }
  | { type: "invite-cancelled" };
