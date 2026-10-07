// A friend list lives in the signed-in account (hc_friendships), so it
// follows a person to any browser. Adding someone is one-way, like saving a
// phone number: it needs no confirmation from them. The username has to
// belong to a real account, which is what makes a typo or a made-up name
// fail instead of silently saving a dead entry.
import { supabase } from "./supabase";

export interface Friend {
  username: string;
  nickname: string;
}

export type AddFriendResult = "ok" | "not-found" | "error";

export async function loadFriends(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from("hc_friendships")
    .select("nickname, friend:hc_profiles!hc_friendships_friend_id_fkey(username, name)")
    .eq("user_id", userId)
    .order("created_at");
  if (error || !data) {
    console.warn("Could not load friends", error);
    return [];
  }
  return data.flatMap((row) => {
    const friend = Array.isArray(row.friend) ? row.friend[0] : row.friend;
    return friend ? [{ username: friend.username, nickname: row.nickname || friend.name || friend.username }] : [];
  });
}

export async function addFriend(
  userId: string,
  username: string,
  nickname: string
): Promise<AddFriendResult> {
  const { data: profile, error: lookupError } = await supabase
    .from("hc_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (lookupError) return "error";
  if (!profile) return "not-found";

  const { error } = await supabase.from("hc_friendships").upsert({
    user_id: userId,
    friend_id: profile.id,
    nickname: nickname.trim(),
  });
  return error ? "error" : "ok";
}

export async function removeFriend(userId: string, username: string): Promise<void> {
  const { data: profile } = await supabase
    .from("hc_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return;
  await supabase
    .from("hc_friendships")
    .delete()
    .eq("user_id", userId)
    .eq("friend_id", profile.id);
}

/** Wins, losses and ties against one opponent, from this player's side. */
export interface WinLoss {
  wins: number;
  losses: number;
  ties: number;
}

/** The player's record against every opponent they have finished a friend
 *  match with, keyed by the opponent's username. */
export async function loadRecords(userId: string): Promise<Record<string, WinLoss>> {
  const { data, error } = await supabase
    .from("hc_results")
    .select("result, opponent:hc_profiles!hc_results_opponent_id_fkey(username)")
    .eq("user_id", userId);
  if (error || !data) {
    console.warn("Could not load records", error);
    return {};
  }
  const records: Record<string, WinLoss> = {};
  for (const row of data) {
    const opponent = Array.isArray(row.opponent) ? row.opponent[0] : row.opponent;
    if (!opponent) continue;
    const entry = (records[opponent.username] ??= { wins: 0, losses: 0, ties: 0 });
    if (row.result === "win") entry.wins += 1;
    else if (row.result === "loss") entry.losses += 1;
    else entry.ties += 1;
  }
  return records;
}

/** Saves one finished match from this player's side. Returns whether it stuck. */
export async function saveResult(
  userId: string,
  opponentUsername: string,
  result: "win" | "loss" | "tie",
  myRuns: number,
  theirRuns: number
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("hc_profiles")
    .select("id")
    .eq("username", opponentUsername)
    .maybeSingle();
  if (!profile) return false;
  const { error } = await supabase.from("hc_results").insert({
    user_id: userId,
    opponent_id: profile.id,
    result,
    my_runs: myRuns,
    their_runs: theirRuns,
  });
  return !error;
}
