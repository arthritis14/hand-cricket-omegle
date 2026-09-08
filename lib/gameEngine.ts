// Deterministic hand-cricket state machine.
//
// Both browsers run this exact same reducer against the exact same
// sequence of inputs (their own throws + the throws relayed by the other
// player over the data channel), so the two sides always converge on the
// same game state without either one having to act as an authority. The
// only asymmetric things between the two players are: who is "host" vs
// "guest" for setting up the video call, who calls odd/even at the toss
// (always the guest, by convention), and who computes the synced
// countdown start time (always the host, to avoid both sides racing to
// pick slightly different timestamps).

export type Role = "host" | "guest";
export type Side = "bat" | "bowl";
export type Call = "odd" | "even";
export type ThrowKind = "toss" | "ball";

export type Phase =
  | "lobby" // waiting for the other player's video/data connection
  | "toss-call" // guest is choosing odd/even
  | "throw-ready" // both players auto-readying for a throw (toss or ball)
  | "throw-countdown" // synced 3-2-1 before the throw
  | "throw-capture" // capturing + locking in each player's number
  | "toss-result" // showing who won the toss
  | "choose-side" // toss winner is choosing to bat or bowl
  | "ball-result" // showing the outcome of the last ball
  | "innings-break"
  | "game-over";

export interface InningsRecord {
  batter: Role;
  runs: number;
  ballsFaced: number;
  isOut: boolean;
}

export interface GameState {
  phase: Phase;
  seq: number; // increments once per throw; seq 0 is the toss
  throwKind: ThrowKind | null;
  tossCall: Call | null;
  tossWinner: Role | null;
  battingFirst: Role | null;
  currentInnings: 1 | 2;
  innings: Record<Role, InningsRecord>;
  ownValue: number | null;
  peerValue: number | null;
  countdownStartsAt: number | null; // epoch ms, shared between peers
  lastBall: { batterValue: number; bowlerValue: number; out: boolean } | null;
  winner: Role | "tie" | null;
  disconnected: boolean;
}

export function createInitialState(): GameState {
  return {
    phase: "lobby",
    seq: 0,
    throwKind: null,
    tossCall: null,
    tossWinner: null,
    battingFirst: null,
    currentInnings: 1,
    innings: {
      host: { batter: "host", runs: 0, ballsFaced: 0, isOut: false },
      guest: { batter: "guest", runs: 0, ballsFaced: 0, isOut: false },
    },
    ownValue: null,
    peerValue: null,
    countdownStartsAt: null,
    lastBall: null,
    winner: null,
    disconnected: false,
  };
}

export function other(role: Role): Role {
  return role === "host" ? "guest" : "host";
}

export function beginTossThrow(state: GameState, call: Call): GameState {
  return {
    ...state,
    tossCall: call,
    phase: "throw-ready",
    throwKind: "toss",
  };
}

export function resolveSideChoice(tossWinner: Role, choice: Side): Role {
  return choice === "bat" ? tossWinner : other(tossWinner);
}

export function applySideChoice(state: GameState, choice: Side): GameState {
  if (!state.tossWinner) return state;
  return {
    ...state,
    battingFirst: resolveSideChoice(state.tossWinner, choice),
    phase: "throw-ready",
    throwKind: "ball",
    // The toss itself was seq 0 - the first ball needs its own seq (like
    // every ball after it gets via nextBall/startSecondInnings), or the
    // UI's "have we already captured a throw for this seq" bookkeeping
    // thinks the first ball is the toss it already resolved, and quietly
    // never shows the throw-capture screen at all. This was the actual
    // cause of the game seeming to hang right after the toss.
    seq: state.seq + 1,
  };
}

export function currentBatter(state: GameState): Role | null {
  if (!state.battingFirst) return null;
  return state.currentInnings === 1
    ? state.battingFirst
    : other(state.battingFirst);
}

export function currentBowler(state: GameState): Role | null {
  const batter = currentBatter(state);
  return batter ? other(batter) : null;
}

/** Both players call this locally once they each know both thrown values -
 * it's a pure function of state + the two numbers, so it always produces
 * the same result on both sides. */
export function resolveThrow(
  state: GameState,
  self: Role,
  ownValue: number,
  peerValue: number
): GameState {
  if (state.throwKind === "toss") {
    const sum = ownValue + peerValue;
    const parity: Call = sum % 2 === 0 ? "even" : "odd";
    // By convention the guest always makes the call.
    const callerWon = state.tossCall === parity;
    const tossWinner: Role = callerWon ? "guest" : "host";
    return {
      ...state,
      phase: "toss-result",
      tossWinner,
      ownValue,
      peerValue,
    };
  }

  if (state.throwKind === "ball") {
    const batter = currentBatter(state);
    const bowler = currentBowler(state);
    if (!batter || !bowler) return state;

    const batterValue = self === batter ? ownValue : peerValue;
    const bowlerValue = self === bowler ? ownValue : peerValue;
    const out = batterValue === bowlerValue;

    const prevRecord = state.innings[batter];
    const nextRecord: InningsRecord = {
      ...prevRecord,
      runs: out ? prevRecord.runs : prevRecord.runs + batterValue,
      ballsFaced: prevRecord.ballsFaced + 1,
      isOut: out,
    };

    const nextInnings = { ...state.innings, [batter]: nextRecord };

    // In the second innings the chase can end the moment the target is
    // beaten, same as real hand cricket among friends.
    const chasing = state.currentInnings === 2 && state.battingFirst;
    const target = chasing
      ? state.innings[state.battingFirst as Role].runs
      : null;
    const chaseWon = chasing && target !== null && nextRecord.runs > target;

    if (out || chaseWon) {
      if (state.currentInnings === 1) {
        return {
          ...state,
          phase: "innings-break",
          innings: nextInnings,
          ownValue,
          peerValue,
          lastBall: { batterValue, bowlerValue, out },
        };
      }
      const firstScore = state.innings[state.battingFirst as Role].runs;
      const secondScore = nextRecord.runs;
      let winner: Role | "tie";
      if (secondScore > firstScore) winner = batter;
      else if (secondScore < firstScore) winner = bowler;
      else winner = "tie";

      return {
        ...state,
        phase: "game-over",
        innings: nextInnings,
        ownValue,
        peerValue,
        winner,
        lastBall: { batterValue, bowlerValue, out },
      };
    }

    return {
      ...state,
      phase: "ball-result",
      innings: nextInnings,
      ownValue,
      peerValue,
      lastBall: { batterValue, bowlerValue, out },
    };
  }

  return state;
}

export function startSecondInnings(state: GameState): GameState {
  return {
    ...state,
    phase: "throw-ready",
    throwKind: "ball",
    currentInnings: 2,
    seq: state.seq + 1,
    ownValue: null,
    peerValue: null,
    countdownStartsAt: null,
    lastBall: null,
  };
}

export function nextBall(state: GameState): GameState {
  return {
    ...state,
    phase: "throw-ready",
    seq: state.seq + 1,
    ownValue: null,
    peerValue: null,
    countdownStartsAt: null,
    lastBall: null,
  };
}
