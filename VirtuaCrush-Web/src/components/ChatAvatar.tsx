type ChatAvatarVariant = "user" | "companion" | "npc";

const variantClass: Record<ChatAvatarVariant, string> = {
  user: "ring-2 ring-accent/30 shadow-md shadow-accent/25",
  companion: "ring-2 ring-brand-sapphire/25",
  npc: "border border-amber-500/30 bg-amber-500/15",
};

interface ChatAvatarProps {
  src?: string;
  alt: string;
  variant: ChatAvatarVariant;
  /** Shown when no image src is available (NPCs). */
  fallbackInitial?: string;
}

export default function ChatAvatar({ src, alt, variant, fallbackInitial }: ChatAvatarProps) {
  if (src) {
    return (
      <div
        className={`mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full ${variantClass[variant]}`}
      >
        <img src={src} alt={alt} className="h-full w-full object-cover object-top" />
      </div>
    );
  }

  const initial = (fallbackInitial?.trim()[0] || "?").toUpperCase();
  return (
    <div
      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${variantClass[variant]} ${
        variant === "npc" ? "text-amber-700 dark:text-amber-300" : ""
      }`}
    >
      <span className="text-[11px]">{initial}</span>
    </div>
  );
}
