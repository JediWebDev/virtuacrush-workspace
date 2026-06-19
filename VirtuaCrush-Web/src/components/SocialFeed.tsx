import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { Heart, MessageCircle, Lock } from "lucide-react";
import { Character, SocialPost, SocialComment } from "../types/character";
import type { UserTier } from "../types/subscription";
import { fetchDynamicPosts, type DynamicPost } from "../lib/api";

function displayName(fullName: string): string {
  const quoted = fullName.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  return fullName.split(" ")[0];
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Human relative time from an ISO timestamp, e.g. "Just now", "5m", "3h",
 *  "Yesterday", "4d". Falls back to a date for anything older than a week. */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Live relative time that re-computes every 60s so "Just now" ages correctly
 *  while the feed stays open. Returns `fallback` when there's no ISO timestamp. */
function useRelativeTime(iso: string | undefined, fallback: string): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [iso]);
  return iso ? formatRelativeTime(iso) : fallback;
}

function CommentRow({ comment, isRival = false }: { comment: SocialComment; isRival?: boolean }) {
  return (
    <div className={`flex gap-2.5 ${isRival ? "rounded-xl border border-accent/15 bg-accent/5 px-3 py-2.5" : "pl-1"}`}>
      <img src={comment.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
          <span className={`font-semibold ${isRival ? "text-accent" : "text-stone-700 dark:text-stone-200"}`}>@{comment.author}</span> {comment.text}
        </p>
      </div>
    </div>
  );
}

function buildCommentsForPost(post: SocialPost, character: Character): SocialComment[] {
  if (post.isAboutUser) {
    return [{ author: character.rivalName, avatar: character.rivalAvatar, text: character.rivalSnarkComment }, ...post.comments];
  }
  return post.comments;
}

function PostCard({ post, character, isLive }: { post: SocialPost; character: Character; isLive: boolean }) {
  const [likes, setLikes] = useState(post.initialLikes);
  const [heartPulse, setHeartPulse] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const comments = buildCommentsForPost(post, character);
  const timeLabel = useRelativeTime(post.createdAt, post.timestamp);

  useEffect(() => {
    setLikes(post.initialLikes);
  }, [post.id, post.initialLikes]);

  useEffect(() => {
    if (!isLive) return;
    const tick = () => {
      timerRef.current = setTimeout(() => {
        setLikes((p) => p + randomBetween(1, 4));
        setHeartPulse(true);
        pulseRef.current = setTimeout(() => setHeartPulse(false), 450);
        tick();
      }, randomBetween(5000, 15000));
    };
    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pulseRef.current) clearTimeout(pulseRef.current);
    };
  }, [isLive, post.id]);

  return (
    <article className="card-gradient-subtle overflow-hidden rounded-2xl shadow-sm">
      <div className="px-4 pt-4">
        <p className="text-[11px] font-medium text-stone-900 dark:text-stone-500">{timeLabel}</p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-200">{post.text}</p>
      </div>
      {post.media && (
        <div className="mt-3 overflow-hidden">
          {post.media.type === "image" ? (
            <img src={post.media.src} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <video src={post.media.src} poster={post.media.poster} muted playsInline loop className="aspect-video w-full object-cover" />
          )}
        </div>
      )}
      <div className="flex items-center gap-5 px-4 py-3">
        <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-accent">
          <motion.span animate={{ scale: heartPulse ? 1.25 : 1 }} transition={{ type: "spring", stiffness: 400, damping: 12 }} className="inline-flex">
            <Heart size={16} strokeWidth={1.75} className={heartPulse ? "text-accent" : ""} />
          </motion.span>
          <span className="tabular-nums">{likes}</span>
        </button>
        <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
          <MessageCircle size={16} strokeWidth={1.75} />
          <span className="tabular-nums">{comments.length}</span>
        </button>
      </div>
      {comments.length > 0 && (
        <div className="space-y-3 border-t border-black/[0.06] dark:border-white/[0.06] px-4 py-3">
          {comments.map((c, i) => (
            <CommentRow key={`${c.author}-${i}`} comment={c} isRival={post.isAboutUser && i === 0} />
          ))}
        </div>
      )}
    </article>
  );
}

