import { createClient } from "@supabase/supabase-js";

// The admin page uses the shared password, not a Supabase login, so this
// client keeps no session and never touches the player account in this browser.
export const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "missing-key",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export interface AdminStats {
  generated_at: string;
  timezone: string;
  players_total: number;
  signups: { d1: number; d7: number; d30: number };
  tracking_since: string | null;
  active: { online: number; d1: number; d7: number; d30: number; tracked: number };
  playing_now: { total: number; stranger: number; computer: number; friend: number };
  games: Record<"d1" | "d7" | "d30" | "all", { started: number; finished: number; computer: number }>;
  game_modes_30d: Partial<Record<"stranger" | "computer" | "friend", number>>;
  players_who_played: { d1: number; d7: number; d30: number; all: number };
  saved_friend_results: { d7: number; d30: number; all: number };
  friendships: { accepted: number; pending: number };
  players_with_friend: number;
  cohort_30d: { signed_up: number; played: number; came_back: number };
  daily: { day: string; signups: number; games: number; players: number }[];
  by_hour: { hour: number; games: number }[];
  recent_signups: { username: string; name: string; created_at: string; last_seen: string | null }[];
  top_players: { username: string; games: number }[];
}
