"use client";

import { useRef } from "react";
import { IconHelpCircle, IconX } from "@tabler/icons-react";

const ICON_STROKE = 2.5;

/**
 * The "How to play" button and its popup.
 *
 * The rules are rendered into the page from the first paint inside a
 * closed <dialog>, and the button only opens it. That matters for search:
 * crawlers read text that is in the HTML even while it is hidden, but
 * never click buttons, so text added on click would be invisible to them.
 */
export function HowToPlay() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        className="gc-btn gc-btn--sm gc-howto-btn"
        onClick={() => dialogRef.current?.showModal()}
      >
        <IconHelpCircle size={14} stroke={ICON_STROKE} />
        How to play
      </button>

      <dialog
        ref={dialogRef}
        className="gc-win gc-howto"
        aria-labelledby="howto-title"
        // A click on the dimmed backdrop lands on the dialog element
        // itself, never on its contents, so it closes like the X does.
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        <div className="gc-win-bar">
          <span className="gc-win-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="gc-win-title">Rules</span>
          <button className="gc-howto-close" onClick={close} aria-label="Close">
            <IconX size={16} stroke={3} />
          </button>
        </div>

        <div className="gc-howto-body">
          <h2 id="howto-title" className="gc-display gc-display--sm">
            How to play hand cricket
          </h2>

          <p>
            Hand cricket is the odd-or-even finger game from school, played
            here over video. Play a friend or the computer. Your{" "}
            <strong>webcam reads your hand</strong>, so nobody argues about
            what was thrown.
          </p>

          <h3 className="gc-label">The throws</h3>
          <ul className="gc-howto-throws">
            <li><b>1 to 4</b> fingers up</li>
            <li><b>5</b> open palm</li>
            <li><b>6</b> thumbs up</li>
            <li><b>0</b> closed fist</li>
          </ul>

          <h3 className="gc-label">A match</h3>
          <ol className="gc-howto-steps">
            <li>
              <b>Toss.</b> One player calls odd or even, both throw, and the
              total decides who wins. The winner picks bat or bowl.
            </li>
            <li>
              <b>Batting.</b> Each ball, both players throw at the same time.
              The batter scores whatever they threw.
            </li>
            <li>
              <b>Out.</b> If both throw the same number, the batter is out
              and the innings ends.
            </li>
            <li>
              <b>The chase.</b> Sides swap. The new batter needs to pass the
              first score before they get out.
            </li>
          </ol>

          <h3 className="gc-label">Good to know</h3>
          <ul className="gc-howto-faq">
            <li><b>Free</b>, and it runs in your browser. Nothing to download.</li>
            <li>Works on <b>phone and laptop</b>, as long as there is a camera.</li>
          </ul>

          <button className="gc-btn gc-btn--lime w-full" onClick={close}>
            Got it, let&apos;s play
          </button>
        </div>
      </dialog>
    </>
  );
}
