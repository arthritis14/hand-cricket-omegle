"use client";

import { useEffect } from "react";
import { supabase, authConfigured } from "./supabase";

// Feeds the owner's admin page (/admin). It only records that a signed-in
// player has the page open and whether they are mid-match, plus one row per
// game. Nothing here can affect play: every call is fire-and-forget and
// failures are ignored.

export type PlayMode = "stranger" | "computer" | "friend";

const BEAT_MS = 60_000;

/** Maps the page's GameMode onto the three kinds the admin page reports. */
export function toPlayMode(mode: string | null): PlayMode | null {
  if (mode === "stranger" || mode === "computer") return mode;
  if (mode === "private-host" || mode === "private-guest") return "friend";
  return null;
}

/** Says "this player is here" once a minute while the tab is visible, and
 *  immediately whenever the player or their match state changes. */
export function useActivity(userId: string | null, matchMode: PlayMode | null) {
  useEffect(() => {
    if (!authConfigured || !userId) return;
    const beat = () => {
      if (document.hidden) return;
      // last_seen_at is stamped by the database, not this browser's clock.
      void supabase
        .from("hc_activity")
        .upsert(
          { user_id: userId, in_match: matchMode !== null, match_mode: matchMode },
          { onConflict: "user_id" }
        )
        .then(() => {}, () => {});
    };
    beat();
    const id = setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [userId, matchMode]);
}

/** Records that a game has begun and returns its id, for logGameFinish. */
export function logGameStart(userId: string, mode: PlayMode): string {
  const id = crypto.randomUUID();
  void supabase
    .from("hc_game_log")
    .insert({ id, user_id: userId, mode })
    .then(() => {}, () => {});
  return id;
}

export function logGameFinish(id: string) {
  void supabase
    .from("hc_game_log")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", id)
    .then(() => {}, () => {});
}
