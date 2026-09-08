# Hand Cricket Omegle - prototype

A two-player web prototype: get on camera, throw a hand cricket number, and
let the app read it and score the game automatically. Built to test the
core concept between you and one friend - not a public matchmaking site.

Neo-brutalist UI, no backend server, no paid services. Everything free.

## How it works, in plain terms

- **Video call**: the two browsers connect directly to each other
  (peer-to-peer, via [PeerJS](https://peerjs.com)), using PeerJS's free
  public signalling server just to introduce the two browsers to each
  other. No account, no API key, no cost regardless of how much you use
  it.
- **Hand reading**: each browser runs Google's MediaPipe hand-tracking
  model locally, in JavaScript, to count how many fingers you're holding
  up. Nothing about your camera feed is uploaded anywhere for this - it
  all happens on your own machine.
- **Scoring**: both browsers run the same scoring logic on the two
  numbers, so they always agree on the score without needing a server to
  referee.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

### Important: testing with your friend

Browsers only allow camera access on `https://` addresses or on
`localhost` - never on a plain `http://` address. That means:

- `npm run dev` on your own machine works fine for *you* to click through
  the screens and see the UI.
- For you and your friend to actually test a match between two different
  computers, you need the app running somewhere both of you can reach over
  HTTPS. The easiest free way:

  1. Push this project to a GitHub repo (or just drag the folder into
     [vercel.com/new](https://vercel.com/new)).
  2. Deploy it on [Vercel](https://vercel.com) - free tier, no
     configuration needed, it's a standard Next.js app.
  3. Open the `https://...vercel.app` link it gives you, on both of your
     phones or laptops.

  A deploy takes about two minutes and costs nothing at this scale.

### How a match works

1. One of you clicks **Start a room**, enters a name, and gets a link.
2. Send that link to your friend. They open it and enter their name.
3. Once both cameras connect, the guest calls odd or even, you both throw
   a number to decide the toss, the toss winner picks bat or bowl, and you
   play a single-wicket-each match - same as you'd play in person.
4. Under your own camera feed, after each throw, you'll see the number the
   app read plus +/- buttons - correct it if it misread you, or let it
   auto-confirm after a few seconds.

## Known limitations (this is a v0 prototype)

- **Finger counting isn't perfect.** It works best with your hand held
  upright, clearly in frame, in decent light. That's exactly why every
  throw shows you the detected number with a few seconds to correct it
  before it's sent - and since you can already see your opponent's hand on
  the video call, a misread isn't a fairness problem, just an annoyance.
- **No TURN server configured.** Most home network pairings will connect
  fine on Google's free STUN servers alone, but some networks (offices,
  some campus wifi) need a TURN relay to connect at all. If you and your
  friend can't connect, the free fix is a TURN account from
  [Metered.ca's Open Relay project](https://www.metered.ca/tools/openrelay/)
  or similar - drop the credentials into `ICE_SERVERS` in
  `lib/usePeerRoom.ts`.
- **No sign-up, accounts, or history.** Names are just typed in per
  session.
- **No moderation or reporting tooling**, deliberately, since this is
  scoped as a private two-person test rather than a public
  stranger-matching site. If you take this further than testing with each
  other, add that before opening it up - see the note below.
- **Room codes aren't private.** Anyone who guesses or is given the link
  can join. Fine for a friends-only test, not for anything wider.

## Before this goes beyond the two of you

Randomly pairing strangers on live camera is a genuinely high-risk product
shape - it's the exact mechanic that led to Omegle's lawsuit and shutdown
in 2023. If you take this past testing with each other, build in a
report/block button, a way to instantly end and re-match, clear terms of
service, and some form of age gating before opening it to anyone beyond
people you know.

## Project structure

- `app/page.tsx` - landing page (create/join a room)
- `app/room/[roomCode]/page.tsx` - the game screen and all game-flow logic
- `lib/gameEngine.ts` - pure hand cricket scoring/state logic
- `lib/usePeerRoom.ts` - the video call + data channel connection
- `lib/handDetector.ts` / `lib/fingerCounting.ts` - the camera reading
- `components/` - the neo-brutalist UI pieces
