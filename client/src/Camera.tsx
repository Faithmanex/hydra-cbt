import { useEffect, useRef, useState } from "react";

export interface CaptureResult {
  dataUrl: string;
}

interface Props {
  onCapture: (shot: CaptureResult) => void;
  onResnap: (shot: CaptureResult) => void;
  onCancelResnap: () => void;
  resnapLabel?: string | null;
}

function downscaleFrame(video: HTMLVideoElement): string {
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function Camera({ onCapture, onResnap, onCancelResnap, resnapLabel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support camera access (needs HTTPS).");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
        setActive(true);
        setError(null);
      })
      .catch((err: unknown) => {
        const name = (err as { name?: string })?.name;
        setError(
          name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access, then try again."
            : name === "NotFoundError"
              ? "No camera found on this device."
              : `Camera error: ${(err as { message?: string })?.message ?? "unknown"}`
        );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [attempt]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const dataUrl = downscaleFrame(video);
    if (!dataUrl) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 200);
    if (resnapLabel) {
      onResnap({ dataUrl });
    } else {
      onCapture({ dataUrl });
    }
  };

  const snapRef = useRef<() => void>(() => {});
  snapRef.current = snap;

  useEffect(() => {
    const isVolumeUp = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      const code = e.code?.toLowerCase();
      return (
        key === "audiovolumeup" ||
        key === "volumeup" ||
        code === "audiovolumeup" ||
        code === "volumeup" ||
        e.keyCode === 175 ||
        e.keyCode === 183 ||
        e.which === 175
      );
    };
    const onKey = (e: KeyboardEvent) => {
      const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
      const isVolUp = isVolumeUp(e);
      if (!isSpace && !isVolUp) return;
      const target = e.target as HTMLElement | null;
      if (
        !isVolUp &&
        target &&
        (target.tagName === "BUTTON" ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }
      e.preventDefault();
      snapRef.current();
    };
    window.addEventListener("keydown", onKey);
    // Some Android browsers fire volume keys as keyup only
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  return (
    <div className={`cam-wrap${resnapLabel ? " resnap-mode" : ""}`}>
      <video ref={videoRef} playsInline muted className="cam-video" />
      {flash && <div className="cam-flash" />}
      {resnapLabel && (
        <div className="cam-resnap-chip">
          {resnapLabel}
          <button onClick={onCancelResnap} aria-label="Cancel re-snap">
            &times;
          </button>
        </div>
      )}
      {!active && !error && (
        <div className="cam-overlay">
          <span className="spinner" />
          <p>Starting camera…</p>
        </div>
      )}
      {error && (
        <div className="cam-overlay cam-error">
          <p>{error}</p>
          <button className="btn" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}
      <span className="kbd-hint">SPACE / VOL ↑</span>
      <button
        className={`snap-btn${resnapLabel ? " resnap" : ""}`}
        onClick={snap}
        disabled={!active}
        aria-label="Snap photo (Space or Volume Up)"
      >
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M9 3L7.2 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2.2L15 3H9zm3 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
        </svg>
      </button>
    </div>
  );
}