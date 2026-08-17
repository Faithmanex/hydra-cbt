import { useEffect } from "react";

interface Props {
  src: string;
  title: string;
  onClose: () => void;
}

export function Lightbox({ src, title, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label={title}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-head">
          <span>{title}</span>
          <button className="btn-close lightbox-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <img src={src} alt={title} className="lightbox-img" />
        <p className="lightbox-hint">Click anywhere outside the image to close</p>
      </div>
    </div>
  );
}