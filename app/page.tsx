"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconHandStop,
  IconLock,
  IconRobot,
  IconTrophy,
  IconUserPlus,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { VideoTile } from "@/components/VideoTile";
import { Countdown } from "@/components/Countdown";
import { Scoreboard } from "@/components/Scoreboard";
import { HeroHands } from "@/components/HeroHands";
import { usePeerRoom, LOBBY_HOST_ID, type RoomStrategy } from "@/lib/usePeerRoom";
import { useHandDetector } from "@/lib/handDetector";
import { computerThrow, computerSideChoice } from "@/lib/computerOpponent";
import { roomIdFromCode } from "@/lib/roomCode";
import { normalizeUsername, isValidUsername } from "@/lib/username";
import { loadFriends, addFriend, removeFriend, type Friend } from "@/lib/friends";
import { useAuth } from "@/lib/useAuth";
import { usePresenceHub, type FriendStatus } from "@/lib/usePresenceHub";
import type { GameMessage } from "@/lib/messages";
import {
  applySideChoice,
  beginTossThrow,
  createInitialState,
  currentBatter,
  nextBall,
  other,
  resolveThrow,
  startSecondInnings,
  type GameState,
  type Role,
} from "@/lib/gameEngine";

const COUNTDOWN_MS = 3000; // 3, 2, 1
const RESULT_PAUSE_MS = 2400;
// How long the innings break waits for both players to press Continue.
const BREAK_PAUSE_MS = 10000;
const SELF_LABEL = "You";
// How far back the throw instant looks for the number being held up.
const READING_WINDOW_MS = 600;

/** The most common number seen over the last few frames (latest wins a
 * tie). One mis-read frame at the moment of the throw can no longer turn a
 * held-up 4 into a 0 - and a hand that briefly dropped out of detection
 * still counts if it was seen a moment ago. */
function steadiestRecentReading(readings: { at: number; count: number }[]): number | null {
  const now = performance.now();
  const tally = new Map<number, number>();
  let best: number | null = null;
  for (const r of readings) {
    if (now - r.at > READING_WINDOW_MS) continue;
    const n = (tally.get(r.count) ?? 0) + 1;
    tally.set(r.count, n);
    if (best === null || n >= (tally.get(best) ?? 0)) best = r.count;
  }
  return best;
}

// One stroke weight for every icon on the site, set here rather than per
// use so nothing drifts thinner than the 3px borders around it.
const ICON_STROKE = 2.4;

// The illustrations. Generated for this site rather than stock, so the
// palette in globals.css and the art are sampled from each other.
const ART_EMPTY_GULLY =
  "https://cdn.gamma.app/hc6lzg3dk8ql7jy/design-anything/eO4ws510oCtZ7mzWfFfI3/E0sh_gQAEkLmwfFupw6iv.jpg";

// The three ways to play. "stranger" and the two "private-*" modes are
// real peer-to-peer matches over video; "computer" never talks to another
// person at all - see usePeerRoom's "solo" strategy.
type GameMode = "stranger" | "computer" | "private-host" | "private-guest";

// What the pre-game "menu" card is currently showing. Only relevant before
// a mode has actually been picked and `started` flips true.
type HomeView = "menu" | "login" | "private-hub";

