import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  title: string;
  onClose: () => void;
}

export function Lightbox({ src, title, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startPanX: 0, startPanY: 0, hasMoved: false });

  const zoomIn = () => setZoom((z) => Math.min(4, Math.round((z + 0.5) * 10) / 10));
  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(1, Math.round((z - 0.5) * 10) / 10);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") resetZoom();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((z) => {
      const next = Math.max(1, Math.min(4, Math.round((z + delta) * 10) / 10));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      hasMoved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStartRef.current.hasMoved = true;
    }
    setPan({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleImageClick = (e: React.MouseEvent) => {
    // If user dragged, don't toggle zoom
    if (dragStartRef.current.hasMoved) return;
    e.stopPropagation();
    if (zoom === 1) {
      setZoom(2);
    } else {
      resetZoom();
    }
  };

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label={title}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-head">
          <div className="lightbox-title-group">
            <span>{title}</span>
            <span className="lightbox-zoom-badge">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="lightbox-controls">
            <button
              type="button"
              className="lightbox-ctrl-btn"
              onClick={zoomOut}
              disabled={zoom <= 1}
              aria-label="Zoom out"
              title="Zoom out (-)"
            >
              &minus;
            </button>
            <button
              type="button"
              className="lightbox-ctrl-btn"
              onClick={zoomIn}
              disabled={zoom >= 4}
              aria-label="Zoom in"
              title="Zoom in (+)"
            >
              +
            </button>
            {zoom > 1 && (
              <button
                type="button"
                className="lightbox-ctrl-btn reset"
                onClick={resetZoom}
                title="Reset zoom (0)"
              >
                Reset
              </button>
            )}
            <button className="btn-close lightbox-close" onClick={onClose} title="Close (Esc)">
              &times;
            </button>
          </div>
        </div>

        <div
          className={`lightbox-canvas${zoom > 1 ? " is-zoomed" : ""}${isDragging ? " is-dragging" : ""}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            src={src}
            alt={title}
            className="lightbox-img"
            onClick={handleImageClick}
            draggable={false}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.15s ease-out",
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
            }}
          />
        </div>

        <p className="lightbox-hint">
          {zoom > 1
            ? "Drag to pan • Click to reset • Scroll or +/- to zoom"
            : "Click to zoom • Scroll to adjust • Esc to close"}
        </p>
      </div>
    </div>
  );
}