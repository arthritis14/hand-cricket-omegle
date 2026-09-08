import type { Call, Side } from "./gameEngine";

// Everything sent over the PeerJS data channel between the two players.
export type GameMessage =
  | { type: "hello"; name: string }
  | { type: "toss-call"; call: Call }
  | { type: "ready"; seq: number }
  | {
      type: "start-countdown";
      seq: number;
      /** Shared epoch-ms target both sides count down to, so the 3-2-1
       * lands at (close to) the same wall-clock moment on both screens. */
      startsAt: number;
    }
  | { type: "throw"; seq: number; value: number }
  | { type: "choose-side"; choice: Side }
  | { type: "rematch" }
  // Latency probe: intercepted inside usePeerRoom itself (never reaches
  // the game's onMessage handler) so the round-trip time between the two
  // players can be measured and used to time the synced countdown.
  | { type: "ping"; ts: number }
  | { type: "pong"; ts: number };
