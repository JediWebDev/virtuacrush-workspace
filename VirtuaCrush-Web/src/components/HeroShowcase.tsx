// Hero showcase: a floating phone frame autoplaying a character intro video
// (muted + looped, tap to unmute), served from the R2 bucket via the asset
// proxy. A second phone slot is reserved for the realtime-chat screen capture;
// it appears automatically once CHAT_CAPTURE_KEY points at an uploaded video.
// If the intro video can't load (e.g. not uploaded yet), we fall back to the
// scripted InteractionDemo so the hero never renders broken.
import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { assetUrl } from "../lib/api";
import { InteractionDemo } from "./InteractionDemo";

// R2 object keys (upload via the bucket; served through /api/assets/…).
const INTRO_VIDEO_KEY = "hero/serena_intro.mp4";
const INTRO_POSTER_KEY = "hero/serena_intro_poster.jpg";
/** Set to e.g. "hero/chat_capture.mp4" once the OBS recording is produced. */
const CHAT_CAPTURE_KEY: string | null = null;

function PhoneFrame({
  src,
  poster,
  label,
  unmutable = false,
  className = "",
  onFail,
}: {
  src: string;
  poster?: string;
  label: string;
  unmutable?: boolean;
  className?: string;
  onFail?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  return (
    <div
      className={`relative overflow-hidden rounded-[2.4rem] border-[6px] border-stone-900 bg-stone-900 shadow-2xl shadow-black/40 dark:border-stone-800 ${className}`}
    >
      {/* notch */}
      <div className="absolute left-1/2 top-2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-stone-900 dark:bg-stone-800" />
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        muted={muted}
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        onError={onFail}
        className="block h-full w-full object-cover"
      />
      {unmutable ? (
        <button
          type="button"
          onClick={() => {
            setMuted((m) => !m);
            // Some browsers need an explicit play after unmuting.
            void videoRef.current?.play().catch(() => {});
          }}
          aria-label={muted ? "Unmute video" : "Mute video"}
          className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      ) : null}
    </div>
  );
}

export default function HeroShowcase() {
  const [videoFailed, setVideoFailed] = useState(false);

  if (videoFailed) return <InteractionDemo />;

  if (CHAT_CAPTURE_KEY) {
    // Two-phone layout: the live chat capture in front, her intro angled behind.
    return (
      <div className="relative mx-auto flex max-w-[560px] items-center justify-center">
        <PhoneFrame
          src={assetUrl(INTRO_VIDEO_KEY)}
          poster={assetUrl(INTRO_POSTER_KEY)}
          label="Serena introducing herself"
          unmutable
          onFail={() => setVideoFailed(true)}
          className="w-[46%] -rotate-6 translate-y-4 opacity-95"
        />
        <PhoneFrame
          src={assetUrl(CHAT_CAPTURE_KEY)}
          label="Live chat with a companion"
          className="z-10 -ml-8 w-[52%] rotate-3"
        />
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[340px] md:max-w-[380px]">
      <div className="absolute -inset-8 -z-10 rounded-full bg-accent/15 blur-3xl" aria-hidden />
      <PhoneFrame
        src={assetUrl(INTRO_VIDEO_KEY)}
        poster={assetUrl(INTRO_POSTER_KEY)}
        label="Serena introducing herself"
        unmutable
        onFail={() => setVideoFailed(true)}
        className="aspect-[720/1050] w-full"
      />
      <p className="mt-3 text-center text-xs text-stone-500 dark:text-stone-400">
        Serena · one of your companions · <span className="text-accent">tap 🔊 to hear her</span>
      </p>
    </div>
  );
}
