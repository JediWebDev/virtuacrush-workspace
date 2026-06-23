import { AnimatePresence, motion } from "framer-motion";
import { Send, X, Loader2 } from "lucide-react";
import { parseScript } from "../lib/script";
import { splitNarration } from "../lib/narration";

export interface DialogueMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  open: boolean;
  character: { name: string; image: string };
  playerName?: string;
  playerAvatar: string;
  /** The most recent message in the conversation (the line currently "spoken"). */
  message: DialogueMessage | null;
  /** A reply is streaming / the partner is "typing". */
  loading?: boolean;
  /** The opening greeting is still being fetched. */
  greeting?: boolean;
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  inputDisabled?: boolean;
  placeholder?: string;
}

interface Speaker {
  name: string;
  avatar: string | null;
  initial: string;
  isPlayer: boolean;
}

/**
 * Classic JRPG dialogue box: a translucent panel pinned to the bottom of the
 * game canvas with a name plate, the speaker's portrait, and the line they are
 * currently saying. The world stays visible behind it. Player input is free
 * text — there are no multiple-choice replies.
 */
export default function DialogueBox({
  open,
  character,
  playerName = "You",
  playerAvatar,
  message,
  loading = false,
  greeting = false,
  input,
  onInput,
  onSend,
  onClose,
  inputDisabled = false,
  placeholder,
}: Props) {
  // While a reply is incoming (player just spoke, or the assistant turn is
  // still empty) the box shows the partner "typing".
  const showTyping =
    greeting ||
    (loading && (!message || message.role === "user" || !message.content.trim()));

  const playerSpeaking = !showTyping && message?.role === "user";

  // Parse the assistant turn so we can attribute the line to its real speaker
  // (the companion, or a scene NPC like a barista / security).
  const bubbles =
    !playerSpeaking && message && message.role === "assistant"
      ? parseScript(message.content, character.name).filter((b) => b.kind !== "narrator" || b.text.trim())
      : [];
  const lastVoiced = [...bubbles].reverse().find((b) => b.kind !== "narrator");

  const speaker: Speaker = playerSpeaking
    ? { name: playerName, avatar: playerAvatar, initial: playerName.charAt(0), isPlayer: true }
    : lastVoiced && lastVoiced.kind === "npc"
      ? { name: lastVoiced.name, avatar: null, initial: lastVoiced.name.charAt(0), isPlayer: false }
      : { name: character.name, avatar: character.image, initial: character.name.charAt(0), isPlayer: false };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="dialogue-box"
          initial={{ y: "110%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "110%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 280 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-stretch gap-2 p-3 sm:p-4"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-3xl">
            {/* Name plate */}
            <div className="ml-1 inline-flex max-w-[70%] items-center rounded-xl border-[3px] border-sky-300/70 bg-slate-900/90 px-4 py-1 shadow-lg">
              <span className="truncate font-mono text-sm font-bold tracking-wide text-sky-50">
                {speaker.name}
              </span>
            </div>

            {/* Dialogue panel */}
            <div className="relative -mt-1 flex gap-3 rounded-2xl border-[3px] border-sky-300/70 bg-slate-900/85 p-3 shadow-[0_-10px_40px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-4 sm:p-4">
              {/* Portrait */}
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-[3px] border-sky-300/60 bg-slate-800 sm:h-28 sm:w-28">
                {speaker.avatar ? (
                  <img src={speaker.avatar} alt="" className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-mono text-3xl font-bold text-sky-200/80">
                    {speaker.initial.toUpperCase()}
                  </div>
                )}
              </div>

              {/* Line */}
              <div className="flex min-h-[6rem] min-w-0 flex-1 flex-col sm:min-h-[7rem]">
                <div className="no-scrollbar max-h-[34vh] flex-1 overflow-y-auto pr-1">
                  {showTyping ? (
                    <span className="flex items-center gap-1.5 py-2" aria-label="Typing">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-200/80 [animation-duration:0.55s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-200/80 [animation-delay:0.12s] [animation-duration:0.55s]" />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-200/80 [animation-delay:0.24s] [animation-duration:0.55s]" />
                    </span>
                  ) : playerSpeaking ? (
                    <p className="font-mono text-[15px] leading-relaxed text-sky-50">
                      {splitNarration(message!.content).map((seg, i) => (
                        <span key={i}>
                          {i > 0 ? " " : ""}
                          {seg.type === "narration" ? (
                            <em className="italic text-sky-200/70">{seg.text}</em>
                          ) : (
                            seg.text
                          )}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {bubbles.map((bub, bi) => {
                        if (bub.kind === "narrator") {
                          return (
                            <p key={bi} className="font-mono text-[13px] italic leading-relaxed text-sky-200/55">
                              {bub.text}
                            </p>
                          );
                        }
                        const segs = splitNarration(bub.text);
                        return (
                          <p key={bi} className="font-mono text-[15px] leading-relaxed text-sky-50">
                            {bub.kind === "npc" && (
                              <span className="mr-1.5 font-bold text-amber-300">{bub.name}:</span>
                            )}
                            {segs.map((seg, j) => (
                              <span key={j}>
                                {j > 0 ? " " : ""}
                                {seg.type === "narration" ? (
                                  <em className="italic text-sky-200/70">{seg.text}</em>
                                ) : (
                                  seg.text
                                )}
                              </span>
                            ))}
                          </p>
                        );
                      })}
                      {bubbles.length === 0 && (
                        <p className="font-mono text-[15px] italic leading-relaxed text-sky-200/60">…</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close conversation"
                className="absolute right-2 top-2 rounded-lg p-1 text-sky-200/60 transition-colors hover:bg-white/10 hover:text-sky-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Free-text input */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !inputDisabled && input.trim()) onSend();
                }}
                placeholder={placeholder ?? `Say something to ${speaker.isPlayer ? character.name : speaker.name}…`}
                disabled={inputDisabled}
                className="min-h-[48px] flex-1 rounded-xl border-2 border-sky-300/50 bg-slate-900/80 px-4 py-2.5 font-mono text-[15px] text-sky-50 outline-none backdrop-blur-md transition-colors placeholder:text-sky-200/40 focus:border-sky-300/90 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={inputDisabled || !input.trim()}
                aria-label="Send"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-sky-300/60 bg-sky-400/90 text-slate-900 transition-all hover:bg-sky-300 active:scale-95 disabled:opacity-45"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} />}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
