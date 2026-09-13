// Google's public STUN servers, used to discover each player's public
// address. STUN alone is only enough when at least one side has a
// "normal" NAT - it can't punch through carrier-grade NAT (very common
// on Indian mobile networks like Jio and Airtel), symmetric NAT, or a
// locked-down corporate/campus wifi. For those, the two browsers can
// still find each other fine (that's the signalling handshake through
// PeerJS's cloud broker, and it isn't affected by any of this) but the
// actual peer-to-peer link can never finish connecting - which, from a
// player's seat, looks exactly like "nothing is happening" even though
// signalling already succeeded. The free Open Relay TURN servers are the
// fallback for that case: worst case, traffic relays through them
// instead of going directly between the two browsers.
//
// Shared by every PeerJS `Peer` this app creates - the match/video peer
// in usePeerRoom.ts AND the presence/invite peer in usePresenceHub.ts.
// The presence peer used to be created with no ICE config at all (so it
// silently fell back to PeerJS's STUN-only default), which is exactly
// why a friend could show "online" - the short-lived presence probe
// connection sometimes gets lucky - while an actual invite, needing a
// slightly longer-lived connection, quietly failed to ever open on a
// stricter network. Giving every peer the same TURN fallback fixes that
// whole class of "shows online but nothing happens" bug.
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];