export default function HomePage() {
  // Nothing touches the camera or the matchmaking lobby until this is
  // true. Landing on a mode-select screen first (instead of grabbing the
  // camera and claiming a matchmaking slot the instant the page loads)
  // means a link preview, an accidental double-open, or a stray
  // background tab can't silently occupy a slot.
  const [started, setStarted] = useState(false);
  const [homeView, setHomeView] = useState<HomeView>("menu");
  const [mode, setMode] = useState<GameMode | null>(null);
  // The private room's own internal ID - generated the moment an invite
  // is sent (see usePresenceHub's sendInvite) so both sides derive the
  // same PeerJS room ID from it (see roomIdFromCode). Never typed by a
  // person; invites carry it automatically now that friends are added by
  // username.
  const [roomCode, setRoomCode] = useState("");

  // The Private Match hub needs a real account: sign in (Google or email),
  // then pick a unique username. The friend list is stored against the
  // account, so it follows the person to any browser.
  const auth = useAuth();
  const username = auth.username;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  // What the person clicked on the home screen before being asked to create
  // a profile - once they have one, they carry on to it.
  const [pendingMode, setPendingMode] = useState<"stranger" | "computer" | "friends" | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [friendUsernameInput, setFriendUsernameInput] = useState("");
  const [friendNicknameInput, setFriendNicknameInput] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);

  // Pulls the signed-in account's friend list. Synchronizing with an
  // external store (the database), not derived state.
  useEffect(() => {
    if (auth.status !== "ready" || !auth.userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFriends([]);
      return;
    }
    let cancelled = false;
    loadFriends(auth.userId).then((list) => {
      if (!cancelled) setFriends(list);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.userId]);

  // Every entry point on the home screen goes through here. A returning
  // browser already has a name and username, so it walks straight in; a
  // new one is asked to create them first, then carries on to what it
  // clicked.
  const enter = (target: "stranger" | "computer" | "friends") => {
    if (auth.status === "ready") {
      proceed(target);
    } else {
      setPendingMode(target);
      setHomeView("login");
    }
  };

  // `justCreated`: a brand new profile has no friends yet, so before a
  // stranger match it gets the add-friend screen once (it has a skip).
  const proceed = (target: "stranger" | "computer" | "friends", justCreated = false) => {
    if (target === "friends" || (justCreated && target === "stranger")) {
      setPendingMode(target === "friends" ? null : target);
      setHomeView("private-hub");
      return;
    }
    setPendingMode(null);
    setMode(target);
    setStarted(true);
  };

  // Once the profile exists, a pending "create your name" screen moves on
  // to whatever was clicked.
  useEffect(() => {
    if (homeView === "login" && auth.status === "ready") {
      proceed(pendingMode ?? "friends", true);
    }
    // proceed only reads state that is current whenever this fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeView, auth.status]);

  // Only claims a presence beacon and polls friends while someone's
  // actually looking at this screen - not from the moment the app loads,
  // and not once a match has actually started.
  const presence = usePresenceHub({
    enabled: homeView === "private-hub" && !started,
    username,
    friends,
  });

  const handleClaimUsername = async () => {
    const name = normalizeUsername(usernameInput);
    if (!isValidUsername(name) || nameInput.trim().length < 2) return;
    setClaiming(true);
    setUsernameError(null);
    const result = await auth.claimUsername(name, nameInput);
    setClaiming(false);
    if (result === "username-taken") setUsernameError("That username is taken. Try another.");
    else if (result === "name-taken") setUsernameError("Someone already has that name. Try another.");
    else if (result === "signups-off")
      setUsernameError("Sign-ups are switched off on the server. Enable anonymous sign-ins in Supabase.");
    else if (result === "error") setUsernameError("Could not save that. Check your connection.");
  };

  // Once either side accepts an invite, both sides land here with the
  // same room code and complementary roles - from this point on it's the
  // exact same private-room flow as the manual one-time-code path below.
  useEffect(() => {
    if (!presence.accepted) return;
    // Bridging a result from the presence hook (an external subscription)
    // into this component's own room-selection state - same shape as the
    // "lobby -> toss-call" transition further down, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoomCode(presence.accepted.roomCode);
    setMode(presence.accepted.role === "host" ? "private-host" : "private-guest");
    setStarted(true);
  }, [presence.accepted]);

  const handleAddFriend = async () => {
    const name = normalizeUsername(friendUsernameInput);
    if (!auth.userId || !isValidUsername(name) || name === username) return;
    setFriendError(null);
    const result = await addFriend(auth.userId, name, friendNicknameInput);
    if (result === "not-found") {
      setFriendError("Nobody has that name.");
    } else if (result === "error") {
      setFriendError("Could not add them. Try again.");
    } else {
      setFriends(await loadFriends(auth.userId));
      setFriendUsernameInput("");
      setFriendNicknameInput("");
    }
  };

  const handleRemoveFriend = async (name: string) => {
    if (!auth.userId) return;
    setFriends((f) => f.filter((x) => x.username !== name));
    await removeFriend(auth.userId, name);
  };

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const startEditing = () => {
    setEditName(auth.name ?? "");
    setEditUsername(username ?? "");
    setEditError(null);
    setEditing(true);
  };

  const handleSaveProfile = async () => {
    const nextUsername = normalizeUsername(editUsername);
    if (!isValidUsername(nextUsername) || editName.trim().length < 2) return;
    const result = await auth.updateProfile(nextUsername, editName);
    if (result === "ok") setEditing(false);
    else if (result === "username-taken") setEditError("That username is taken.");
    else if (result === "name-taken") setEditError("Someone already has that name.");
    else setEditError("Could not save that. Try again.");
  };

  const handleCopyUsername = () => {
    if (!username) return;
    navigator.clipboard?.writeText(username).catch(() => {});
  };

  // Backs out of whatever screen we're on and returns to the mode-select
  // menu. For an in-progress match attempt (waiting/connecting/error/
  // opponent-left) this relies on usePeerRoom's own enabled-gated cleanup
  // (flipping `started` false tears down the peer and camera), same as a
  // fresh page load would, but without the reload.
  const leaveToMenu = () => {
    setStarted(false);
    setMode(null);
    setHomeView("menu");
  };

  const PEER_LABEL =
    mode === "computer" ? "Computer" : mode === "stranger" ? "Stranger" : "Friend";

  const [game, setGame] = useState<GameState>(createInitialState());

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const countdownSentForSeqRef = useRef<number | null>(null);
  const capturedForSeqRef = useRef<number | null>(null);
  // Real state (not a ref) because the "both ready" check needs to
  // re-run its effect whenever the peer's ready seq changes, including
  // when it arrives after we're already sitting in throw-ready.
  const [peerReadySeq, setPeerReadySeq] = useState<number | null>(null);
  // Which ball (seq) each side pressed "Continue" on during the innings
  // break. Keyed by seq so a press can never leak into a later break.
  const [selfContinuedSeq, setSelfContinuedSeq] = useState<number | null>(null);
  const [peerContinuedSeq, setPeerContinuedSeq] = useState<number | null>(null);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(BREAK_PAUSE_MS / 1000);
  // The computer's most recent throw, for the vs-computer opponent tile -
  // there's no video to reveal it, so we just show the number once it's
  // been thrown.
  const [computerLastThrow, setComputerLastThrow] = useState<number | null>(null);

  // These two hold in-flight throw values across the async
  // capture -> send sequence. They don't drive rendering themselves
  // (the phase state does), so refs are the right tool rather than
  // more state.
  const ownThrowRef = useRef<number | null>(null);
  const peerThrowRef = useRef<{ seq: number; value: number } | null>(null);

  // handleMessage is passed into usePeerRoom, which is what actually
  // determines `role` - so `role` isn't available yet at the point
  // handleMessage is defined. We bridge that with a ref kept in sync via
  // effect (after render, not during) rather than a dependency, same
  // idiom as onMessageRef inside usePeerRoom itself.
  const roleForResolveRef = useRef<Role | null>(null);
  const rttRef = useRef<number | null>(null);

  const handleMessage = useCallback((msg: GameMessage) => {
    switch (msg.type) {
      case "toss-call":
        setGame((s) => beginTossThrow(s, msg.call));
        break;
      case "ready":
        setPeerReadySeq(msg.seq);
        break;
      case "continue":
        setPeerContinuedSeq(msg.seq);
        break;
      case "start-countdown": {
        // leadMs is "how long from now", so the two devices' clocks never
        // have to agree - only the (measured) trip time is subtracted.
        const startsAt = Date.now() + Math.max(0, msg.leadMs - (rttRef.current ?? 0) / 2);
        setGame((s) => ({ ...s, phase: "throw-countdown", countdownStartsAt: startsAt }));
        break;
      }
      case "throw":
        setGame((s) => {
          // If we've already captured and confirmed our own value for
          // this ball, resolve immediately. Otherwise stash it - our
          // own capture flow will resolve once it locks in.
          peerThrowRef.current = { seq: msg.seq, value: msg.value };
          const role = roleForResolveRef.current;
          if (role && capturedForSeqRef.current === msg.seq && ownThrowRef.current !== null) {
            return resolveThrow(s, role, ownThrowRef.current, msg.value);
          }
          return s;
        });
        break;
      case "choose-side":
        setGame((s) => applySideChoice(s, msg.choice));
        break;
      default:
        break;
    }
  }, []);

  // How this session rendezvouses, and with whom - one per mode. Vs
  // computer never touches PeerJS at all ("solo"); the other three each
  // map onto a room ID: the shared public lobby, or a private room's code.
  const strategy: RoomStrategy =
    mode === "computer"
      ? "solo"
      : mode === "private-host"
        ? "host"
        : mode === "private-guest"
          ? "guest"
          : "lobby";
  const roomId =
    mode === "private-host" || mode === "private-guest"
      ? roomIdFromCode(roomCode)
      : LOBBY_HOST_ID;

  const { status, role, localStream, remoteStream, error, rtt, sendMessage } = usePeerRoom({
    onMessage: handleMessage,
    enabled: started,
    strategy,
    roomId,
  });
  useEffect(() => {
    roleForResolveRef.current = role;
  });

  useEffect(() => {
    rttRef.current = rtt;
  });

  const { ready: detectorReady, detect } = useHandDetector(started);

  // Run hand detection continuously (not just once per throw) once the
  // local camera and detector are both ready. Two reasons: it gives
  // MediaPipe's VIDEO-mode tracker a steady stream of frames to track
  // against instead of cold-starting on a single call, which is far more
  // reliable - and it lets us show live "can it see my hand" feedback,
  // so a miss is obvious immediately instead of only after a throw.
  const liveDetectionRef = useRef<{ count: number | null }>({ count: null });
  // Recent readings, so the throw instant can ignore a single flickered or
  // missed frame instead of locking in whatever the very last frame said.
  const recentReadingsRef = useRef<{ at: number; count: number }[]>([]);
  const [liveHandCount, setLiveHandCount] = useState<number | null>(null);
  useEffect(() => {
    if (!detectorReady) return;
    let rafId: number;
    const loop = () => {
      const video = localVideoRef.current;
      if (video) {
        const result = detect(video);
        liveDetectionRef.current = result;
        if (result.count !== null) {
          const now = performance.now();
          const recent = recentReadingsRef.current;
          recent.push({ at: now, count: result.count });
          while (recent.length > 0 && now - recent[0].at > READING_WINDOW_MS) recent.shift();
        }
        setLiveHandCount(result.count);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [detectorReady, detect]);

  // Kick the game off (lobby -> toss-call) once we're ready to play -
  // either the data channel is up (a real peer), or the camera's ready
  // and there's no opponent to wait on at all (vs computer).
  useEffect(() => {
    if (status === "connected") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGame((s) => (s.phase === "lobby" ? { ...s, phase: "toss-call" } : s));
    }
  }, [status]);

  // Auto-"ready" whenever we enter throw-ready. Depends on peerReadySeq
  // (real state) as well as game.phase/seq, so this correctly re-runs
  // both when we arrive in throw-ready AND when the peer's ready message
  // arrives after we're already there - either order works.
  useEffect(() => {
    if (game.phase !== "throw-ready") return;
    if (capturedForSeqRef.current !== game.seq) {
      // Not a React Compiler project (--no-react-compiler at scaffold),
      // so these plain ref resets for a fresh throw are safe and
      // intentional; the compiler-oriented lint rule doesn't have a
      // clean idiom for this outside of disabling it here.

      ownThrowRef.current = null;
      capturedForSeqRef.current = null;
    }

    if (mode === "computer") {
      // No peer to wait on - the computer is always instantly "ready",
      // so just start the countdown ourselves the moment we get here.
      if (countdownSentForSeqRef.current !== game.seq) {
        countdownSentForSeqRef.current = game.seq;
        const startsAt = Date.now() + 900;
        setGame((s) =>
          s.phase === "throw-ready" ? { ...s, phase: "throw-countdown", countdownStartsAt: startsAt } : s
        );
      }
      return;
    }

    sendMessage({ type: "ready", seq: game.seq });

    const bothReady = peerReadySeq === game.seq;
    if (bothReady && role === "host" && countdownSentForSeqRef.current !== game.seq) {
      countdownSentForSeqRef.current = game.seq;
      // The guest's countdown only starts once this message has actually
      // arrived, so the lead time has to comfortably outlast the trip
      // over to them. Size it off the measured round-trip time (with a
      // safety multiplier for jitter) instead of a flat guess, so a
      // laggy connection doesn't clip the countdown - and a fast one
      // doesn't sit around waiting longer than it needs to.
      const lead = rtt ? Math.min(3000, Math.max(500, rtt * 1.5 + 300)) : 900;
      const startsAt = Date.now() + lead;
      sendMessage({ type: "start-countdown", seq: game.seq, leadMs: lead });

      setGame((s) => (s.phase === "throw-ready" ? { ...s, phase: "throw-countdown", countdownStartsAt: startsAt } : s));
    }
  }, [game.phase, game.seq, mode, peerReadySeq, role, rtt, sendMessage]);

  // null until the shared start instant arrives, so the previous throw's
  // "1" never lingers on screen while the next countdown is still waiting.
  const [countdownLabel, setCountdownLabel] = useState<string | null>(null);

  // Drive the synced countdown, then capture a frame at the shared throw
  // instant.
  useEffect(() => {
    if (game.phase !== "throw-countdown" || !game.countdownStartsAt) return;
    const startsAt = game.countdownStartsAt;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (delay: number, fn: () => void) =>
      timers.push(setTimeout(fn, Math.max(0, delay)));

    schedule(startsAt - Date.now(), () => setCountdownLabel("3"));
    schedule(startsAt - Date.now() + 1000, () => setCountdownLabel("2"));
    schedule(startsAt - Date.now() + 2000, () => setCountdownLabel("1"));
    schedule(startsAt - Date.now() + COUNTDOWN_MS, () => {
      setGame((s) => (s.phase === "throw-countdown" ? { ...s, phase: "throw-capture" } : s));
    });

    return () => {
      timers.forEach(clearTimeout);
      setCountdownLabel(null);
    };
  }, [game.phase, game.countdownStartsAt]);

  const lockInThrow = useCallback(
    (value: number) => {
      if (!role) return;
      const clamped = Math.max(0, Math.min(6, value));
      ownThrowRef.current = clamped;

      if (mode === "computer") {
        // No peer to wait on - the computer's throw is generated locally,
        // at the same instant, and resolved immediately. The human is
        // always "guest" in this mode (see the "solo" strategy), so the
        // computer stands in for "host".
        const compValue = computerThrow();
        setComputerLastThrow(compValue);
        setGame((s) => resolveThrow(s, role, clamped, compValue));
        return;
      }

      sendMessage({ type: "throw", seq: game.seq, value: clamped });

      const buffered = peerThrowRef.current;
      if (buffered && buffered.seq === game.seq) {
        setGame((s) => resolveThrow(s, role, clamped, buffered.value));
      }
    },
    [game.seq, mode, role, sendMessage]
  );

  // At the throw instant, use the most recent reading from the
  // continuous detection loop above - it's already been tracking your
  // hand for many frames by this point, which reads far more reliably
  // than asking MediaPipe to detect from a cold start on a single frame.
  useEffect(() => {
    if (game.phase !== "throw-capture") return;
    if (capturedForSeqRef.current === game.seq) return;
    capturedForSeqRef.current = game.seq;

    // Numbers here run 0-6 (hand cricket, not a plain finger count: a
    // flat fist is a legitimate 0) - if no hand was seen at all, default
    // to 0 rather than inventing a throw.
    lockInThrow(steadiestRecentReading(recentReadingsRef.current) ?? 0);
  }, [game.phase, game.seq, lockInThrow]);

  // Auto-advance through result/break screens - both sides hold identical
  // state at this point so no extra message is needed to stay in sync.
  useEffect(() => {
    if (game.phase === "ball-result") {
      const t = setTimeout(() => setGame((s) => nextBall(s)), RESULT_PAUSE_MS);
      return () => clearTimeout(t);
    }
    if (game.phase === "toss-result") {
      const t = setTimeout(
        () => setGame((s) => ({ ...s, phase: "choose-side" })),
        RESULT_PAUSE_MS
      );
      return () => clearTimeout(t);
    }
  }, [game.phase]);

  // Innings break: the second innings starts when both players have pressed
  // Continue, or when the clock runs out - whichever comes first. The
  // computer always "continues" instantly.
  useEffect(() => {
    if (game.phase !== "innings-break") return;
    const startedAt = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBreakSecondsLeft(BREAK_PAUSE_MS / 1000);
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((BREAK_PAUSE_MS - (Date.now() - startedAt)) / 1000));
      setBreakSecondsLeft(left);
    }, 250);
    const timeout = setTimeout(() => setGame((s) => startSecondInnings(s)), BREAK_PAUSE_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(timeout);
    };
  }, [game.phase]);

  useEffect(() => {
    if (game.phase !== "innings-break") return;
    const selfDone = selfContinuedSeq === game.seq;
    const peerDone = mode === "computer" || peerContinuedSeq === game.seq;
    // Reacting to the peer's message arriving (external), not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selfDone && peerDone) setGame((s) => startSecondInnings(s));
  }, [game.phase, game.seq, mode, selfContinuedSeq, peerContinuedSeq]);

  const handleContinue = () => {
    setSelfContinuedSeq(game.seq);
    sendMessage({ type: "continue", seq: game.seq });
  };

  const handleTossCall = (call: "odd" | "even") => {
    setGame((s) => beginTossThrow(s, call));
    sendMessage({ type: "toss-call", call });
  };

  const handleChooseSide = useCallback(
    (choice: "bat" | "bowl") => {
      setGame((s) => applySideChoice(s, choice));
      sendMessage({ type: "choose-side", choice });
    },
    [sendMessage]
  );

  // In computer mode the human is always "guest" (see the "solo"
  // strategy), so the computer stands in for "host" - when it wins the
  // toss, it has to pick bat/bowl itself after a short beat, since
  // there's no one else to click the button.
  useEffect(() => {
    if (mode !== "computer") return;
    if (game.phase !== "choose-side" || game.tossWinner !== "host") return;
    const t = setTimeout(() => handleChooseSide(computerSideChoice()), 900);
    return () => clearTimeout(t);
  }, [mode, game.phase, game.tossWinner, handleChooseSide]);

  const batter = role ? currentBatter(game) : null;
  const isSelfBatting = role !== null && batter === role;
  const opponentRole: Role | null = role ? other(role) : null;

  // The opponent's camera is the one place someone could cheat: the raw
  // feed is right there, so a player could wait to see what the other
  // person's hand is showing and copy it before locking in. Dropping the
  // sightscreen over their tile for the whole throw window - from the
  // 3-2-1 through the lock-in - closes that off. No such risk against the
  // computer (it never had a camera to peek at), so it stays up there.
  const shuttered =
    mode !== "computer" &&
    (game.phase === "throw-countdown" || game.phase === "throw-capture");
  const shutterReason =
    game.phase === "throw-countdown"
      ? "Up until the throw"
      : "Up until you both lock in";

  // --- Render states ---

  if (!started && homeView === "menu") {
    return (
      <>
        <div className="gc-stadium" aria-hidden="true" />
        <div className="gc-page gc-home">
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className="gc-hero">
              <div className="gc-stagger flex flex-col items-start gap-5">
                <h1 className="nb-title">
                  <span className="nb-title-line">Hand</span>
                  <span className="nb-title-line">Cricket</span>
                  <span className="nb-title-line">Omegle</span>
                </h1>

                <p className="nb-lede">
                  Get matched with a stranger. Throw your hand at the camera.
                  The site does the umpiring.
                </p>

                <div className="nb-menu">
                  <button className="nb-btn nb-btn--yellow" onClick={() => enter("friends")}>
                    <IconLock size={26} stroke={ICON_STROKE} />
                    Play a friend
                    <span className="nb-btn-arrow"><IconArrowRight size={22} stroke={ICON_STROKE} /></span>
                  </button>
                  <button className="nb-btn nb-btn--pink" onClick={() => enter("stranger")}>
                    <IconWorld size={26} stroke={ICON_STROKE} />
                    Play a stranger
                    <span className="nb-btn-arrow"><IconArrowRight size={22} stroke={ICON_STROKE} /></span>
                  </button>
                  <button className="nb-btn nb-btn--green" onClick={() => enter("computer")}>
                    <IconRobot size={26} stroke={ICON_STROKE} />
                    Play the computer
                    <span className="nb-btn-arrow"><IconArrowRight size={22} stroke={ICON_STROKE} /></span>
                  </button>
                  <button className="nb-btn nb-btn--sm" onClick={() => enter("friends")}>
                    <IconUserPlus size={16} stroke={ICON_STROKE} />
                    Add friends
                  </button>
                </div>
              </div>

              <HeroHands />
            </div>
          </div>

          <p className="gc-credit mt-6 mb-3 text-center">
            A Vilicon Salley Production
          </p>
        </div>

        <div className="gc-ticker">
          <div className="gc-ticker-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div className="flex" key={copy}>
                <span>Odd or even</span>
                <span>Your camera is the umpire</span>
                <span>Six and out</span>
                <span>No sign up</span>
                <span>One ball at a time</span>
              </div>
            ))}
          </div>
        </div>
        </div>
      </>
    );
  }

  if (!started) {
    return (
      <>
        <div className="gc-ground gc-ground--cream" />
        <BackButton onClick={() => { setPendingMode(null); setHomeView("menu"); }} />
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className="gc-win gc-enter w-full max-w-md">
              <div className="gc-win-bar">
                <span className="gc-win-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="gc-win-title">{homeView === "login" ? "Create your name" : "Add friends"}</span>
              </div>

              <div className="flex flex-col gap-4 p-4">
                {homeView === "login" && auth.status === "loading" && (
                  <p className="gc-lede">One moment</p>
                )}

                {homeView === "login" && auth.status !== "loading" && (
                  <>
                    <h1 className="gc-display gc-display--sm">Create your name</h1>
                    <div className="gc-panel gc-panel--lime">
                      <p className="gc-label">Your name</p>
                      <input
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="Arth"
                        maxLength={20}
                        className="gc-input mb-3"
                      />
                      <p className="gc-label">Your username</p>
                      <input
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(normalizeUsername(e.target.value))}
                        placeholder="yourname"
                        maxLength={16}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="gc-input"
                      />
                      <button
                        className="gc-btn gc-btn--red mt-3 w-full"
                        disabled={!isValidUsername(usernameInput) || nameInput.trim().length < 2 || claiming}
                        onClick={handleClaimUsername}
                      >
                        {claiming ? "Checking" : "Create"}
                      </button>
                      {usernameError && <p className="gc-error">{usernameError}</p>}
                    </div>
                  </>
                )}

                {homeView === "private-hub" && username && (
                  <>
                    <div className="gc-panel gc-panel--lime">
                      {editing ? (
                        <>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={20}
                            placeholder="your name"
                            className="gc-input mb-2"
                          />
                          <input
                            value={editUsername}
                            onChange={(e) => setEditUsername(normalizeUsername(e.target.value))}
                            maxLength={16}
                            placeholder="username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className="gc-input"
                          />
                          <div className="mt-3 flex gap-2">
                            <button
                              className="gc-btn gc-btn--ink flex-1"
                              disabled={
                                !isValidUsername(normalizeUsername(editUsername)) ||
                                editName.trim().length < 2
                              }
                              onClick={handleSaveProfile}
                            >
                              Save
                            </button>
                            <button className="gc-btn gc-btn--sm" onClick={() => setEditing(false)}>
                              Cancel
                            </button>
                          </div>
                          {editError && <p className="gc-error">{editError}</p>}
                        </>
                      ) : (
                        <>
                          <p className="gc-label">You are {auth.name}</p>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <p className="gc-username">{username}</p>
                            <div className="flex gap-2">
                              <button className="gc-btn gc-btn--sm" onClick={startEditing}>
                                Edit
                              </button>
                              <button className="gc-btn gc-btn--sm" onClick={handleCopyUsername}>
                                <IconCopy size={14} stroke={ICON_STROKE} />
                                Copy
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                      {presence.claimStatus === "taken" && (
                        <p className="gc-error">
                          You are already online in another tab. Invites reach that one.
                        </p>
                      )}
                      {presence.claimStatus === "error" && (
                        <p className="gc-error">
                          Could not go online. Check your connection.
                        </p>
                      )}
                    </div>

                    {presence.incomingInvite && (
                      <div className="gc-panel gc-panel--yellow">
                        <p className="gc-label">Incoming</p>
                        <p className="gc-username mt-1">
                          {presence.incomingInvite.fromUsername}
                        </p>
                        <div className="mt-3 flex gap-3">
                          <button
                            className="gc-btn gc-btn--red flex-1"
                            onClick={presence.acceptInvite}
                          >
                            <IconCheck size={18} stroke={ICON_STROKE} />
                            Play
                          </button>
                          <button
                            className="gc-btn gc-btn--sm"
                            onClick={presence.declineInvite}
                          >
                            <IconX size={14} stroke={ICON_STROKE} />
                            No
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="gc-label">Add a friend</p>
                      <div className="mt-2 flex flex-col gap-2">
                        <input
                          value={friendUsernameInput}
                          onChange={(e) =>
                            setFriendUsernameInput(normalizeUsername(e.target.value))
                          }
                          placeholder="their name"
                          maxLength={16}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          className="gc-input"
                        />
                        <input
                          value={friendNicknameInput}
                          onChange={(e) => setFriendNicknameInput(e.target.value)}
                          placeholder="what you call them (optional)"
                          maxLength={20}
                          className="gc-input"
                        />
                        <button
                          className="gc-btn gc-btn--yellow w-full"
                          disabled={
                            !isValidUsername(normalizeUsername(friendUsernameInput)) ||
                            normalizeUsername(friendUsernameInput) === username
                          }
                          onClick={handleAddFriend}
                        >
                          <IconUserPlus size={18} stroke={ICON_STROKE} />
                          Add
                        </button>
                        {friendError && <p className="gc-error">{friendError}</p>}
                      </div>
                    </div>

                    {pendingMode && (
                      <button
                        className="gc-btn w-full"
                        onClick={() => proceed(pendingMode)}
                      >
                        Skip, just play
                      </button>
                    )}

                    <div>
                      <p className="gc-label">Your list</p>
                      {friends.length === 0 ? (
                        <p className="gc-lede mt-2">
                          Nobody yet. Add someone by the name they picked.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-col gap-2">
                          {friends.map((friend) => (
                            <FriendRow
                              key={friend.username}
                              friend={friend}
                              status={presence.statuses[friend.username] ?? "checking"}
                              outgoingStatus={
                                presence.outgoingInvite?.toUsername === friend.username
                                  ? presence.outgoingInvite.status
                                  : null
                              }
                              onInvite={() => presence.sendInvite(friend.username)}
                              onCancelInvite={presence.cancelOutgoingInvite}
                              onRemove={() => handleRemoveFriend(friend.username)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error || status === "failed") {
    return (
      <>
        <div className="gc-ground gc-ground--cream" />
        <BackButton onClick={leaveToMenu} />
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className="gc-card gc-card--red gc-enter w-full max-w-md">
              <h1 className="gc-display gc-display--sm">Rain stopped play</h1>
              <p className="gc-lede mt-3">{error ?? "Something went wrong."}</p>
              <button
                className="gc-btn gc-btn--yellow mt-5 w-full"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (status === "opponent-left") {
    return (
      <>
        <div className="gc-ground gc-ground--cream" />
        <BackButton onClick={leaveToMenu} />
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className="gc-card gc-card--yellow gc-enter w-full max-w-md">
              <h1 className="gc-display gc-display--sm">They walked off</h1>
              <p className="gc-lede mt-3">
                Your opponent left mid match. Their loss.
              </p>
              <button
                className="gc-btn gc-btn--red mt-5 w-full"
                onClick={() => window.location.reload()}
              >
                Find someone else
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (status !== "connected" || !role || game.phase === "lobby") {
    const waitingForStranger = status === "waiting-for-opponent" && mode === "stranger";
    return (
      <>
        <div className="gc-ground gc-ground--cream" />
        <BackButton onClick={leaveToMenu} />
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className="gc-win gc-enter w-full max-w-md">
              <div className="gc-win-bar">
                <span className="gc-win-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="gc-win-title">{statusTitle(status)}</span>
              </div>

              {waitingForStranger && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ART_EMPTY_GULLY}
                  alt="An empty street cricket pitch with stumps chalked on a wall"
                  className="block w-full border-b-[3px] border-black"
                  style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
                />
              )}

              <div className="p-5 text-center">
                <h1 className="gc-display gc-display--sm">{statusHeading(status)}</h1>
                <p className="gc-lede mx-auto mt-3">{statusBody(status, mode)}</p>
                {status === "waiting-for-opponent" && (
                  <div className="gc-stumps" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="gc-pitch">
        <div className="gc-stumps gc-stumps--top" aria-hidden="true"><b /><b /><b /></div>
        <div className="gc-stumps gc-stumps--bottom" aria-hidden="true"><b /><b /><b /></div>
      </div>
      {game.phase !== "game-over" && <BackButton onClick={leaveToMenu} />}
      <main className="gc-screen-wrap mx-auto w-full max-w-2xl gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="gc-badge gc-badge--lime">
            <IconHandStop size={13} stroke={ICON_STROKE} /> Hand Cricket
          </span>
          {rtt !== null && <span className="gc-badge">{rtt}ms</span>}
        </div>

        <div className="mt-3">
          <Scoreboard state={game} self={role} selfName={SELF_LABEL} peerName={PEER_LABEL} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="relative">
            <VideoTile
              stream={localStream}
              label={SELF_LABEL}
              mirrored
              muted
              tone="self"
              videoRef={localVideoRef}
            />
            {game.phase === "throw-countdown" && countdownLabel && <Countdown label={countdownLabel} />}
            {detectorReady && <HandStatusBadge count={liveHandCount} />}
          </div>
          <VideoTile
            stream={remoteStream}
            label={PEER_LABEL}
            tone="peer"
            shuttered={shuttered}
            shutterReason={shutterReason}
            placeholder={
              mode === "computer" ? <ComputerFace lastValue={computerLastThrow} /> : undefined
            }
          />
        </div>

        <div className="mt-3 flex-1">
          {game.phase === "toss-call" && (
            <div className="gc-phase gc-phase--yellow">
              <h2 className="gc-phase-head">The toss</h2>
              {role === "guest" ? (
                <>
                  <p className="gc-phase-body">Call it before you both throw.</p>
                  <div className="gc-phase-row">
                    <button className="gc-btn gc-btn--red" onClick={() => handleTossCall("odd")}>
                      Odd
                    </button>
                    <button className="gc-btn gc-btn--blue" onClick={() => handleTossCall("even")}>
                      Even
                    </button>
                  </div>
                </>
              ) : (
                <p className="gc-phase-body">
                  {PEER_LABEL} is calling odd or even.
                </p>
              )}
            </div>
          )}

          {(game.phase === "throw-ready" || game.phase === "throw-countdown") && (
            <div className="gc-phase gc-phase--yellow">
              <h2 className="gc-phase-head">
                {game.throwKind === "toss" ? "Toss throw" : "Ball incoming"}
              </h2>
              <p className="gc-phase-body">
                Hand up in frame. The throw happens on one.
              </p>
            </div>
          )}

          {game.phase === "throw-capture" && (
            <div className="gc-phase">
              <h2 className="gc-phase-head">Reading hands</h2>
              <p className="gc-phase-body">Both throws are locked in.</p>
            </div>
          )}

          {game.phase === "toss-result" && game.tossWinner && (
            <div className="gc-phase gc-phase--yellow">
              <h2 className="gc-phase-head">
                {game.tossWinner === role ? "You won the toss" : `${PEER_LABEL} won the toss`}
              </h2>
              <p className="gc-phase-body">
                You threw {game.ownValue}. They threw {game.peerValue}.
              </p>
            </div>
          )}

          {game.phase === "choose-side" && (
            <div className="gc-phase gc-phase--lime">
              <h2 className="gc-phase-head">Bat or bowl</h2>
              {game.tossWinner === role ? (
                <div className="gc-phase-row">
                  <button className="gc-btn gc-btn--red" onClick={() => handleChooseSide("bat")}>
                    Bat
                  </button>
                  <button className="gc-btn gc-btn--blue" onClick={() => handleChooseSide("bowl")}>
                    Bowl
                  </button>
                </div>
              ) : (
                <p className="gc-phase-body">{PEER_LABEL} is choosing.</p>
              )}
            </div>
          )}

          {game.phase === "ball-result" && game.lastBall && (
            <div className={`gc-phase ${game.lastBall.out ? "gc-phase--red" : "gc-phase--yellow"}`}>
              <h2 className="gc-phase-head">{game.lastBall.out ? "Out" : "Runs"}</h2>
              <p className="gc-phase-body">
                Batter {game.lastBall.batterValue}, bowler {game.lastBall.bowlerValue}.
              </p>
              <span className="gc-verdict">
                <span className="gc-verdict-num">
                  {game.lastBall.out ? "0" : `+${game.lastBall.batterValue}`}
                </span>
                <span className="gc-verdict-word">
                  {game.lastBall.out ? "Wicket down" : "On the board"}
                </span>
              </span>
            </div>
          )}

          {game.phase === "game-over" && (
            <GameOverPanel
              winner={game.winner}
              role={role}
              selfRuns={role ? game.innings[role].runs : 0}
              peerRuns={opponentRole ? game.innings[opponentRole].runs : 0}
              peerName={PEER_LABEL}
              onBack={leaveToMenu}
            />
          )}

          {game.phase === "innings-break" && (
            <InningsBreakPanel
              batting={isSelfBatting}
              firstInningsRuns={batter ? game.innings[batter].runs : 0}
              secondsLeft={breakSecondsLeft}
              youContinued={selfContinuedSeq === game.seq}
              peerContinued={mode === "computer" || peerContinuedSeq === game.seq}
              peerName={PEER_LABEL}
              onContinue={handleContinue}
            />
          )}
        </div>
      </main>
    </>
  );
}

/** A single, consistently placed way back, top right on every screen that
 *  needs one, so there is never a dead end only a reload can escape. */
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Back" className="gc-btn gc-btn--sm gc-back">
      <IconArrowLeft size={14} stroke={ICON_STROKE} />
      Back
    </button>
  );
}

function InningsBreakPanel({
  batting,
  firstInningsRuns,
  secondsLeft,
  youContinued,
  peerContinued,
  peerName,
  onContinue,
}: {
  batting: boolean;
  firstInningsRuns: number;
  secondsLeft: number;
  youContinued: boolean;
  peerContinued: boolean;
  peerName: string;
  onContinue: () => void;
}) {
  return (
    <div className="gc-phase gc-phase--yellow">
      <h2 className="gc-phase-head">
        {batting ? "You just got out" : `${peerName} is out`}
      </h2>
      <p className="gc-break-score">
        {batting ? (
          <>
            Your total score is <b>{firstInningsRuns}</b>
          </>
        ) : (
          <>
            You have to chase <b>{firstInningsRuns}</b>
          </>
        )}
      </p>
      <p className="gc-phase-body">
        {batting
          ? `${peerName} needs ${firstInningsRuns + 1} to win.`
          : `Score ${firstInningsRuns + 1} to win, ${firstInningsRuns} to tie.`}
      </p>
      <div className="gc-phase-row mt-3 items-center">
        <button className="gc-btn gc-btn--ink" onClick={onContinue} disabled={youContinued}>
          {youContinued ? "Waiting" : "Continue"}
        </button>
        <span className="gc-badge gc-num">
          {peerContinued ? `${peerName} is ready` : `${secondsLeft}s`}
        </span>
      </div>
    </div>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 20) / 10,
  duration: 2.4 + ((i * 29) % 15) / 10,
  color: ["var(--gc-lime)", "var(--gc-yellow)", "var(--gc-red)", "var(--gc-blue)"][i % 4],
  rotate: (i * 47) % 360,
}));

/** End of match, shown on top of the live video tiles so the cameras and
 *  audio stay on. The winner gets confetti; the loser a flat, drained red.
 *  The match only really ends when someone presses Back. */
function GameOverPanel({
  winner,
  role,
  selfRuns,
  peerRuns,
  peerName,
  onBack,
}: {
  winner: Role | "tie" | null;
  role: Role | null;
  selfRuns: number;
  peerRuns: number;
  peerName: string;
  onBack: () => void;
}) {
  const tie = winner === "tie";
  const won = !tie && winner === role;
  const tone = tie ? "gc-over--tie" : won ? "gc-over--win" : "gc-over--loss";
  return (
    <div className={`gc-over ${tone}`}>
      {won && (
        <div className="gc-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <i
              key={i}
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
                transform: `rotate(${c.rotate}deg)`,
              }}
            />
          ))}
        </div>
      )}
      <span className="gc-badge">
        <IconTrophy size={13} stroke={ICON_STROKE} /> Match over
      </span>
      <h1 className="gc-display mt-3">
        {tie ? "Dead heat" : won ? "You won!" : "You lost"}
      </h1>
      <p className="gc-phase-body mt-2">
        {tie
          ? "Level on runs."
          : won
            ? `You beat ${peerName} ${selfRuns} to ${peerRuns}.`
            : `${peerName} took it ${peerRuns} to ${selfRuns}.`}
      </p>
      <button className="gc-btn gc-btn--ink mt-4 w-full" onClick={onBack}>
        <IconArrowLeft size={16} stroke={ICON_STROKE} />
        Back
      </button>
    </div>
  );
}

function statusTitle(status: string) {
  switch (status) {
    case "requesting-camera":
      return "camera.exe";
    case "connecting":
      return "connecting";
    default:
      return "lobby";
  }
}

function statusHeading(status: string) {
  switch (status) {
    case "requesting-camera":
      return "Let us see you";
    case "connecting":
      return "Finding a ground";
    case "waiting-for-opponent":
      return "Nobody here yet";
    default:
      return "Loading";
  }
}

function statusBody(status: string, mode: GameMode | null) {
  if (status === "requesting-camera") {
    return "Allow the camera so your hand can be read.";
  }
  if (status === "connecting") {
    return "Hooking you up to the other end.";
  }
  if (status === "waiting-for-opponent") {
    return mode === "stranger"
      ? "Waiting for someone else to open the site. Send it to a friend and you will be matched."
      : "Connecting you into the match.";
  }
  return "One moment.";
}

function HandStatusBadge({ count }: { count: number | null }) {
  return (
    <span className={`gc-hand ${count !== null ? "gc-hand--ok" : "gc-hand--none"}`}>
      <IconHandStop size={12} stroke={ICON_STROKE} />
      {count !== null ? `Sees ${count}` : "No hand"}
    </span>
  );
}

/** One row in the friends list: a live online dot, their name, and
 *  whichever action makes sense right now. */
function FriendRow({
  friend,
  status,
  outgoingStatus,
  onInvite,
  onCancelInvite,
  onRemove,
}: {
  friend: Friend;
  status: FriendStatus;
  outgoingStatus: "waiting" | "declined" | "failed" | null;
  onInvite: () => void;
  onCancelInvite: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="gc-row">
      <div className="gc-row-main">
        <span className={`gc-dot gc-dot--${status}`} />
        <div className="min-w-0">
          <p className="gc-row-name">{friend.nickname}</p>
          <p className="gc-row-sub">{friend.username}</p>
          {outgoingStatus === "failed" && (
            <p className="gc-error">Could not reach them</p>
          )}
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">
        {outgoingStatus === "waiting" ? (
          <button className="gc-btn gc-btn--sm" onClick={onCancelInvite}>
            Cancel
          </button>
        ) : (
          <button
            className="gc-btn gc-btn--sm gc-btn--red"
            disabled={status !== "online"}
            onClick={onInvite}
          >
            {outgoingStatus === "declined" || outgoingStatus === "failed"
              ? "Retry"
              : "Invite"}
          </button>
        )}
        <button className="gc-link-btn" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

/** The vs-computer opponent tile. It never had a camera, so it shows a
 *  face and, once it has thrown, the number. */
function ComputerFace({ lastValue }: { lastValue: number | null }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3"
      style={{ background: "var(--gc-blue)", color: "var(--gc-paper)" }}
    >
      <IconRobot size={46} stroke={ICON_STROKE} />
      {lastValue !== null && (
        <span className="gc-num text-3xl leading-none">{lastValue}</span>
      )}
    </div>
  );
}