interface SocialFeedProps {
  character: Character;
  className?: string;
  isActive?: boolean;
  userTier: UserTier;
  /** Bump to refetch dynamic posts (e.g. after a goal-advancing choice). */
  refreshKey?: number;
}

// A small pseudo-random but stable like count for a dynamic post.
function likesForPost(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 40 + (h % 260);
}

function dynamicToSocialPost(p: DynamicPost): SocialPost {
  return {
    id: `dyn-${p.id}`,
    text: p.text,
    timestamp: "Just now",
    createdAt: p.createdAt,
    initialLikes: likesForPost(p.id),
    isAboutUser: false,
    requiredAffinity: 0,
    comments: [],
    // Curated posts (synced from the R2 bucket) ship with an image.
    media: p.imageUrl ? { type: "image", src: p.imageUrl } : undefined,
  };
}

export default function SocialFeed({ character, className = "", isActive = true, userTier, refreshKey = 0 }: SocialFeedProps) {
  const name = displayName(character.name);
  const [dynamicPosts, setDynamicPosts] = useState<SocialPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchDynamicPosts(character.id)
      .then((posts) => { if (!cancelled) setDynamicPosts(posts.map(dynamicToSocialPost)); })
      .catch(() => { /* feed still works without dynamic posts */ });
    return () => { cancelled = true; };
  }, [character.id, refreshKey]);
  const feedPosts = character.feedPosts.slice(0, 4);
  const teaser = feedPosts[0];
  const showPaywall = userTier === "guest" || userTier === "free";
  const locked = showPaywall ? feedPosts.slice(1) : [];
  const unlockedPosts = showPaywall ? [] : feedPosts.slice(1);

  return (
    <aside className={`flex h-full flex-col border-black/[0.06] dark:border-brand-sapphire/20 bg-stone-100 dark:bg-surface-elevated/50 ${className}`}>
      <header className="shrink-0 border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-5">
        <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-50">{name}&apos;s Feed</h2>
        <p className="mt-0.5 text-xs text-stone-900 dark:text-stone-500">Exclusive Updates</p>
        {character.currentAffinity > 0 && (
          <p className="mt-2 text-[11px] font-medium text-accent">Affinity {character.currentAffinity}% · Live</p>
        )}
      </header>
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
        {dynamicPosts.map((post) => (
          <div key={post.id} className="mb-4">
            <PostCard post={post} character={character} isLive={isActive} />
          </div>
        ))}
        {!teaser ? (
          <p className="rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.03] p-4 text-center text-sm text-stone-900 dark:text-stone-500">
            Keep chatting to unlock more of {name}&apos;s feed.
          </p>
        ) : (
          <PostCard post={teaser} character={character} isLive={isActive} />
        )}
        {unlockedPosts.map((post) => (
          <div key={post.id} className="mt-4">
            <PostCard post={post} character={character} isLive={isActive} />
          </div>
        ))}
        {locked.length > 0 && (
          <div className="relative mt-4 overflow-hidden">
            <div className="space-y-4 opacity-40 blur-md select-none pointer-events-none" aria-hidden>
              {locked.map((post) => (
                <PostCard key={post.id} post={post} character={character} isLive={false} />
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-surface via-surface/80 to-transparent">
              <Lock size={32} strokeWidth={1.75} className="mb-4 text-accent" />
              <p className="max-w-xs text-center text-sm text-stone-600 dark:text-stone-300">
                Subscribe to unlock exclusive and private video and audio updates.
              </p>
              <button
                type="button"
                className="mt-5 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-colors hover:bg-accent-deep"
              >
                Upgrade to View
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
