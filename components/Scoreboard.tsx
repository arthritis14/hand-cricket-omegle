"use client";

import type { GameState, Role } from "@/lib/gameEngine";

/** The manual tin scoreboard you get at a real ground: dark board,
 *  hanging plates, runs set in the biggest numerals on the page. This is
 *  the actual score display rather than a styled text row, because
 *  during a match the score is the thing a player looks at most. */
export function Scoreboard({
  state,
  self,
  selfName,
  peerName,
}: {
  state: GameState;
  self: Role;
  selfName: string;
  peerName: string;
}) {
  const nameFor = (role: Role) => (role === self ? selfName : peerName);
  const battingNow = (role: Role) =>
    state.battingFirst !== null &&
    state.currentInnings === (state.battingFirst === role ? 1 : 2);

  // Always you on the left. Ordering by host/guest instead would put the
  // player on whichever side the connection happened to assign, so in
  // practice mode you read your own score second.
  const mine: Role = self;
  const theirs: Role = self === "host" ? "guest" : "host";

  return (
    <div className="gc-board">
      <Side
        name={nameFor(mine)}
        record={state.innings[mine]}
        batting={battingNow(mine)}
      />
      <div className="gc-board-mid">V</div>
      <Side
        name={nameFor(theirs)}
        record={state.innings[theirs]}
        batting={battingNow(theirs)}
      />
      {state.currentInnings === 2 && state.battingFirst && (
        <p className="gc-board-target">
          Needs {state.innings[state.battingFirst].runs + 1} to win
        </p>
      )}
    </div>
  );
}

function Side({
  name,
  record,
  batting,
}: {
  name: string;
  record: GameState["innings"][Role];
  batting: boolean;
}) {
  return (
    <div className="gc-board-side">
      <p className="gc-board-who">{name}</p>
      <p className="gc-board-runs">
        {record.runs}
        {record.isOut && <span className="gc-board-out">out</span>}
      </p>
      {batting && !record.isOut && <span className="gc-board-flag">Batting</span>}
    </div>
  );
}
