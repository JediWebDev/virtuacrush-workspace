// Shared publish/visibility control for Story Studio list items (Phase 4).
// Shows the current sharing status and a button to publish (runs server-side
// moderation) or make private again.
import { Loader2, Globe, Lock, ShieldAlert } from "lucide-react";

interface Props {
  visibility?: "private" | "public";
  moderationStatus?: "pending" | "approved" | "rejected";
  moderationReason?: string | null;
  busy?: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}

export default function PublishControl({
  visibility = "private",
  moderationStatus = "approved",
  moderationReason,
  busy = false,
  onPublish,
  onUnpublish,
}: Props) {
  const isPublic = visibility === "public" && moderationStatus === "approved";
  const isRejected = moderationStatus === "rejected";

  return (
    <div className="mt-2 border-t border-black/5 dark:border-white/5 pt-2">
      {isPublic ? (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Globe size={12} /> Public
          </span>
          <button
            type="button"
            onClick={onUnpublish}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 transition-colors hover:text-stone-800 disabled:opacity-50 dark:hover:text-stone-200"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />} Make private
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-400">
            {isRejected ? <ShieldAlert size={12} className="text-red-500" /> : <Lock size={12} />}
            {isRejected ? "Not approved" : "Private"}
          </span>
          <button
            type="button"
            onClick={onPublish}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Globe size={11} />}
            {isRejected ? "Try again" : "Publish"}
          </button>
        </div>
      )}
      {isRejected && moderationReason && (
        <p className="mt-1 text-[11px] text-red-500">{moderationReason}</p>
      )}
    </div>
  );
}
