// Friendship needs both people to agree. Adding someone sends them a request
// (a pending hc_friendships row, user_id asking friend_id). They only become
// friends once the person asked accepts, and only friends can invite each
// other to play. The username has to belong to a real account, which is what
// makes a typo or a made-up name fail instead of silently saving a dead entry.
import { supabase } from "./supabase";

export interface Friend {
  username: string;
  nickname: string;
}

/** A request from someone else that is waiting on this player. */
export interface FriendRequest {
  username: string;
  name: string;
}

export interface FriendLists {
  friends: Friend[];
  /** Requests this player has received and not yet answered. */
  incoming: FriendRequest[];
  /** Usernames this player has asked and who have not answered yet. */
  outgoing: string[];
}

export type AddFriendResult =
  | "ok"
  | "accepted"
  | "already-friends"
  | "already-requested"
  | "not-found"
  | "error";

interface PersonRow {
  username: string;
  name: string;
}

const pick = (value: PersonRow | PersonRow[] | null): PersonRow | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

export async function loadFriendLists(userId: string): Promise<FriendLists> {
  const { data, error } = await supabase
    .from("hc_friendships")
    .select(
      "user_id, status, requester:hc_profiles!hc_friendships_user_id_fkey(username, name), addressee:hc_profiles!hc_friendships_friend_id_fkey(username, name)"
    )
    .order("created_at");
  if (error || !data) {
    console.warn("Could not load friends", error);
    return { friends: [], incoming: [], outgoing: [] };
  }
  const lists: FriendLists = { friends: [], incoming: [], outgoing: [] };
  for (const row of data) {
    const requester = pick(row.requester);
    const addressee = pick(row.addressee);
    const iAsked = row.user_id === userId;
    const other = iAsked ? addressee : requester;
    if (!other) continue;
    if (row.status === "accepted") {
      lists.friends.push({ username: other.username, nickname: other.name || other.username });
    } else if (iAsked) {
      lists.outgoing.push(other.username);
    } else {
      lists.incoming.push({ username: other.username, name: other.name || other.username });
    }
  }
  return lists;
}

async function profileId(username: string): Promise<string | null | "error"> {
  const { data, error } = await supabase
    .from("hc_profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (error) return "error";
  return data?.id ?? null;
}

/** Sends a friend request. If they had already asked this player, that
 *  request is accepted instead, so two people adding each other just works. */
export async function addFriend(userId: string, username: string): Promise<AddFriendResult> {
  const otherId = await profileId(username);
  if (otherId === "error") return "error";
  if (!otherId) return "not-found";

  const { data: existing, error: existingError } = await supabase
    .from("hc_friendships")
    .select("user_id, status")
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${userId})`
    )
    .maybeSingle();
  if (existingError) return "error";
  if (existing) {
    if (existing.status === "accepted") return "already-friends";
    if (existing.user_id === userId) return "already-requested";
    return (await acceptRequest(userId, username)) ? "accepted" : "error";
  }

  const { error } = await supabase
    .from("hc_friendships")
    .insert({ user_id: userId, friend_id: otherId, status: "pending" });
  return error ? "error" : "ok";
}

/** Accepts a request someone sent to this player. */
export async function acceptRequest(userId: string, fromUsername: string): Promise<boolean> {
  const fromId = await profileId(fromUsername);
  if (!fromId || fromId === "error") return false;
  const { error } = await supabase
    .from("hc_friendships")
    .update({ status: "accepted" })
    .eq("user_id", fromId)
    .eq("friend_id", userId)
    .eq("status", "pending");
  return !error;
}

/** Removes a friend, declines their request, or cancels this player's own
 *  request - whichever row exists between the two of them. */
export async function removeFriend(userId: string, username: string): Promise<void> {
  const otherId = await profileId(username);
  if (!otherId || otherId === "error") return;
  await supabase
    .from("hc_friendships")
    .delete()
    .or(
      `and(user_id.eq.${userId},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${userId})`
    );
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
