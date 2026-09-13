"use client";

import type { GameState, Role } from "@/lib/gameEngine";

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

  return (
    <div className="nb-scoreboard">
      <ScoreLine
        name={nameFor("host")}
        record={state.innings.host}
        highlight={state.battingFirst !== null && state.currentInnings === (state.battingFirst === "host" ? 1 : 2)}
      />
      <span className="nb-vs">vs</span>
      <ScoreLine
        name={nameFor("guest")}
        record={state.innings.guest}
        highlight={state.battingFirst !== null && state.currentInnings === (state.battingFirst === "guest" ? 1 : 2)}
      />
      {state.currentInnings === 2 && state.battingFirst && (
        <div className="nb-chip nb-chip--pink hidden sm:inline-block">
          Target {state.innings[state.battingFirst].runs + 1}
        </div>
      )}
    </div>
  );
}

function ScoreLine({
  name,
  record,
  highlight,
}: {
  name: string;
  record: GameState["innings"][Role];
  highlight: boolean;
}) {
  return (
    <div className="nb-score-line">
      <span className="nb-score-who">{name}</span>
      {highlight && !record.isOut && (
        <div className="nb-chip nb-chip--green" style={{ marginTop: "1px" }}>
          Batting
        </div>
      )}
      <span className="nb-score-runs">
        {record.runs}
        {record.isOut && <span className="nb-score-out"> *out</span>}
      </span>
    </div>
  );
}
