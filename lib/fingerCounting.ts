import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// MediaPipe's 21 hand landmark indices. See:
// https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
const WRIST = 0;
const THUMB_TIP = 4;
const THUMB_IP = 3;
const INDEX_TIP = 8;
const INDEX_MCP = 5;
const MIDDLE_TIP = 12;
const MIDDLE_MCP = 9;
const RING_TIP = 16;
const RING_MCP = 13;
const PINKY_TIP = 20;
const PINKY_MCP = 17;

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// A curled finger's tip lands close to the palm; an extended finger's tip
// sits well past its own knuckle. That ratio holds true regardless of how
// the hand is rotated in frame - unlike a plain "is the tip above the
// knuckle" check, so it doesn't assume the hand is held bolt upright.
const EXTENSION_RATIO = 1.3;

/**
 * Reads a thrown hand-cricket number (0-6) from a single hand's 21
 * landmarks - like a die with a fist added on, not a plain finger count.
 *
 * This is a deliberately simple, explainable heuristic rather than a
 * trained classifier: a finger counts as "extended" when its fingertip
 * sits meaningfully farther from the wrist than its own knuckle (MCP
 * joint) does. Comparing distances rather than raw up/down position
 * makes this rotation-invariant - it works the same whether the hand is
 * held upright, tilted, or sideways (a "thumbs up" naturally turns the
 * whole hand on its side, which is exactly what broke a simpler
 * y-coordinate check: curled fingers could end up reading as "up" purely
 * because of the hand's rotation, not because they were extended).
 *
 * The thumb doesn't fold the same way as the other four, so it gets its
 * own distance check against the base of the palm instead of the wrist -
 * this also means we don't need MediaPipe's handedness label to tell
 * left hands from right, or worry about a mirrored camera feed.
 *
 * The four non-thumb fingers map straight to 1-4. A full open hand (all
 * four fingers plus the thumb) is 5. With every non-thumb finger curled
 * in, the thumb decides between the two remaining numbers: a flat fist -
 * thumb tucked in too - is 0, while a "thumbs up" is 6, matching how
 * hand cricket is actually played.
 *
 * It won't be perfect at every angle - that's why the UI always shows the
 * detected number for a couple of seconds with a manual +/- correction
 * before it's sent to the other player.
 */
export function countExtendedFingers(
  landmarks: NormalizedLandmark[]
): number | null {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[WRIST];
  let fingerCount = 0; // index/middle/ring/pinky only - thumb is separate

  const fingers: Array<[number, number]> = [
    [INDEX_TIP, INDEX_MCP],
    [MIDDLE_TIP, MIDDLE_MCP],
    [RING_TIP, RING_MCP],
    [PINKY_TIP, PINKY_MCP],
  ];

  for (const [tipIdx, mcpIdx] of fingers) {
    const tip = landmarks[tipIdx];
    const mcp = landmarks[mcpIdx];
    if (dist(tip, wrist) > dist(mcp, wrist) * EXTENSION_RATIO) {
      fingerCount += 1;
    }
  }

  const thumbTip = landmarks[THUMB_TIP];
  const thumbIp = landmarks[THUMB_IP];
  const palmBase = landmarks[PINKY_MCP];
  const thumbOut = dist(thumbTip, palmBase) > dist(thumbIp, palmBase) * 1.05;

  if (fingerCount === 0) return thumbOut ? 6 : 0; // thumbs-up = 6, flat fist = 0
  if (fingerCount === 4 && thumbOut) return 5; // full open hand
  return fingerCount; // 1-4
}
