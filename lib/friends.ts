// A friend list is just this browser's own local address book - each
// person's saved friends live only in their own localStorage, not synced
// anywhere. Two people "become friends" by each saving the other's
// username; there's no mutual confirmation step, same as saving a phone
// number.
export interface Friend {
  username: string;
  nickname: string;
}

const STORAGE_KEY = "hc-omegle-friends";

export function loadFriends(): Friend[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Friend =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as Friend).username === "string" &&
        typeof (f as Friend).nickname === "string"
    );
  } catch {
    return [];
  }
}

function persist(friends: Friend[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(friends));
}

export function addFriend(friends: Friend[], username: string, nickname: string): Friend[] {
  if (friends.some((f) => f.username === username)) return friends;
  const next = [...friends, { username, nickname: nickname.trim() || username }];
  persist(next);
  return next;
}

export function removeFriend(friends: Friend[], username: string): Friend[] {
  const next = friends.filter((f) => f.username !== username);
  persist(next);
  return next;
}
