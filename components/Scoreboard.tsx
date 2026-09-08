"use client";

import { BrutalCard, BrutalBadge } from "./Brutal";
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
    <BrutalCard tone="lilac" className="flex items-center justify-between gap-4 px-4 py-3">
      <ScoreLine
        name={nameFor("host")}
        record={state.innings.host}
        highlight={state.battingFirst !== null && state.currentInnings === (state.battingFirst === "host" ? 1 : 2)}
      />
      <span className="font-display text-xs font-bold uppercase text-black/40">vs</span>
      <ScoreLine
        name={nameFor("guest")}
        record={state.innings.guest}
        highlight={state.battingFirst !== null && state.currentInnings === (state.battingFirst === "guest" ? 1 : 2)}
      />
      {state.currentInnings === 2 && state.battingFirst && (
        <BrutalBadge tone="coral" className="hidden sm:inline-flex">
          Target {state.innings[state.battingFirst].runs + 1}
        </BrutalBadge>
      )}
    </BrutalCard>
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
    <div className="flex flex-col items-center">
      <span className="font-display text-xs font-bold uppercase tracking-wide text-black/60">
        {name}
      </span>
      {highlight && !record.isOut && (
        <BrutalBadge tone="lime" className="mt-0.5 px-2 py-0.5 text-[10px]">
          Batting
        </BrutalBadge>
      )}
      <span className="font-display text-2xl font-bold text-black">
        {record.runs}
        {record.isOut && <span className="text-base text-black/40">*out</span>}
      </span>
    </div>
  );
}
