import { useEffect, useRef, useState } from "react";
import darkVideo from "@/assets/baeshen-intro-dark.mp4.asset.json";
import lightVideo from "@/assets/baeshen-intro-light.mp4.asset.json";
import poster from "@/assets/baeshen-intro-poster.png.asset.json";

const STORAGE_KEY = "baeshen_intro_seen_v1";

export function IntroOverlay({ theme = "dark" as "dark" | "light" }) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    } catch {}
    setVisible(true);
  }, []);

  const finish = () => {
    setFading(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setTimeout(() => setVisible(false), 500);
  };

  useEffect(() => {
    if (!visible) return;
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
    const onEnd = () => finish();
    v.addEventListener("ended", onEnd);
    const t = setTimeout(finish, 11000);
    return () => {
      v.removeEventListener("ended", onEnd);
      clearTimeout(t);
    };
  }, [visible]);

  if (!visible) return null;

  const src = theme === "light" ? lightVideo.url : darkVideo.url;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      role="dialog"
      aria-label="Baeshen Medical Intro"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster.url}
        muted={muted}
        playsInline
        autoPlay
        className="w-full h-full object-contain"
      />
      <div className="absolute top-4 left-4 flex gap-2">
        <button
          onClick={() => {
            const v = videoRef.current;
            if (v) {
              v.muted = !v.muted;
              setMuted(v.muted);
            }
          }}
          className="rounded-full bg-white/10 hover:bg-white/20 backdrop-blur px-3 py-1.5 text-xs text-white border border-white/20"
          aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
        >
          {muted ? "🔇 تشغيل الصوت" : "🔊 كتم"}
        </button>
      </div>
      <button
        onClick={finish}
        className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur px-3 py-1.5 text-xs text-white border border-white/20"
        aria-label="تخطي"
      >
        تخطي ✕
      </button>
    </div>
  );
}
