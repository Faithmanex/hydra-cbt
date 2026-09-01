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

function downscaleFrame(
  video: HTMLVideoElement,
  zoom = 1,
  isHardwareZoom = false
): string {
  const maxDim = 1280;
  const effectiveZoom = isHardwareZoom ? 1 : Math.max(1, zoom);
  const sw = video.videoWidth / effectiveZoom;
  const sh = video.videoHeight / effectiveZoom;
  const sx = (video.videoWidth - sw) / 2;
  const sy = (video.videoHeight - sh) / 2;

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function Camera({ onCapture, onResnap, onCancelResnap, resnapLabel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);
  const zoomCapsRef = useRef<{ min: number; max: number; step: number } | null>(null);

  const applyZoom = async (val: number) => {
    const next = Math.max(1, Math.min(4, Math.round(val * 10) / 10));
    setZoom(next);

    const track = streamRef.current?.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === "function") {
      const caps = track.getCapabilities() as {
        zoom?: { min: number; max: number; step: number };
      };
      if (caps && caps.zoom) {
        try {
          const hw = Math.max(caps.zoom.min, Math.min(caps.zoom.max, next));
          await track.applyConstraints({
            advanced: [{ zoom: hw } as unknown as MediaTrackConstraintSet],
          });
          setHasHardwareZoom(true);
          return;
        } catch {
          setHasHardwareZoom(false);
        }
      }
    }
    setHasHardwareZoom(false);
  };

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
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === "function") {
          const caps = track.getCapabilities() as {
            zoom?: { min: number; max: number; step: number };
          };
          if (caps && caps.zoom) {
            zoomCapsRef.current = caps.zoom;
            setHasHardwareZoom(true);
          } else {
            zoomCapsRef.current = null;
            setHasHardwareZoom(false);
          }
        }
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
    const dataUrl = downscaleFrame(video, zoom, hasHardwareZoom);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (
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
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    void applyZoom(zoom + delta);
  };

  return (
    <div className={`cam-wrap${resnapLabel ? " resnap-mode" : ""}`} onWheel={handleWheel}>
      <div className="cam-viewport">
        <video
          ref={videoRef}
          playsInline
          muted
          className="cam-video"
          style={
            !hasHardwareZoom && zoom > 1
              ? {
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease-out",
                }
              : undefined
          }
        />
      </div>
      {flash && <div className="cam-flash" />}
      {resnapLabel && (
        <div className="cam-resnap-chip">
          <span>{resnapLabel}</span>
          <button onClick={onCancelResnap} aria-label="Cancel re-snap">
            Cancel
          </button>
        </div>
      )}

      {/* Zoom Control Pill Bar */}
      {active && (
        <div className="cam-zoom-bar">
          <div className="zoom-presets">
            {[1, 1.5, 2, 3].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`zoom-preset-btn${Math.abs(zoom - preset) < 0.05 ? " active" : ""}`}
                onClick={() => void applyZoom(preset)}
                aria-label={`Zoom ${preset}x`}
              >
                {preset}x
              </button>
            ))}
          </div>
          <div className="zoom-slider-wrap">
            <input
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={zoom}
              onChange={(e) => void applyZoom(parseFloat(e.target.value))}
              className="zoom-slider"
              aria-label="Camera Zoom Level"
            />
            <span className="zoom-label">{zoom.toFixed(1)}x</span>
          </div>
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
      <span className="kbd-hint">SPACE</span>
      <button
        className={`snap-btn${resnapLabel ? " resnap" : ""}`}
        onClick={snap}
        disabled={!active}
        aria-label="Snap photo"
      >
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M9 3L7.2 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2.2L15 3H9zm3 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
        </svg>
      </button>
    </div>
  );
}