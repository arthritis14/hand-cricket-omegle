"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import type { Friend } from "./friends";
import { presenceIdFromUsername, type PresenceMessage } from "./presenceProtocol";
import { generateRoomCode } from "./roomCode";
import { ICE_SERVERS } from "./iceServers";

// How often to re-check each friend's online status, and how long to wait
// for a single check before giving up and calling them offline. Short
// enough that the dot feels current; long enough not to hammer PeerJS's
// free broker with connection attempts.
const PROBE_INTERVAL_MS = 6000;
const PROBE_TIMEOUT_MS = 4000;

// How long to let an outgoing invite's connection attempt hang before
// giving up on it. Without this, a connection that never fires "open"
// AND never fires "error" (the same silent-hang failure mode as a stuck
// getUserMedia() call - it can happen here too, on a network the ICE
// negotiation can't punch through even with TURN available) just left
// the sender staring at an "Invite" button that looked like it had never
// been clicked, with no way to know anything had gone wrong.
const INVITE_CONNECT_TIMEOUT_MS = 10000;

export type FriendStatus = "checking" | "online" | "offline";

// "idle": nothing attempted yet. "claiming": a claim attempt is in
// flight. "claimed": this browser is holding its username's presence ID
// open right now - the closest thing this zero-backend app has to being
// "logged in". "taken": someone else is actively holding that username's
// ID right now (there's no permanent registry to check against, so this
// can only mean "in use this instant", not "reserved forever"). "error":
// the claim attempt itself failed for some other reason (offline, etc).
export type ClaimStatus = "idle" | "claiming" | "claimed" | "taken" | "error";

interface IncomingInvite {
  fromUsername: string;
  roomCode: string;
}

interface OutgoingInvite {
  toUsername: string;
  roomCode: string;
  status: "waiting" | "declined" | "failed";
}

interface AcceptedMatch {
  roomCode: string;
  role: "host" | "guest";
}

interface UsePresenceHubArgs {
  // Only active while someone's actually looking at the Private Match
  // screen - there's no reason to claim a presence beacon (or poll
  // friends) the moment the app loads, same reasoning as gating the
  // camera/matchmaking behind picking a mode at all.
  enabled: boolean;
  // The saved username, once an account exists - null before one's been
  // claimed. While null, nothing auto-connects; claimUsername() below is
  // how the account-creation form actually tries to claim one.
  username: string | null;
  friends: Friend[];
}

/** Runs a lightweight, camera-free PeerJS peer that acts purely as an
 * "I'm here" beacon and invite mailbox - completely separate from the
 * real match connection (which only opens once an invite is accepted or
 * a one-time code is used). Also doubles as this app's entire "account"
 * system: holding a username's ID open IS having an account under that
 * name, and PeerJS's own "that ID's taken" error IS the uniqueness
 * check - there's no database behind any of it. */
