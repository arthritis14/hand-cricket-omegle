"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { countExtendedFingers } from "./fingerCounting";

// Both the WASM runtime and the hand-landmark model are fetched from
// Google's public CDN at runtime - nothing to bundle or host ourselves,
// and it's free.
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type DetectResult = {
  count: number | null;
  landmarks: HandLandmarkerResult["landmarks"][number] | null;
};

// Kept fairly loose on purpose: this app never acts on a single misfire
// (every throw shows the read number for a few seconds with a +/-
// correction), so it's better for the model to guess too eagerly than to
// sit there reporting "no hand" while a hand is clearly in frame.
const DETECTION_CONFIDENCE = 0.5;

type Vision = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

async function createLandmarker(vision: Vision, delegate: "GPU" | "CPU") {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: DETECTION_CONFIDENCE,
    minHandPresenceConfidence: DETECTION_CONFIDENCE,
    minTrackingConfidence: DETECTION_CONFIDENCE,
  });
}

/**
 * Loads MediaPipe's HandLandmarker once per component tree and exposes a
 * `detect(videoEl)` function that reads the current video frame and
 * returns a finger count. All of this runs on-device in the browser - no
 * video frame ever leaves the player's machine for this step.
 */
export function useHandDetector(enabled: boolean = true) {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        let landmarker: HandLandmarker;
        try {
          // GPU delegate is faster, but its WebGL path silently fails to
          // initialise (or throws outright) on a chunk of real
          // hardware/driver/browser combos. When that happens every
          // future detectForVideo call just comes back empty forever,
          // which reads to a player as "it's not detecting my hand" with
          // nothing on screen to explain why. Try GPU first, and fall
          // back to the CPU delegate - slower per frame, but far more
          // consistently available.
          landmarker = await createLandmarker(vision, "GPU");
        } catch (gpuErr) {
          console.warn(
            "Hand landmarker: GPU delegate failed, falling back to CPU",
            gpuErr
          );
          landmarker = await createLandmarker(vision, "CPU");
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);
      } catch (err) {
        console.error("Failed to load hand landmarker", err);
        if (!cancelled) {
          setError(
            "Couldn't load hand detection. Check your connection and reload."
          );
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [enabled]);

  const detect = useCallback((video: HTMLVideoElement): DetectResult => {
    const landmarker = landmarkerRef.current;
    if (!landmarker || video.readyState < 2 || video.videoWidth === 0) {
      return { count: null, landmarks: null };
    }
    const result = landmarker.detectForVideo(video, performance.now());
    const hand = result.landmarks?.[0] ?? null;
    if (!hand) return { count: null, landmarks: null };
    return { count: countExtendedFingers(hand), landmarks: hand };
  }, []);

  return { ready, error, detect };
}
