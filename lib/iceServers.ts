// STUN + TURN configuration shared by every PeerJS `Peer` this app
// creates: the match/video peer in usePeerRoom.ts AND the presence/invite
// peer in usePresenceHub.ts.
//
// History worth knowing, because it has already taken this site down
// once: this used to point at `openrelay.metered.ca` using the Open Relay
// Project's shared public credentials ("openrelayproject" for both the
// username and the password). Those were free-for-anyone demo
// credentials, and Metered retired them - they now require each user to
// sign up for their own. The day they were switched off, every relayed
// connection in this app started failing with Chrome's "ICE failed, your
// TURN server appears to be broken", which from a player's seat just
// looked like "matching is broken". Nothing in this codebase had changed.
// The lesson: never depend on shared public credentials for anything
// load-bearing.
//
// Why TURN is needed at all: STUN only works when at least one side has a
// "normal" NAT. It cannot punch through carrier-grade NAT (the default on
// Indian mobile networks and on a lot of Indian fibre), symmetric NAT, or
// locked-down office/campus wifi. TURN is the relay that covers those
// cases, and for this app's audience it is needed for a large share of
// matches, not a rare edge case.
//
// Both TURN entries below were verified end-to-end before shipping - a
// real `relay` candidate was successfully allocated from each.

const TURN_HOST = "free.expressturn.com:3478";

// Credentials come from environment variables rather than being committed,
// because this repo is public and automated scrapers harvest credentials
// out of public repos. They still reach the browser inside the built
// bundle, which is unavoidable for client-side WebRTC, but keeping them
// out of the repo itself removes by far the easiest way for someone to
// find them and burn through the free monthly quota.
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME ?? "";
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "";

const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

// Deliberately kept short. Chrome warns "Using five or more STUN/TURN
// servers slows down discovery" and genuinely does spend longer gathering
// candidates when the list is padded out - which is exactly what the old
// six-entry config was doing, four of those six being dead servers.
export const ICE_SERVERS: RTCIceServer[] =
  TURN_USERNAME && TURN_CREDENTIAL
    ? [
        ...STUN_ONLY,
        // UDP first: lower latency, and what most networks allow.
        {
          urls: `turn:${TURN_HOST}`,
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
        // TCP fallback, for networks that block UDP outright (common on
        // corporate and campus wifi). Slower, but connects where UDP
        // cannot.
        {
          urls: `turn:${TURN_HOST}?transport=tcp`,
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
      ]
    : STUN_ONLY;

// Loud rather than silent: without TURN this app still "works" for the
// lucky minority of network pairs that can connect directly, which makes
// a missing-credentials deploy look like an intermittent bug rather than
// a configuration mistake. Say so plainly in the console instead.
if (typeof window !== "undefined" && !(TURN_USERNAME && TURN_CREDENTIAL)) {
  console.warn(
    "[ice] No TURN credentials configured (NEXT_PUBLIC_TURN_USERNAME / " +
      "NEXT_PUBLIC_TURN_CREDENTIAL). Players behind carrier-grade or " +
      "symmetric NAT will not be able to connect."
  );
}
