"use client";

import { ReactNode, RefObject, useEffect, useRef } from "react";

interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  mirrored?: boolean;
  muted?: boolean;
  tone: "self" | "peer";
  videoRef?: RefObject<HTMLVideoElement | null>;
  // Drops the sightscreen over the feed. Used on the opponent's tile
  // through the throw window so nobody can read the other person's hand
  // off the live video and copy it. This used to be a blur; a shutter is
  // the better answer because a blur can be squinted through and says
  // nothing about why it is there, whereas a sightscreen coming down is
  // both opaque and self-explaining. See `shuttered` in page.tsx for why
  // lifting it exactly when it lifts is safe.
  shuttered?: boolean;
  shutterReason?: string;
  // An opponent that never had a camera at all (the computer, in
  // practice mode) - shown instead of the video element.
  placeholder?: ReactNode;
}

export function VideoTile({
  stream,
  label,
  mirrored = false,
  muted = false,
  tone,
  videoRef: externalRef,
  shuttered = false,
  shutterReason = "Hidden for now",
  placeholder,
}: VideoTileProps) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = externalRef ?? internalRef;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  return (
    <div className="gc-win">
      <div
        className="gc-win-bar"
        style={
          tone === "peer"
            ? { background: "var(--gc-red)", color: "var(--gc-paper)" }
            : undefined
        }
      >
        <span className="gc-win-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="gc-win-title">{label}</span>
      </div>

      <div className="gc-tile">
        {!placeholder && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className={mirrored ? "mirror" : undefined}
          />
        )}
        {placeholder}
        {!stream && !placeholder && (
          <div className="gc-tile-wait">Waiting for camera</div>
        )}

        {/* Always mounted so it slides rather than appears. A shutter that
            pops into existence reads as a glitch; one that drops reads as
            a mechanism. */}
        <div
          className={`gc-screen ${shuttered ? "gc-screen--down" : ""}`}
          aria-hidden={!shuttered}
        >
          <p className="gc-screen-text">Sightscreen</p>
          <p className="gc-label">{shutterReason}</p>
        </div>
      </div>
    </div>
  );
}
