import type { Call, Side } from "./gameEngine";

// Everything sent over the PeerJS data channel between the two players.
export type GameMessage =
  | { type: "hello"; name: string }
  | { type: "toss-call"; call: Call }
  | { type: "ready"; seq: number }
  | {
      type: "start-countdown";
      seq: number;
      /** Milliseconds from now until the 3-2-1 begins. Relative on purpose:
       * two devices' wall clocks routinely disagree by seconds, so an
       * absolute timestamp would start one side's countdown early or late. */
      leadMs: number;
    }
  | { type: "throw"; seq: number; value: number }
  | { type: "choose-side"; choice: Side }
  | { type: "rematch" }
  // Latency probe: intercepted inside usePeerRoom itself (never reaches
  // the game's onMessage handler) so the round-trip time between the two
  // players can be measured and used to time the synced countdown.
  | { type: "ping"; ts: number }
  | { type: "pong"; ts: number };
