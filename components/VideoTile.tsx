"use client";

import { ReactNode, RefObject, useEffect, useRef } from "react";

interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  mirrored?: boolean;
  muted?: boolean;
  tone: "purple" | "coral";
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

  const borderTone = tone === "purple" ? "border-brutal-purple" : "border-brutal-coral";
  const labelTone = tone === "purple" ? "bg-brutal-lime" : "bg-brutal-yellow";

  return (
    <div
      className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl brutal-border brutal-shadow bg-black ${borderTone}`}
    >
      {!placeholder && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-cover transition-[filter,transform] duration-300 ease-out ${
            mirrored ? "mirror" : ""
          } ${blurred ? "scale-110 blur-2xl" : "scale-100 blur-0"}`}
        />
      )}
      {placeholder && <div className="absolute inset-0">{placeholder}</div>}
      {!stream && !placeholder && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 font-display text-sm uppercase tracking-wide text-white/70">
          Waiting for camera…
        </div>
      )}
      {blurred && stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 px-4 text-center">
          <span className="text-3xl">🙈</span>
          <span className="brutal-border brutal-shadow-sm rounded-full bg-brutal-yellow px-3 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-black">
            {blurReason}
          </span>
        </div>
      )}
      <span
        className={`absolute left-3 top-3 brutal-border brutal-shadow-sm rounded-full px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-black ${labelTone}`}
      >
        {label}
      </span>
    </div>
  );
}
