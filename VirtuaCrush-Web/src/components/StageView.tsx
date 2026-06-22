import { motion } from 'motion/react';
import { MapPin, Phone, Users } from 'lucide-react';
import { assetUrl } from '../lib/api';
import type { ActorSlot, ScenePresentation } from '../types/scenePresentation';

interface Props {
  presentation: ScenePresentation | null;
  companionPortraitFallback?: string;
  playerPortraitSrc?: string;
  className?: string;
}

function portraitSrc(actor: ActorSlot, companionFallback?: string, playerSrc?: string): string | null {
  if (actor.portraitKey) return assetUrl(actor.portraitKey);
  if (actor.id === 'companion' && companionFallback) return companionFallback;
  if (actor.id === 'player' && playerSrc) return playerSrc;
  return null;
}

function poseClass(pose: ActorSlot['pose']): string {
  switch (pose) {
    case 'angry':
      return 'brightness-95 saturate-125 hue-rotate-[-8deg]';
    case 'shy':
      return 'brightness-90 opacity-95';
    case 'scared':
      return 'brightness-90 contrast-110';
    case 'gagged':
      return 'brightness-95 opacity-90';
    case 'restrained':
      return 'brightness-90';
    case 'playful':
      return 'brightness-105 saturate-110';
    case 'warm':
      return 'brightness-105';
    default:
      return '';
  }
}

function ActorSprite({
  actor,
  companionFallback,
  playerSrc,
  animateShake,
}: {
  actor: ActorSlot;
  companionFallback?: string;
  playerSrc?: string;
  animateShake?: boolean;
}) {
  if (!actor.visible || actor.align === 'hidden') return null;
  const src = portraitSrc(actor, companionFallback, playerSrc);
  const alignClass =
    actor.align === 'left' ? 'self-end -translate-x-2' :
    actor.align === 'right' ? 'self-end translate-x-2' :
    'self-end';

  return (
    <motion.div
      key={actor.id}
      className={`relative flex flex-col items-center ${alignClass}`}
      initial={{ opacity: 0, y: 12 }}
      animate={animateShake ? { opacity: 1, y: 0, x: [0, -4, 4, -3, 3, 0] } : { opacity: 1, y: 0 }}
      transition={{ duration: animateShake ? 0.45 : 0.35 }}
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-white/20 bg-black/20 shadow-lg shadow-black/30 ${
          actor.id === 'companion' ? 'h-24 w-24 md:h-28 md:w-28' : 'h-16 w-16 md:h-20 md:w-20'
        }`}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className={`h-full w-full object-cover object-top ${poseClass(actor.pose)}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/10 text-xs font-semibold text-white/80">
            {actor.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {actor.statusBadges.length > 0 && (
          <div className="absolute bottom-1 left-1 right-1 flex flex-wrap justify-center gap-0.5">
            {actor.statusBadges.map((badge) => (
              <span
                key={badge}
                className="rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-100"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="mt-1 max-w-[88px] truncate text-[10px] font-medium text-white/85">{actor.name}</span>
    </motion.div>
  );
}

export default function StageView({
  presentation,
  companionPortraitFallback,
  playerPortraitSrc,
  className = '',
}: Props) {
  if (!presentation) return null;

  const shakeCompanion = presentation.animations.some(
    (a) => a.target === 'companion' && a.kind === 'shake',
  );
  const pulseBg = presentation.animations.some(
    (a) => a.target === 'background' && a.kind === 'pulse',
  );
  const visibleActors = presentation.actors.filter((a) => a.visible && a.align !== 'hidden');
  const modeIcon =
    presentation.uiMode === 'chat_remote' ? <Phone size={12} /> :
    presentation.uiMode === 'chat_crisis' ? <Users size={12} /> :
    <MapPin size={12} />;

  return (
    <div
      className={`relative shrink-0 overflow-hidden border-b border-black/[0.06] dark:border-white/[0.06] ${className}`}
      aria-label={`Scene: ${presentation.locationLabel}`}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: presentation.backgroundGradient }}
        animate={pulseBg ? { opacity: [1, 0.88, 1] } : { opacity: 1 }}
        transition={{ duration: 0.8 }}
      />
      {presentation.backgroundKey ? (
        <img
          src={assetUrl(presentation.backgroundKey)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-overlay"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
      {presentation.overlays.includes('crisis_vignette') && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
      )}
      {presentation.overlays.includes('remote_connection') && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.25),transparent_55%)]" />
      )}

      <div className="relative flex min-h-[9.5rem] flex-col justify-between px-4 py-3 md:min-h-[11rem] md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex max-w-[75%] items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
            {modeIcon}
            <span className="truncate">{presentation.locationLabel}</span>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
            {presentation.uiMode === 'chat_remote' ? 'Remote' : presentation.uiMode === 'chat_crisis' ? 'Intense' : 'Together'}
          </span>
        </div>

        <div className="flex items-end justify-center gap-3 md:gap-6">
          {visibleActors.map((actor) => (
            <ActorSprite
              key={actor.id}
              actor={actor}
              companionFallback={companionPortraitFallback}
              playerSrc={playerPortraitSrc}
              animateShake={actor.id === 'companion' && shakeCompanion}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
