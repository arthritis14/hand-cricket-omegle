"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection, type MediaConnection } from "peerjs";
import type { GameMessage } from "./messages";
import type { Role } from "./gameEngine";

export type ConnectionStatus =
  | "idle"
  | "requesting-camera"
  | "connecting"
  | "waiting-for-opponent"
  | "connected"
  | "opponent-left"
  | "failed";

// How the two sides find each other, one per game mode:
//  - "lobby": race to claim a shared, fixed ID - whoever loses the race
//    becomes the guest. Used for "match with a stranger".
//  - "host": claim a specific ID directly, no race and no guest fallback -
//    used by whoever creates a private room (the ID is derived from the
//    room code they'll share).
//  - "guest": connect straight to a specific ID, no claim attempt at all -
//    used by whoever joins a private room with a code.
//  - "solo": no PeerJS networking at all - just the local camera, for
//    practising against the computer. There's no one to matchmake with.
export type RoomStrategy = "lobby" | "host" | "guest" | "solo";

const PING_INTERVAL_MS = 2000;
const RTT_SAMPLE_WINDOW = 5;

// Google's public STUN servers, used to discover each player's public
// address. STUN alone is only enough when at least one side has a
// "normal" NAT - it can't punch through carrier-grade NAT (very common
// on Indian mobile networks like Jio and Airtel), symmetric NAT, or a
// locked-down corporate/campus wifi. For those, the two browsers can
// still find each other fine (that's the signalling handshake through
// PeerJS's cloud broker below, and it isn't affected by any of this) but
// the actual peer-to-peer video/data link can never finish connecting -
// which, from a player's seat, looks exactly like "we're not getting
// matched" even though matching already happened. The free Open Relay
// TURN servers are the fallback for that case: worst case, traffic
// relays through them instead of going directly between the two
// browsers.
const ICE_SERVERS: RTCIceServer[] = [
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

// How long to wait, once the two browsers have actually found each other
// (a DataConnection object exists on both sides), for the underlying
// video/data link to finish connecting before giving up and telling the
// player something's wrong. Without this, a pair that found each other
// but then failed to establish a connection (see the ICE_SERVERS comment
// above) just sat on "waiting for opponent" forever, indistinguishable
// from genuinely still waiting for someone to show up.
const CONNECT_TIMEOUT_MS = 15000;

// How long to give signalling reconnection before giving up. PeerJS
// separates "disconnected" (lost the connection to its matchmaking server,
// but can retry with the same ID) from "close" (permanently destroyed).
// "disconnected" is the far more common one in practice - it fires if a
// phone's screen locks, the tab gets backgrounded, or the network blips
// while someone is just sitting on "waiting for opponent".
//
// One PeerJS internal worth documenting because it isn't obvious from the
// public API: `Peer.destroy()` *always* fires "disconnected" internally
// before it fires "close" - even for a completely routine, expected
// destroy. That matters here because becoming a "guest" (in "lobby" or
// "guest" strategy) always involves destroying a Peer object on the way -
// `wirePeerLifecycle`'s `forRole` guard is what tells that apart from a
// real, unexpected disconnect on a peer we've already settled a role on.
const RECONNECT_GRACE_MS = 25000;
const RECONNECT_BACKOFF_STEP_MS = 1200;
const RECONNECT_BACKOFF_MAX_MS = 4000;

// The public lobby's single shared ID - whoever opens the site first and
// picks "match with a stranger" claims this on PeerJS's public broker and
// becomes the host; the next person finds it taken and becomes the guest.
// Exported so page.tsx can pass it in as the "lobby" strategy's roomId.
export const LOBBY_HOST_ID = "hc-omegle-lobby-9f2-host";
const randomGuestId = () =>
  `hc-omegle-guest-${Math.random().toString(36).slice(2, 10)}`;

interface UsePeerRoomArgs {
  onMessage: (msg: GameMessage) => void;
  // Camera + matchmaking only start once this is true - gated behind a
  // mode-select screen rather than firing the moment the page loads.
  // That's not just nicer UX: without it, anything that silently loads
  // the page URL (a link-preview crawler, an accidental double-open, a
  // stray background tab) would auto-claim a matchmaking slot and sit
  // there as a phantom "opponent".
  enabled: boolean;
  strategy: RoomStrategy;
  // The PeerJS ID this room rendezvouses on. Required for "lobby"/"host"/
  // "guest" (each derives it differently - see the callers in page.tsx);
  // ignored for "solo", which never talks to PeerJS at all.
  roomId?: string;
}

export function usePeerRoom({ onMessage, enabled, strategy, roomId }: UsePeerRoomArgs) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [role, setRole] = useState<Role | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rolling-average round-trip time to the other player, in ms - used to
  // size the lead time on the synced "3, 2, 1, throw" countdown so it
  // holds up on a slow connection instead of assuming a fixed number.
  // Stays null forever in "solo" mode - there's no round trip to measure.
  const [rtt, setRtt] = useState<number | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const rttSamplesRef = useRef<number[]>([]);
  // Keep a ref to the latest onMessage so the long-lived PeerJS
  // "data" listener (wired up once when the connection opens) always
  // calls the current handler instead of a stale closure. Synced via
  // effect rather than during render, per the ref-mutation lint rule.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  // A safe no-op when there's no live data connection (idle, still
  // connecting, or "solo" mode where one never exists) - callers don't
  // need to branch on mode before calling this.
  const sendMessage = useCallback((msg: GameMessage) => {
    dataConnRef.current?.send(msg);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let localMediaStream: MediaStream | null = null;
    let peer: Peer | null = null;
    let settledRole: Role | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const clearConnectTimeout = () => {
      if (connectTimeoutTimer) {
        clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
    };

    // Starts (or restarts) the "did the link actually finish connecting"
    // watchdog. Called the moment a DataConnection object exists, on
    // either side - that's the point at which the two players have found
    // each other, so from here on a stall means the connection itself is
    // stuck, not that no one's shown up yet.
    const startConnectTimeout = () => {
      clearConnectTimeout();
      connectTimeoutTimer = setTimeout(() => {
        if (cancelled) return;
        setError(
          "Found each other, but the video connection couldn't finish " +
            "connecting - this can happen on some mobile or work networks. " +
            "Try switching one of you to wifi, or a different network, and reload."
        );
        setStatus("failed");
      }, CONNECT_TIMEOUT_MS);
    };

    async function setup() {
      setStatus("requesting-camera");
      try {
        // Video + mic, so the two players can talk during a match. Echo
        // cancellation/noise suppression/auto gain are switched on since
        // this is exactly the "two nearby devices" case that risks local
        // echo - the browser's own AEC handles that, rather than dropping
        // audio entirely. The local tile is still rendered muted (see the
        // VideoTile below) so no one ever hears themselves back.
        localMediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        // Some browsers/extensions reject a combined video+audio request
        // outright rather than prompting for both (or the mic gets denied
        // on its own after the camera was already granted in a past
        // session). Falling back to video-only keeps the game playable -
        // losing voice chat is much better than losing the whole match.
        try {
          localMediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false,
          });
        } catch {
          if (!cancelled) {
            setError(
              "Couldn't access your camera. Check permissions and reload."
            );
            setStatus("failed");
          }
          return;
        }
      }
      if (cancelled) {
        localMediaStream.getTracks().forEach((t) => t.stop());
        return;
      }
      setLocalStream(localMediaStream);

      // Vs-computer practice has no opponent and no networking at all -
      // once the camera's up, there's nothing left to connect to.
      if (strategy === "solo") {
        settledRole = "guest";
        setRole("guest");
        setStatus("connected");
        return;
      }

      setStatus("connecting");

      // Attaches the "did we lose our connection to the matching server"
      // handling that every Peer needs, whatever strategy it's playing.
      // A disconnect doesn't have to be fatal - PeerJS can usually just
      // reconnect with the same ID - but if it can't recover within the
      // grace window, that's surfaced as a real error instead of leaving
      // the player stuck on a spinner that will never resolve.
      //
      // Reconnect attempts are paced with a short, growing backoff instead
      // of being fired instantly and repeatedly: if "disconnected" keeps
      // re-firing in a tight loop, retrying with zero delay just spams the
      // server and makes a brief blip worse. The overall give-up clock,
      // though, starts from the *first* disconnect and doesn't get pushed
      // back by later ones.
      //
      // `forRole` is "host" for the peer created to try claiming a fixed
      // ID, and "guest" for the one created to connect directly instead.
      // Once a role has actually been settled on (settledRole set), any
      // disconnected/close event on a peer that ISN'T the one representing
      // that settled role is a leftover from an attempt we've already
      // abandoned on purpose - not a real problem.
      const wirePeerLifecycle = (p: Peer, forRole: Role) => {
        let giveUpTimer: ReturnType<typeof setTimeout> | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;

        const stopTrying = () => {
          if (giveUpTimer) {
            clearTimeout(giveUpTimer);
            giveUpTimer = null;
          }
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          attempt = 0;
        };

        const isAbandonedAttempt = () =>
          settledRole !== null && settledRole !== forRole;

        p.on("disconnected", () => {
          if (cancelled || isAbandonedAttempt()) return;
          attempt += 1;
          console.warn(
            `PeerJS lost its connection to the matching server - attempting to reconnect… (try ${attempt})`
          );

          if (!giveUpTimer) {
            giveUpTimer = setTimeout(() => {
              if (cancelled) return;
              setError(
                "Lost the connection to the matching server and couldn't get it back " +
                  "(this can happen if a tab was backgrounded or a phone screen locked " +
                  "while waiting, or if the matching server had a brief hiccup). Reload " +
                  "to try again - and keep this tab open and your screen on while " +
                  "you're waiting for a match."
              );
              setStatus("failed");
            }, RECONNECT_GRACE_MS);
          }

          if (retryTimer) clearTimeout(retryTimer);
          const backoff = Math.min(
            RECONNECT_BACKOFF_STEP_MS * attempt,
            RECONNECT_BACKOFF_MAX_MS
          );
          retryTimer = setTimeout(() => {
            if (cancelled) return;
            p.reconnect();
          }, backoff);
        });

        p.on("open", stopTrying);

        p.on("close", () => {
          stopTrying();
          if (cancelled || isAbandonedAttempt()) return;
          setError("Lost the connection to the matching server. Reload to try again.");
          setStatus("failed");
        });
      };

      const wireDataConnection = (conn: DataConnection) => {
        dataConnRef.current = conn;
        startConnectTimeout();

        // PeerJS's data channel and the video call below are two entirely
        // separate WebRTC connections under the hood, each with their own
        // ICE negotiation - one succeeding says nothing about the other.
        // Logging both sides' ICE state plainly is what makes a future
        // "one side works, the other doesn't" report diagnosable from the
        // browser console instead of another guess.
        conn.on("iceStateChanged", (state) => {
          console.log(`[data channel] ICE state: ${state}`);
        });

        conn.on("data", (data) => {
          const msg = data as GameMessage;
          // Ping/pong are a transport-level concern, not a game message -
          // answer or consume them here so gameEngine/page.tsx never see
          // them.
          if (msg.type === "ping") {
            conn.send({ type: "pong", ts: msg.ts });
            return;
          }
          if (msg.type === "pong") {
            const sample = Date.now() - msg.ts;
            const samples = rttSamplesRef.current;
            samples.push(sample);
            if (samples.length > RTT_SAMPLE_WINDOW) samples.shift();
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
            if (!cancelled) setRtt(Math.round(avg));
            return;
          }
          onMessageRef.current(msg);
        });
        conn.on("open", () => {
          clearConnectTimeout();
          setStatus("connected");
          conn.send({ type: "ping", ts: Date.now() });
          pingTimer = setInterval(() => {
            conn.send({ type: "ping", ts: Date.now() });
          }, PING_INTERVAL_MS);
        });
        conn.on("close", () => {
          clearConnectTimeout();
          if (pingTimer) clearInterval(pingTimer);
          setStatus("opponent-left");
        });
        conn.on("error", (err) => {
          console.error("PeerJS data connection error", err);
          if (cancelled) return;
          clearConnectTimeout();
          setError(`Connection error: ${err.type}`);
          setStatus("failed");
        });
      };

      const wireMediaConnection = (call: MediaConnection) => {
        // Tracks whether the "stream" event below has ever fired, so a
        // late ICE hiccup after a successful call doesn't get misread as
        // the call having failed outright.
        let gotStream = false;

        call.on("stream", (stream) => {
          gotStream = true;
          console.log("[video call] stream received");
          if (!cancelled) setRemoteStream(stream);
        });

        // Same idea as the data channel above - a completely separate ICE
        // negotiation, so it can fail independently even when the data
        // channel (matchmaking, ping, the whole game) is working
        // perfectly. "failed" is ICE's own terminal give-up state, so
        // that's the one worth surfacing as a real, explained error
        // instead of leaving the player staring at a black box.
        call.on("iceStateChanged", (state) => {
          console.log(`[video call] ICE state: ${state}`);
          if (state === "failed" && !gotStream && !cancelled) {
            setError(
              "Found each other and the connection itself works, but the " +
                "video specifically couldn't connect - this can happen when " +
                "the free relay this app uses struggles with video traffic " +
                "even though it handles the game's small messages fine. " +
                "Reload and try again, or have one of you switch networks."
            );
            setStatus("failed");
          }
        });

        call.on("close", () => setStatus("opponent-left"));
        call.on("error", (err) => {
          console.error("PeerJS media connection error", err);
        });
      };

      // Creates a fresh Peer with a random ID and connects it straight to
      // `targetId` - used both as the "lobby" strategy's fallback (once a
      // fixed-ID claim attempt fails) and as the "guest" strategy's entire
      // approach (no claim attempt at all, just connect directly).
      const becomeGuestOf = (targetId: string) => {
        if (cancelled || !localMediaStream) return;
        // Settling the role BEFORE destroying any failed host-claim
        // attempt is what lets wirePeerLifecycle's guard recognise the
        // disconnected/close events that destroy() is about to fire as
        // fallout from an abandoned attempt, not a real problem.
        settledRole = "guest";
        setRole("guest");
        setError(null);
        peer?.destroy();

        const guestPeer = new Peer(randomGuestId(), {
          config: { iceServers: ICE_SERVERS },
        });
        peer = guestPeer;
        peerRef.current = guestPeer;
        wirePeerLifecycle(guestPeer, "guest");

        guestPeer.on("open", () => {
          if (cancelled || !localMediaStream) return;
          setError(null);
          setStatus("waiting-for-opponent");
          const conn = guestPeer.connect(targetId, { reliable: true });
          wireDataConnection(conn);
          const call = guestPeer.call(targetId, localMediaStream);
          wireMediaConnection(call);
        });

        guestPeer.on("error", (err) => {
          console.error("PeerJS error (guest)", err);
          if (cancelled) return;
          if (err.type === "peer-unavailable") {
            setError(
              strategy === "guest"
                ? "Couldn't find a room with that code. Double-check it with whoever sent it and try again."
                : "No one's on the site to match with right now. Have your friend open the link and try again."
            );
          } else {
            setError(`Connection error: ${err.type}`);
          }
          setStatus("failed");
        });
      };

      if (strategy === "guest") {
        // Joining a private room: no claim attempt at all, just connect
        // straight to the host's ID.
        becomeGuestOf(roomId!);
        return;
      }

      // "lobby" or "host": try to claim roomId directly first.
      const hostPeer = new Peer(roomId!, { config: { iceServers: ICE_SERVERS } });
      peer = hostPeer;
      peerRef.current = hostPeer;
      wirePeerLifecycle(hostPeer, "host");

      // Registered once, immediately, rather than inside the "open"
      // handler below - "open" can fire more than once (a reconnect after
      // a signalling drop fires it again with the same peer object), and
      // re-registering these on every "open" would stack up duplicate
      // listeners that each independently wire up and process the same
      // incoming connection, double-handling every message that comes in.
      hostPeer.on("connection", wireDataConnection);
      hostPeer.on("call", (call) => {
        call.answer(localMediaStream!);
        wireMediaConnection(call);
      });

      hostPeer.on("open", () => {
        if (cancelled || !localMediaStream) return;
        settledRole = "host";
        setRole("host");
        setError(null);
        // Don't stomp on a status that's already moved past matchmaking -
        // this can also fire again after a reconnect.
        setStatus((s) => (s === "connected" ? s : "waiting-for-opponent"));
      });

      hostPeer.on("error", (err) => {
        console.error("PeerJS error (host attempt)", err);
        if (cancelled || settledRole !== null) return;
        if (err.type === "unavailable-id") {
          if (strategy === "lobby") {
            // Someone's already hosting the shared lobby - join them as
            // the guest instead.
            becomeGuestOf(roomId!);
          } else {
            // A private room's code is freshly generated, so this should
            // essentially never happen - but if it does, there's no
            // sensible fallback role to fall into.
            setError(
              "That room code just got claimed by someone else. Go back and create a new room."
            );
            setStatus("failed");
          }
        } else {
          setError(`Connection error: ${err.type}`);
          setStatus("failed");
        }
      });
    }

    setup();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      clearConnectTimeout();
      localMediaStream?.getTracks().forEach((t) => t.stop());
      peer?.destroy();
      peerRef.current = null;
      dataConnRef.current = null;
    };
  }, [enabled, strategy, roomId]);

  return { status, role, localStream, remoteStream, error, rtt, sendMessage };
}
