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