export function usePresenceHub({ enabled, username, friends }: UsePresenceHubArgs) {
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>("idle");
  const [statuses, setStatuses] = useState<Record<string, FriendStatus>>({});
  const [incomingInvite, setIncomingInvite] = useState<IncomingInvite | null>(null);
  const [outgoingInvite, setOutgoingInvite] = useState<OutgoingInvite | null>(null);
  const [accepted, setAccepted] = useState<AcceptedMatch | null>(null);

  const presencePeerRef = useRef<Peer | null>(null);
  const incomingConnRef = useRef<DataConnection | null>(null);
  const outgoingConnRef = useRef<DataConnection | null>(null);
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendsRef = useRef(friends);
  // Which username (if any) this hook currently holds a live claim for -
  // lets the auto-reclaim effect below tell "already claimed this one"
  // apart from "username prop just changed, go claim it".
  const claimedUsernameRef = useRef<string | null>(null);
  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  // Shared between the auto-reclaim-on-return path and the interactive
  // claimUsername() path below, so a freshly claimed peer always handles
  // incoming invites/probes the same way regardless of which path created it.
  const wirePeer = useCallback((peer: Peer) => {
    peer.on("connection", (conn) => {
      conn.on("data", (data) => {
        const msg = data as PresenceMessage;
        if (msg.type === "invite") {
          incomingConnRef.current = conn;
          setIncomingInvite({ fromUsername: msg.fromUsername, roomCode: msg.roomCode });
        } else if (msg.type === "invite-cancelled") {
          setIncomingInvite(null);
          incomingConnRef.current = null;
        }
        // "probe" needs no reply - a friend checking our status only
        // needs the connection to have opened at all.
      });
    });
  }, []);

  // The actual "claim": try to hold the PeerJS ID matching this username
  // open. Success is what having an account under that name means here;
  // PeerJS's "unavailable-id" error is the only collision signal this
  // app can get without a real backend, so "taken" means someone's
  // actively connected under that name right now, not that it's
  // permanently reserved.
  const claimUsername = useCallback(
    (name: string) => {
      if (!enabled || !name) return;
      presencePeerRef.current?.destroy();
      setClaimStatus("claiming");
      // Same TURN-backed ICE config as the match/video peer in
      // usePeerRoom.ts - without it this peer silently fell back to
      // PeerJS's STUN-only default, which is exactly why a friend could
      // show "online" (a short-lived presence probe got lucky) while an
      // actual invite - needing a slightly more durable connection -
      // quietly never opened on a stricter network.
      const peer = new Peer(presenceIdFromUsername(name), {
        config: { iceServers: ICE_SERVERS },
      });
      presencePeerRef.current = peer;
      wirePeer(peer);

      peer.on("open", () => {
        claimedUsernameRef.current = name;
        setClaimStatus("claimed");
      });
      peer.on("error", (err) => {
        if (err.type === "unavailable-id") {
          setClaimStatus("taken");
        } else {
          console.warn("Presence peer error", err);
          setClaimStatus("error");
        }
      });
    },
    [enabled, wirePeer]
  );

  // Returning user: re-claim the saved username automatically the moment
  // this screen's active, same as any other reconnect in this app - no
  // need to make them retype it every visit.
  useEffect(() => {
    if (!enabled || !username) return;
    if (claimedUsernameRef.current === username) return;
    claimUsername(username);
  }, [enabled, username, claimUsername]);

  // Tears the claim down whenever this screen stops being active (leaving
  // Private Match, or starting a match) - and resets the "already
  // claimed" bookkeeping so returning later re-claims cleanly.
  useEffect(() => {
    return () => {
      presencePeerRef.current?.destroy();
      presencePeerRef.current = null;
      claimedUsernameRef.current = null;
    };
  }, [enabled]);

  // Poll each friend's presence ID on an interval - PeerJS has no push
  // notification for "someone came online", so this is the only way to
  // keep the dot current. Only runs once this browser actually holds its
  // own claim (there's no point checking on friends before that).
  useEffect(() => {
    if (!enabled || claimStatus !== "claimed") return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const probeOnce = () => {
      const peer = presencePeerRef.current;
      if (!peer || peer.destroyed || cancelled) return;
      for (const friend of friendsRef.current) {
        const conn = peer.connect(presenceIdFromUsername(friend.username), { reliable: true });
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          if (!cancelled) setStatuses((s) => ({ ...s, [friend.username]: "offline" }));
          conn.close();
        }, PROBE_TIMEOUT_MS);
        conn.on("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (!cancelled) setStatuses((s) => ({ ...s, [friend.username]: "online" }));
          conn.send({ type: "probe" });
          setTimeout(() => conn.close(), 300);
        });
        conn.on("error", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (!cancelled) setStatuses((s) => ({ ...s, [friend.username]: "offline" }));
        });
      }
    };

    probeOnce();
    interval = setInterval(probeOnce, PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // Re-runs when the friend list changes so a newly-added friend gets
    // probed without waiting for the next tick.
  }, [enabled, claimStatus, friends]);

  const clearOutgoingTimeout = useCallback(() => {
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
  }, []);

  const sendInvite = useCallback(
    (toUsername: string) => {
      const peer = presencePeerRef.current;
      if (!peer || claimStatus !== "claimed" || !username) return;
      const roomCode = generateRoomCode();
      const conn = peer.connect(presenceIdFromUsername(toUsername), { reliable: true });
      outgoingConnRef.current = conn;
      // Optimistic - flips the button to "Cancel" the instant this is
      // called, rather than only once the connection finishes opening, so
      // clicking Invite always visibly does *something* straight away.
      setOutgoingInvite({ toUsername, roomCode, status: "waiting" });

      clearOutgoingTimeout();
      outgoingTimeoutRef.current = setTimeout(() => {
        // The connection never opened and never errored either - the
        // same silent-hang failure mode documented on
        // INVITE_CONNECT_TIMEOUT_MS above. Surface it instead of leaving
        // the sender stuck on "Cancel" forever with no way to tell it
        // failed.
        outgoingConnRef.current?.close();
        outgoingConnRef.current = null;
        setOutgoingInvite((s) =>
          s && s.toUsername === toUsername ? { ...s, status: "failed" } : s
        );
      }, INVITE_CONNECT_TIMEOUT_MS);

      conn.on("open", () => {
        clearOutgoingTimeout();
        conn.send({ type: "invite", roomCode, fromUsername: username });
      });
      conn.on("data", (data) => {
        const msg = data as PresenceMessage;
        if (msg.type === "invite-accepted") {
          setOutgoingInvite(null);
          setAccepted({ roomCode, role: "host" });
        } else if (msg.type === "invite-declined") {
          setOutgoingInvite((s) => (s ? { ...s, status: "declined" } : s));
        }
      });
      conn.on("error", () => {
        clearOutgoingTimeout();
        setOutgoingInvite((s) =>
          s && s.toUsername === toUsername ? { ...s, status: "failed" } : s
        );
      });
    },
    [claimStatus, username, clearOutgoingTimeout]
  );

  const cancelOutgoingInvite = useCallback(() => {
    clearOutgoingTimeout();
    outgoingConnRef.current?.send({ type: "invite-cancelled" });
    setTimeout(() => outgoingConnRef.current?.close(), 200);
    outgoingConnRef.current = null;
    setOutgoingInvite(null);
  }, [clearOutgoingTimeout]);

  const acceptInvite = useCallback(() => {
    if (!incomingInvite) return;
    incomingConnRef.current?.send({ type: "invite-accepted" });
    setTimeout(() => incomingConnRef.current?.close(), 200);
    setAccepted({ roomCode: incomingInvite.roomCode, role: "guest" });
    setIncomingInvite(null);
  }, [incomingInvite]);

  const declineInvite = useCallback(() => {
    incomingConnRef.current?.send({ type: "invite-declined" });
    setTimeout(() => incomingConnRef.current?.close(), 200);
    incomingConnRef.current = null;
    setIncomingInvite(null);
  }, []);

  return {
    claimStatus,
    claimUsername,
    statuses,
    incomingInvite,
    outgoingInvite,
    accepted,
    sendInvite,
    cancelOutgoingInvite,
    acceptInvite,
    declineInvite,
  };
}
