"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconArrowLeft,
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

// One stroke weight for every icon on the site, set here rather than per
// use so nothing drifts thinner than the 3px borders around it.
const ICON_STROKE = 2.4;

// The illustrations. Generated for this site rather than stock, so the
// palette in globals.css and the art are sampled from each other.
const ART_KIT =
  "https://cdn.gamma.app/hc6lzg3dk8ql7jy/design-anything/ERXDKWkGNAgsSevviC2zV/jxKiHnPPm8XtiaUn2XDxN.jpg";
const ART_EMPTY_GULLY =
  "https://cdn.gamma.app/hc6lzg3dk8ql7jy/design-anything/eO4ws510oCtZ7mzWfFfI3/E0sh_gQAEkLmwfFupw6iv.jpg";

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

  const beginMode = (m: "stranger" | "computer") => {
    setMode(m);
    setStarted(true);
  };

  // --- Render states ---

  if (!started && homeView === "menu") {
    return (
      <>
        <div className="gc-ground" />
        <div className="gc-page">
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className="gc-hero">
              <div className="gc-stagger flex flex-col items-start gap-5">
                <span className="gc-badge gc-badge--red">
                  <IconHandStop size={13} stroke={ICON_STROKE} /> Live on camera
                </span>

                <h1 className="gc-display">
                  Hand <span className="gc-accent">Cricket</span> Omegle
                </h1>

                <p className="gc-lede">
                  Get matched with a stranger. Throw your hand at the camera.
                  The site does the umpiring.
                </p>

                <div className="flex w-full flex-col gap-3">
                  <button
                    className="gc-btn gc-btn--lg gc-btn--red"
                    onClick={() => beginMode("stranger")}
                  >
                    <IconWorld size={24} stroke={ICON_STROKE} />
                    Play a stranger
                  </button>
                  <button
                    className="gc-btn gc-btn--lg gc-btn--yellow"
                    onClick={() => setHomeView("private-hub")}
                  >
                    <IconLock size={24} stroke={ICON_STROKE} />
                    Play a friend
                  </button>
                  <button
                    className="gc-btn gc-btn--lg"
                    onClick={() => beginMode("computer")}
                  >
                    <IconRobot size={24} stroke={ICON_STROKE} />
                    Play the computer
                  </button>
                </div>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="gc-hero-art"
                src={ART_KIT}
                alt="A cricket bat, ball and stumps drawn in flat bright colours"
              />
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
        <BackButton onClick={() => setHomeView("menu")} />
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className="gc-win gc-enter w-full max-w-md">
              <div className="gc-win-bar">
                <span className="gc-win-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="gc-win-title">Play a friend</span>
              </div>

              <div className="flex flex-col gap-4 p-4">
                {!username && (
                  <>
                    <div>
                      <h1 className="gc-display gc-display--sm">Pick a name</h1>
                      <p className="gc-lede mt-2">
                        Friends add you by this name and drop you straight into
                        a match.
                      </p>
                    </div>
                    <div className="gc-panel gc-panel--lime">
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
                        disabled={
                          !isValidUsername(usernameInput) ||
                          presence.claimStatus === "claiming"
                        }
                        onClick={handleCreateAccount}
                      >
                        {presence.claimStatus === "claiming" ? "Checking" : "Claim it"}
                      </button>
                      {presence.claimStatus === "taken" && (
                        <p className="gc-error">
                          Someone is using that right now. Try another.
                        </p>
                      )}
                      {presence.claimStatus === "error" && (
                        <p className="gc-error">
                          Could not reach the network. Check your connection.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {username && (
                  <>
                    <div className="gc-panel gc-panel--lime">
                      <p className="gc-label">You are</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="gc-username">{username}</p>
                        <button
                          className="gc-btn gc-btn--sm"
                          onClick={handleCopyUsername}
                        >
                          <IconCopy size={14} stroke={ICON_STROKE} />
                          Copy
                        </button>
                      </div>
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
                      </div>
                    </div>

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

  if (game.phase === "game-over") {
    const won = game.winner === role;
    const tone =
      game.winner === "tie" ? "gc-card--yellow" : won ? "gc-card--lime" : "gc-card--red";
    const heading =
      game.winner === "tie" ? "Dead heat" : won ? "You won" : "You lost";
    return (
      <>
        <div className="gc-ground gc-ground--cream" />
        <div className="gc-screen-wrap">
          <div className="gc-center">
            <div className={`gc-card ${tone} gc-enter w-full max-w-md text-center`}>
              <span className="gc-badge">
                <IconTrophy size={13} stroke={ICON_STROKE} /> Match over
              </span>
              <h1 className="gc-display mt-4">{heading}</h1>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <FinalScore label={SELF_LABEL} runs={game.innings[role].runs} />
                <FinalScore
                  label={PEER_LABEL}
                  runs={opponentRole ? game.innings[opponentRole].runs : 0}
                />
              </div>

              <button
                className="gc-btn gc-btn--ink mt-6 w-full"
                onClick={() => window.location.reload()}
              >
                Play again
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="gc-pitch" />
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
            {game.phase === "throw-countdown" && <Countdown label={countdownLabel} />}
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
            <div className="gc-phase gc-phase--lime">
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
            <div className={`gc-phase ${game.lastBall.out ? "gc-phase--red" : "gc-phase--lime"}`}>
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

          {game.phase === "innings-break" && (
            <div className="gc-phase gc-phase--yellow">
              <h2 className="gc-phase-head">Innings break</h2>
              <p className="gc-phase-body">
                {isSelfBatting ? "You are" : `${PEER_LABEL} is`} out. Second innings
                starting.
              </p>
            </div>
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

function FinalScore({ label, runs }: { label: string; runs: number }) {
  return (
    <div className="gc-panel bg-white text-left">
      <p className="gc-label">{label}</p>
      <p className="gc-num mt-1 text-4xl leading-none">{runs}</p>
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
