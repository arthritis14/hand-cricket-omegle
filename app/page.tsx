"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrutalButton, BrutalCard, BrutalBadge } from "@/components/Brutal";
import { VideoTile } from "@/components/VideoTile";
import { Countdown } from "@/components/Countdown";
import { Scoreboard } from "@/components/Scoreboard";
import { usePeerRoom, LOBBY_HOST_ID, type RoomStrategy } from "@/lib/usePeerRoom";
import { useHandDetector } from "@/lib/handDetector";
import { computerThrow, computerSideChoice } from "@/lib/computerOpponent";
import { roomIdFromCode } from "@/lib/roomCode";
import {
  getSavedUsername,
  saveUsername,
  normalizeUsername,
  isValidUsername,
} from "@/lib/username";
import { loadFriends, addFriend, removeFriend, type Friend } from "@/lib/friends";
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
const BREAK_PAUSE_MS = 3400;
const SELF_LABEL = "You";

// The three ways to play. "stranger" and the two "private-*" modes are
// real peer-to-peer matches over video; "computer" never talks to another
// person at all - see usePeerRoom's "solo" strategy.
type GameMode = "stranger" | "computer" | "private-host" | "private-guest";

// What the pre-game "menu" card is currently showing. Only relevant before
// a mode has actually been picked and `started` flips true.
type HomeView = "menu" | "private-hub";

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

  // The Private Match hub: a persistent per-browser username ("account")
  // once one's been claimed, plus a local address book of friends'
  // usernames. Both are just localStorage - there's no real backend, same
  // as everything else in this app.
  const [username, setUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendUsernameInput, setFriendUsernameInput] = useState("");
  const [friendNicknameInput, setFriendNicknameInput] = useState("");
  // A username being actively claimed for the first time - kept separate
  // from `username` (the confirmed account) so the UI doesn't switch to
  // "you have an account" until the claim genuinely succeeds. If it comes
  // back "taken" or "error" instead, `username` never flips and the
  // create-account form stays put.
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);

  useEffect(() => {
    // One-time hydration from localStorage on mount - these can't be read
    // during render (server has no localStorage), so this is genuinely
    // synchronizing with an external system, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsername(getSavedUsername());
    setFriends(loadFriends());
  }, []);

  // Only claims a presence beacon and polls friends while someone's
  // actually looking at this screen - not from the moment the app loads,
  // and not once a match has actually started.
  const presence = usePresenceHub({
    enabled: homeView === "private-hub" && !started,
    username,
    friends,
  });

  // A pending claim only becomes the account once it's actually
  // confirmed - this is what turns the create-account form into the
  // friends hub, and what persists the username for next visit.
  useEffect(() => {
    if (presence.claimStatus === "claimed" && pendingUsername) {
      // Bridging a result from the presence hook (an external subscription)
      // into this component's own account state - same idiom as the
      // accepted-invite effect below.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsername(pendingUsername);
      saveUsername(pendingUsername);
      setPendingUsername(null);
    }
  }, [presence.claimStatus, pendingUsername]);

  const handleCreateAccount = () => {
    const name = normalizeUsername(usernameInput);
    if (!isValidUsername(name)) return;
    setPendingUsername(name);
    presence.claimUsername(name);
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

  const handleAddFriend = () => {
    const name = normalizeUsername(friendUsernameInput);
    if (!isValidUsername(name) || name === username) return;
    setFriends((f) => addFriend(f, name, friendNicknameInput));
    setFriendUsernameInput("");
    setFriendNicknameInput("");
  };

  const handleRemoveFriend = (name: string) => {
    setFriends((f) => removeFriend(f, name));
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

  const handleMessage = useCallback((msg: GameMessage) => {
    switch (msg.type) {
      case "toss-call":
        setGame((s) => beginTossThrow(s, msg.call));
        break;
      case "ready":
        setPeerReadySeq(msg.seq);
        break;
      case "start-countdown":
        setGame((s) => ({ ...s, phase: "throw-countdown", countdownStartsAt: msg.startsAt }));
        break;
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

  const { ready: detectorReady, detect } = useHandDetector(started);

  // Run hand detection continuously (not just once per throw) once the
  // local camera and detector are both ready. Two reasons: it gives
  // MediaPipe's VIDEO-mode tracker a steady stream of frames to track
  // against instead of cold-starting on a single call, which is far more
  // reliable - and it lets us show live "can it see my hand" feedback,
  // so a miss is obvious immediately instead of only after a throw.
  const liveDetectionRef = useRef<{ count: number | null }>({ count: null });
  const [liveHandCount, setLiveHandCount] = useState<number | null>(null);
  useEffect(() => {
    if (!detectorReady) return;
    let rafId: number;
    const loop = () => {
      const video = localVideoRef.current;
      if (video) {
        const result = detect(video);
        liveDetectionRef.current = result;
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
      sendMessage({ type: "start-countdown", seq: game.seq, startsAt });

      setGame((s) => (s.phase === "throw-ready" ? { ...s, phase: "throw-countdown", countdownStartsAt: startsAt } : s));
    }
  }, [game.phase, game.seq, mode, peerReadySeq, role, rtt, sendMessage]);

  const [countdownLabel, setCountdownLabel] = useState("3");

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

    return () => timers.forEach(clearTimeout);
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
    const value = liveDetectionRef.current.count ?? 0;
    lockInThrow(value);
  }, [game.phase, game.seq, lockInThrow]);

  // Auto-advance through result/break screens - both sides hold identical
  // state at this point so no extra message is needed to stay in sync.
  useEffect(() => {
    if (game.phase === "ball-result") {
      const t = setTimeout(() => setGame((s) => nextBall(s)), RESULT_PAUSE_MS);
      return () => clearTimeout(t);
    }
    if (game.phase === "innings-break") {
      const t = setTimeout(() => setGame((s) => startSecondInnings(s)), BREAK_PAUSE_MS);
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

  // The stranger's camera is the one place someone could cheat: since the
  // raw video feed is right there on screen, a player could just wait to
  // see what number the other person's hand is showing and copy it before
  // locking in their own throw. Blurring their tile for the whole throw
  // window - from the 3-2-1 countdown through the lock-in step - closes
  // that off. There's no such risk against the computer (it never had a
  // camera to peek at), so it's never blurred there.
  const strangerBlurred =
    mode !== "computer" &&
    (game.phase === "throw-countdown" || game.phase === "throw-capture");
  const blurReason =
    game.phase === "throw-countdown"
      ? "Hidden until the throw"
      : "Hidden until you both lock in";

  const beginMode = (m: "stranger" | "computer") => {
    setMode(m);
    setStarted(true);
  };

  // --- Render states ---

  if (!started) {
    return (
      <>
        {homeView === "private-hub" && <BackButton onClick={() => setHomeView("menu")} />}
        <Centered>
        <div className="w-full max-w-md">
          <BrutalCard tone="purple" className="mb-[-14px] ml-4 w-fit rotate-[-3deg] px-4 py-1.5">
            <span className="brutal-heading text-xs">✋ vs ✋, live</span>
          </BrutalCard>
          <BrutalCard tone="lilac" className="brutal-border-thick relative w-full p-7 text-center">
            <h1 className="brutal-heading text-3xl leading-none sm:text-4xl">
              Hand<span className="text-brutal-coral">Cricket</span>
              <br />
              Omegle
            </h1>
            <div className="mx-auto mt-4 h-1.5 w-16 bg-brutal-lime" />

            {homeView === "menu" && (
              <div className="mt-6 flex flex-col gap-3">
                <BrutalButton
                  tone="pink"
                  className="brutal-lift w-full text-base"
                  onClick={() => setHomeView("private-hub")}
                >
                  🔒 Private Match
                </BrutalButton>
                <BrutalButton
                  tone="lime"
                  className="brutal-lift w-full text-base"
                  onClick={() => beginMode("stranger")}
                >
                  🌍 2 Player
                </BrutalButton>
                <BrutalButton
                  tone="blue"
                  className="brutal-lift w-full text-base"
                  onClick={() => beginMode("computer")}
                >
                  🤖 One Player
                </BrutalButton>
              </div>
            )}

            {homeView === "private-hub" && !username && (
              <div className="mt-4 text-left">
                <div className="brutal-border rounded-xl bg-white/60 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-black/50">
                    Create your account
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    Pick a username - this is what friends will use to add you
                    and invite you straight into a match.
                  </p>
                  <input
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(normalizeUsername(e.target.value))}
                    placeholder="username"
                    maxLength={16}
                    className="brutal-border mt-3 w-full rounded-lg px-3 py-2 text-sm"
                  />
                  <BrutalButton
                    tone="yellow"
                    className="mt-2 w-full text-sm"
                    disabled={!isValidUsername(usernameInput) || presence.claimStatus === "claiming"}
                    onClick={handleCreateAccount}
                  >
                    {presence.claimStatus === "claiming" ? "Checking…" : "Create account"}
                  </BrutalButton>
                  {presence.claimStatus === "taken" && (
                    <p className="mt-2 text-xs font-bold text-brutal-coral">
                      That username&apos;s taken right now - try another.
                    </p>
                  )}
                  {presence.claimStatus === "error" && (
                    <p className="mt-2 text-xs font-bold text-brutal-coral">
                      Couldn&apos;t reach the network - check your connection and try again.
                    </p>
                  )}
                </div>
              </div>
            )}

            {homeView === "private-hub" && username && (
              <div className="mt-4 text-left">
                <div className="brutal-border rounded-xl bg-white/60 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-black/50">
                    Your username
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="font-display text-2xl font-bold tracking-[0.05em]">
                      {username}
                    </p>
                    <button
                      className="brutal-border brutal-shadow-sm brutal-press cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-bold uppercase"
                      onClick={handleCopyUsername}
                    >
                      Copy
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-black/50">
                    Share this so a friend can add you and invite you straight
                    into a match.
                  </p>
                </div>

                {presence.incomingInvite && (
                  <div className="brutal-border brutal-shadow-sm mt-3 rounded-xl bg-brutal-yellow px-4 py-3">
                    <p className="font-display text-sm font-bold">
                      {presence.incomingInvite.fromUsername} wants to play!
                    </p>
                    <div className="mt-2 flex gap-2">
                      <BrutalButton
                        tone="lime"
                        className="flex-1 text-sm"
                        onClick={presence.acceptInvite}
                      >
                        Accept
                      </BrutalButton>
                      <BrutalButton
                        tone="black"
                        className="flex-1 text-sm"
                        onClick={presence.declineInvite}
                      >
                        Decline
                      </BrutalButton>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-black/50">
                    Add a friend
                  </p>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={friendUsernameInput}
                      onChange={(e) => setFriendUsernameInput(normalizeUsername(e.target.value))}
                      placeholder="Their username"
                      maxLength={16}
                      className="brutal-border w-1/2 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={friendNicknameInput}
                      onChange={(e) => setFriendNicknameInput(e.target.value)}
                      placeholder="Name (optional)"
                      maxLength={20}
                      className="brutal-border w-1/2 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <BrutalButton
                    tone="yellow"
                    className="mt-2 w-full text-sm"
                    disabled={
                      !isValidUsername(normalizeUsername(friendUsernameInput)) ||
                      normalizeUsername(friendUsernameInput) === username
                    }
                    onClick={handleAddFriend}
                  >
                    Add friend
                  </BrutalButton>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-black/50">
                    Friends
                  </p>
                  {friends.length === 0 && (
                    <p className="mt-2 text-sm text-black/50">No friends saved yet.</p>
                  )}
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
                </div>
              </div>
            )}
          </BrutalCard>
        </div>
        </Centered>
      </>
    );
  }

  if (error || status === "failed") {
    return (
      <>
        <BackButton onClick={leaveToMenu} />
        <Centered>
        <BrutalCard tone="red" className="w-full max-w-sm p-6 text-center brutal-tilt-l">
          <p className="font-display font-bold uppercase">{error ?? "Something went wrong."}</p>
          <BrutalButton tone="yellow" className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </BrutalButton>
        </BrutalCard>
        </Centered>
      </>
    );
  }

  if (status === "opponent-left") {
    return (
      <>
        <BackButton onClick={leaveToMenu} />
        <Centered>
        <BrutalCard tone="yellow" className="w-full max-w-sm p-6 text-center brutal-tilt-r">
          <p className="font-display font-bold uppercase">Your opponent left the match.</p>
          <BrutalButton tone="black" className="mt-4" onClick={() => window.location.reload()}>
            Find a new match
          </BrutalButton>
        </BrutalCard>
        </Centered>
      </>
    );
  }

  if (status !== "connected" || !role || game.phase === "lobby") {
    return (
      <>
        <BackButton onClick={leaveToMenu} />
        <Centered>
        <BrutalCard tone="blue" className="brutal-border-thick w-full max-w-md p-7 text-center">
          <BrutalBadge tone="yellow" className="brutal-tilt-l">
            Hand Cricket Omegle
          </BrutalBadge>
          <p className="mt-4 font-display text-sm font-bold uppercase tracking-wide text-white">
            {statusLabel(status)}
          </p>
          {status === "waiting-for-opponent" && mode === "stranger" && (
            <p className="mt-3 text-sm text-white/80">
              Have your friend open this same site and hit play - you&apos;ll
              be matched automatically.
            </p>
          )}
          {status === "waiting-for-opponent" &&
            (mode === "private-host" || mode === "private-guest") && (
              <p className="mt-3 text-sm text-white/80">Connecting you into the match…</p>
            )}
          {status === "waiting-for-opponent" && (
            <div className="mx-auto mt-5 h-9 w-9 animate-spin rounded-full border-4 border-white border-t-brutal-yellow" />
          )}
        </BrutalCard>
        </Centered>
      </>
    );
  }

  if (game.phase === "game-over") {
    const won = game.winner === role;
    const winnerLabel = game.winner === "tie" ? "It's a tie." : won ? "You won!" : "You lost.";
    return (
      <Centered>
        <BrutalCard
          tone={game.winner === "tie" ? "yellow" : won ? "lime" : "coral"}
          className="brutal-border-thick brutal-shadow-lg w-full max-w-sm p-6 text-center"
        >
          <BrutalBadge tone={won ? "mint" : "red"} className="mb-3 brutal-tilt-l">
            Match over
          </BrutalBadge>
          <h1 className="brutal-heading text-4xl">{winnerLabel}</h1>
          <div className="mt-5 flex justify-around">
            <div>
              <p className="font-display text-xs uppercase text-black/60">{SELF_LABEL}</p>
              <p className="font-display text-3xl font-bold">{game.innings[role].runs}</p>
            </div>
            <div>
              <p className="font-display text-xs uppercase text-black/60">{PEER_LABEL}</p>
              <p className="font-display text-3xl font-bold">
                {opponentRole ? game.innings[opponentRole].runs : 0}
              </p>
            </div>
          </div>
          <BrutalButton tone="black" className="mt-6 w-full" onClick={() => window.location.reload()}>
            Find a new match
          </BrutalButton>
        </BrutalCard>
      </Centered>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="brutal-heading text-lg sm:text-xl">Hand Cricket</h1>
        {rtt !== null && (
          <BrutalBadge tone="blue" className="brutal-tilt-r">
            Ping {rtt}ms
          </BrutalBadge>
        )}
      </div>

      <Scoreboard state={game} self={role} selfName={SELF_LABEL} peerName={PEER_LABEL} />

      <div className="grid grid-cols-2 gap-4">
        <div className="relative">
          <VideoTile
            stream={localStream}
            label={`${SELF_LABEL}`}
            mirrored
            muted
            tone="purple"
            videoRef={localVideoRef}
          />
          {game.phase === "throw-countdown" && <Countdown label={countdownLabel} />}
          {detectorReady && <HandStatusBadge count={liveHandCount} />}
        </div>
        <VideoTile
          stream={remoteStream}
          label={PEER_LABEL}
          tone="coral"
          blurred={strangerBlurred}
          blurReason={blurReason}
          placeholder={mode === "computer" ? <ComputerFace lastValue={computerLastThrow} /> : undefined}
        />
      </div>

      <BrutalCard tone="peach" className="brutal-border-thick flex-1 p-5">
        {game.phase === "toss-call" && (
          <PhaseBlock title="The toss">
            {role === "guest" ? (
              <>
                <p className="mb-3 text-sm">Call it before you both throw:</p>
                <div className="flex gap-3">
                  <BrutalButton tone="mint" onClick={() => handleTossCall("odd")}>
                    Odd
                  </BrutalButton>
                  <BrutalButton tone="orange" onClick={() => handleTossCall("even")}>
                    Even
                  </BrutalButton>
                </div>
              </>
            ) : (
              <WaitingLine label={PEER_LABEL} action="to call odd or even" />
            )}
          </PhaseBlock>
        )}

        {(game.phase === "throw-ready" || game.phase === "throw-countdown") && (
          <PhaseBlock title={game.throwKind === "toss" ? "Toss throw" : "Ball incoming"}>
            <p className="text-sm text-black/60">
              Get your hand ready in frame - the throw happens on 1.
            </p>
          </PhaseBlock>
        )}

        {game.phase === "throw-capture" && (
          <PhaseBlock title="Reading throws">
            <p className="text-sm text-black/60">
              Throws locked in - working out what happened…
            </p>
          </PhaseBlock>
        )}

        {game.phase === "toss-result" && game.tossWinner && (
          <PhaseBlock title="Toss result">
            <p className="font-display text-lg font-bold">
              You threw {game.ownValue} - they threw {game.peerValue}.
            </p>
            <BrutalBadge tone={game.tossWinner === role ? "mint" : "pink"} className="mt-2">
              {game.tossWinner === role ? "You" : PEER_LABEL} won the toss
            </BrutalBadge>
          </PhaseBlock>
        )}

        {game.phase === "choose-side" && (
          <PhaseBlock title="Bat or bowl?">
            {game.tossWinner === role ? (
              <div className="flex gap-3">
                <BrutalButton tone="lime" onClick={() => handleChooseSide("bat")}>
                  Bat first
                </BrutalButton>
                <BrutalButton tone="blue" onClick={() => handleChooseSide("bowl")}>
                  Bowl first
                </BrutalButton>
              </div>
            ) : (
              <WaitingLine label={PEER_LABEL} action="to choose bat or bowl" />
            )}
          </PhaseBlock>
        )}

        {game.phase === "ball-result" && game.lastBall && (
          <PhaseBlock title={game.lastBall.out ? "OUT!" : "Runs!"}>
            <p className="text-sm">
              Batter threw {game.lastBall.batterValue}, bowler threw {game.lastBall.bowlerValue}.
            </p>
            {!game.lastBall.out && (
              <BrutalBadge tone="mint" className="mt-2 text-base">
                +{game.lastBall.batterValue} runs
              </BrutalBadge>
            )}
            {game.lastBall.out && (
              <BrutalBadge tone="red" className="mt-2 text-base">
                Wicket down
              </BrutalBadge>
            )}
          </PhaseBlock>
        )}

        {game.phase === "innings-break" && (
          <PhaseBlock title="Innings break">
            <p className="text-sm">
              {isSelfBatting ? "You are" : `${PEER_LABEL} is`} out. Second innings starting…
            </p>
          </PhaseBlock>
        )}
      </BrutalCard>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
  );
}

// A single, consistently-placed way back to the previous screen - top
// right, everywhere it's needed, so there's never a dead end that only a
// reload or a closed tab can escape from. Sits above everything else
// (z-20) since it needs to stay clickable over video tiles and cards.
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Back"
      className="brutal-border brutal-shadow-sm brutal-press fixed right-4 top-4 z-20 cursor-pointer rounded-lg bg-white px-3 py-1.5 font-display text-xs font-bold uppercase"
    >
      ← Back
    </button>
  );
}

function PhaseBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="brutal-heading mb-2 text-xl">{title}</h2>
      {children}
    </div>
  );
}

function WaitingLine({ label, action }: { label: string; action: string }) {
  return <p className="text-sm text-black/60">Waiting for {label.toLowerCase()} {action}…</p>;
}

function statusLabel(status: string) {
  switch (status) {
    case "requesting-camera":
      return "Asking for camera access…";
    case "connecting":
      return "Connecting…";
    case "waiting-for-opponent":
      return "Waiting for someone else to open the site…";
    default:
      return "Loading…";
  }
}

function HandStatusBadge({ count }: { count: number | null }) {
  return (
    <span
      className={`brutal-border brutal-shadow-sm absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-bold uppercase tracking-wide ${
        count !== null ? "bg-brutal-mint text-black" : "bg-brutal-red text-white"
      }`}
    >
      {count !== null ? `✋ Sees ${count}` : "No hand seen"}
    </span>
  );
}

// One row in the Private Match friends list: a live online/offline dot,
// their saved nickname and code, and whichever action makes sense right
// now - invite, cancel a pending invite, or remove them.
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
  outgoingStatus: "waiting" | "declined" | null;
  onInvite: () => void;
  onCancelInvite: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="brutal-border flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <div>
          <p className="text-sm font-bold">{friend.nickname}</p>
          <p className="text-xs text-black/40">{friend.username}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {outgoingStatus === "waiting" ? (
          <button
            className="brutal-border brutal-shadow-sm brutal-press cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs font-bold uppercase"
            onClick={onCancelInvite}
          >
            Cancel
          </button>
        ) : (
          <BrutalButton
            tone={status === "online" ? "lime" : "white"}
            className="px-3 py-1.5 text-xs"
            disabled={status !== "online"}
            onClick={onInvite}
          >
            {outgoingStatus === "declined" ? "Declined - retry" : "Invite"}
          </BrutalButton>
        )}
        <button className="text-xs text-black/40 underline" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: FriendStatus }) {
  const color =
    status === "online"
      ? "bg-brutal-mint"
      : status === "offline"
        ? "bg-black/30"
        : "bg-brutal-yellow";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

// The vs-computer opponent tile - it never had a camera, so instead of a
// video feed it just shows a face and, once it's actually thrown, the
// number.
function ComputerFace({ lastValue }: { lastValue: number | null }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black text-white">
      <span className="text-4xl">🤖</span>
      {lastValue !== null && (
        <span className="font-display text-lg font-bold">Threw {lastValue}</span>
      )}
    </div>
  );
}
