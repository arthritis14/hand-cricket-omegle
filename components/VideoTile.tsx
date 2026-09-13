"use client";

import { ReactNode, RefObject, useEffect, useRef } from "react";

interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  mirrored?: boolean;
  muted?: boolean;
  tone: "self" | "peer";
  videoRef?: RefObject<HTMLVideoElement | null>;
  // Heavily blurs the feed and covers it with a reason badge - used on
  // the opponent's tile during the throw window so no one can just read
  // the other person's hand off the live video and copy it. See the
  // `strangerBlurred` comment in page.tsx for why this is safe to lift
  // exactly when it is.
  blurred?: boolean;
  blurReason?: string;
  // For an opponent that was never a camera feed at all (the computer, in
  // practice mode) - shown instead of the video element and the "waiting
  // for camera" fallback.
  placeholder?: ReactNode;
}

export function VideoTile({
  stream,
  label,
  mirrored = false,
  muted = false,
  tone,
  videoRef: externalRef,
  blurred = false,
  blurReason = "Hidden for now",
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
    <div
      className="nb-video-tile"
      style={{ borderColor: tone === "peer" ? "var(--nb-pink)" : "var(--nb-ink)" }}
    >
      {!placeholder && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`${mirrored ? "mirror" : ""} ${blurred ? "nb-blurred" : ""}`}
        />
      )}
      {placeholder && <div className="absolute inset-0">{placeholder}</div>}
      {!stream && !placeholder && <div className="nb-video-waiting">Waiting for camera…</div>}
      {blurred && stream && (
        <div className="nb-video-blur-overlay">
          <span className="text-3xl">🙈</span>
          <span className="nb-video-blur-chip">{blurReason}</span>
        </div>
      )}
      <span className="nb-video-label">{label}</span>
    </div>
  );
}
