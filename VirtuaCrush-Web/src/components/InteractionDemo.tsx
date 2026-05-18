import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Heart, Sparkles } from "lucide-react";

export const InteractionDemo = () => {
    const [messages, setMessages] = useState<string[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [step, setStep] = useState(0);

    const script = [
        { user: "Hey Mina, I had a long day today...", delay: 2000 },
        { bot: "I can hear it in your words. Take a breath — I'm right here with you.", delay: 3000 },
        { user: "Thanks. It means a lot that you noticed.", delay: 2000 },
        { bot: "Always. You matter to me.", delay: 3000 }
    ];

    useEffect(() => {
        if (step >= script.length) {
            setTimeout(() => {
                setMessages([]);
                setStep(0);
            }, 5000);
            return;
        }

        const current = script[step];
        const timer = setTimeout(() => {
            if ("user" in current) {
                setMessages(prev => [...prev, `User: ${current.user}`]);
                setStep(s => s + 1);
            } else if ("bot" in current) {
                setIsTyping(true);
                setTimeout(() => {
                    setIsTyping(false);
                    setMessages(prev => [...prev, `Bot: ${current.bot}`]);
                    setStep(s => s + 1);
                }, 2000);
            }
        }, current.delay);

        return () => clearTimeout(timer);
    }, [step]);

    return (
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[400px] overflow-hidden rounded-[2.5rem] border border-white/15 shadow-2xl shadow-black/30 group">
            <video 
                autoPlay 
                muted 
                loop 
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
                poster="https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&q=80&w=800"
            >
                <source src="https://assets.mixkit.co/videos/preview/mixkit-beautiful-woman-smiling-and-looking-at-camera-40082-large.mp4" type="video/mp4" />
            </video>

            <div className="absolute inset-0 bg-gradient-to-t from-surface/85 via-surface/20 to-transparent" />

            <div className="absolute inset-0 flex flex-col justify-end p-6">
                <div className="absolute left-6 top-6 flex flex-col gap-2">
                    <motion.div 
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-stone-800 dark:text-stone-100"
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        New Post
                    </motion.div>
                    <motion.button
                        type="button"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        className="glass inline-flex items-center gap-2 rounded-full border border-black/[0.08] dark:border-white/[0.08] bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-stone-900 dark:text-stone-50 backdrop-blur-xl"
                    >
                        <Heart size={14} className="text-accent fill-accent/25" strokeWidth={2} />
                        <span className="tabular-nums">92</span>
                        <span className="font-normal text-stone-600 dark:text-stone-400">likes</span>
                    </motion.button>
                </div>

                <div className="mb-5 space-y-2.5">
                    <AnimatePresence mode="popLayout">
                        {messages.slice(-2).map((msg) => (
                            <motion.div
                                key={msg}
                                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
                                    msg.startsWith("User:") 
                                    ? "ml-auto rounded-tr-sm bg-gradient-to-br from-accent to-accent-deep text-white shadow-md" 
                                    : "rounded-tl-sm border border-black/[0.08] dark:border-white/[0.08] bg-stone-100 dark:bg-stone-900/75 text-stone-800 dark:text-stone-100 shadow-sm backdrop-blur-md"
                                }`}
                            >
                                {msg.replace(/^(User|Bot): /, '')}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    
                    {isTyping && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="inline-flex w-fit items-center gap-2 rounded-2xl rounded-tl-sm border border-black/[0.08] dark:border-white/[0.08] bg-stone-100 dark:bg-stone-900/75 px-3 py-2 backdrop-blur-md"
                        >
                            <span className="flex gap-1" aria-hidden>
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-duration:0.5s]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:0.15s] [animation-duration:0.5s]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:0.3s] [animation-duration:0.5s]" />
                            </span>
                            <span className="text-[11px] text-stone-600 dark:text-stone-400">Typing…</span>
                        </motion.div>
                    )}
                </div>

                <div className="flex h-11 w-full items-center gap-0.5 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-white/[0.06] px-2.5 backdrop-blur-xl">
                    {[...Array(24)].map((_, i) => (
                        <motion.div
                            key={i}
                            animate={{ 
                                height: [6, Math.random() * 20 + 4, 6],
                            }}
                            transition={{ 
                                repeat: Infinity, 
                                duration: 0.5 + Math.random(),
                                ease: "easeInOut"
                            }}
                            className="min-h-[3px] flex-1 rounded-full bg-accent/45"
                        />
                    ))}
                </div>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent/0 opacity-0 transition-all duration-300 group-hover:pointer-events-auto group-hover:bg-black/35 group-hover:opacity-100 group-hover:backdrop-blur-[2px]">
                 <button type="button" className="pointer-events-auto flex translate-y-3 transform items-center gap-2 rounded-2xl bg-stone-100 px-6 py-3 font-semibold text-surface shadow-lg transition-transform duration-300 group-hover:translate-y-0">
                     <Sparkles size={18} className="text-accent" />
                     Open feed
                 </button>
            </div>
        </div>
    );
};
