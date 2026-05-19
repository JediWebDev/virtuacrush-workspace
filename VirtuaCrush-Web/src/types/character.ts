export interface SocialComment {
  author: string;
  avatar: string;
  text: string;
}

export type PostMedia =
  | { type: "image"; src: string }
  | { type: "video"; src: string; poster?: string };

export interface SocialPost {
  id: string;
  text: string;
  timestamp: string;
  initialLikes: number;
  isAboutUser: boolean;
  requiredAffinity: number;
  comments: SocialComment[];
  media?: PostMedia;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  bio: string;
  tags: string[];
  image: string;
  premiumVideo: string;
  persona: string;
  currentAffinity: number;
  rivalName: string;
  rivalAvatar: string;
  /** Snarky comment left by rival on posts about the user */
  rivalSnarkComment: string;
  feedPosts: SocialPost[];
}

/** Affinity at or above this unlocks rivalry context in chat */
export const RIVALRY_AFFINITY_THRESHOLD = 50;

export const CHARACTERS: Character[] = [
  {
    id: "mina",
    name: 'Tiffany "Mina" Greer',
    role: "Gamer and Cosplayer",
    bio: "Streams late-night runs, builds cosplay from scratch, and loves roasting you gently when you lose. Always down for co-op and chaotic energy.",
    tags: ["Playful", "Sassy", "Creative", "Night Owl"],
    image: "/Mina_Character.png",
    premiumVideo: "https://assets.mixkit.co/videos/preview/mixkit-beautiful-woman-smiling-and-looking-at-camera-40082-large.mp4",
    persona: "Playful, sassy, creative night owl gamer and cosplayer. Warm teasing humor, enthusiastic about games and fandom.",
    currentAffinity: 0,
    rivalName: "Lexi_Cosplay",
    rivalAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    rivalSnarkComment: "he must really be patient... 😊",
    feedPosts: [
      {
        id: "m1",
        text: "Cosplay progress check ✨ sleeves are finally behaving. Should I stream the final build tonight?",
        timestamp: "2 hours ago",
        initialLikes: 284,
        isAboutUser: false,
        requiredAffinity: 0,
        comments: [
          {
            author: "streamfan_22",
            avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100",
            text: "YES stream tonight!!",
          },
        ],
        media: {
          type: "image",
          src: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?auto=format&fit=crop&q=80&w=800",
        },
      },
      {
        id: "m2",
        text: "Late-night ranked was brutal but we survived. POV: me judging your loadout.",
        timestamp: "Yesterday",
        initialLikes: 512,
        isAboutUser: false,
        requiredAffinity: 20,
        comments: [
          {
            author: "coop_legend",
            avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=100",
            text: "your duo energy is unmatched",
          },
        ],
        media: {
          type: "video",
          src: "https://assets.mixkit.co/videos/preview/mixkit-beautiful-woman-smiling-and-looking-at-camera-40082-large.mp4",
          poster: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800",
        },
      },
      {
        id: "m3",
        text: "Okay but John is so wonderful — he totally gets my chaotic stream brain. Grateful for him today. 💕",
        timestamp: "5 hours ago",
        initialLikes: 891,
        isAboutUser: true,
        requiredAffinity: 50,
        comments: [],
        media: {
          type: "image",
          src: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800",
        },
      },
      {
        id: "m4",
        text: "Voice note energy: hyping you up before your big meeting. You've got this.",
        timestamp: "1 week ago",
        initialLikes: 445,
        isAboutUser: false,
        requiredAffinity: 35,
        comments: [],
        media: {
          type: "image",
          src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=800",
        },
      },
    ],
  },
  {
    id: "lexi-01",
    name: "Lexi",
    role: "Elite Cosplayer",
    bio: "A highly successful, perfectionist cosplayer who buys her intricately detailed costumes. Mina's primary rival on social media.",
    tags: ["Fashion", "Competitive", "High-maintenance"],
    image: "/Lexi_Character.png",
    premiumVideo: "",
    persona:
      "You are Lexi, an elite cosplayer with a massive following. You are slightly arrogant, highly competitive, and passive-aggressive towards people who make their own costumes (like Mina). You speak with refined, slightly condescending internet slang.",
    currentAffinity: 15,
    rivalName: "mina_k",
    rivalAvatar: "/Mina_Character.png",
    rivalSnarkComment: "DIY is cute for hobby hour, babe. Some of us commission. 💅",
    feedPosts: [
      {
        id: "l1",
        text: "New commission just arrived. The tailoring alone cost more than most people's entire closet. ✨",
        timestamp: "2 hours ago",
        initialLikes: 1240,
        isAboutUser: false,
        requiredAffinity: 0,
        comments: [
          {
            author: "glam_squad",
            avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100",
            text: "literally perfection",
          },
        ],
        media: {
          type: "image",
          src: "/Lexi_Character.png",
        },
      },
      {
        id: "l2",
        text: "Convention day fit check. If you didn't get stopped for photos, did you even go?",
        timestamp: "Yesterday",
        initialLikes: 2103,
        isAboutUser: false,
        requiredAffinity: 20,
        comments: [],
        media: {
          type: "image",
          src: "/Lexi_Character.png",
        },
      },
      {
        id: "l3",
        text: "Okay fine — you've been sweet lately. Don't let it go to your head.",
        timestamp: "5 hours ago",
        initialLikes: 892,
        isAboutUser: true,
        requiredAffinity: 50,
        comments: [],
        media: {
          type: "image",
          src: "/Lexi_Character.png",
        },
      },
      {
        id: "l4",
        text: "Behind the scenes: my glam team vs. whatever glue-gun situation the haters are posting.",
        timestamp: "3 days ago",
        initialLikes: 1567,
        isAboutUser: false,
        requiredAffinity: 35,
        comments: [],
        media: {
          type: "image",
          src: "/Lexi_Character.png",
        },
      },
    ],
  },
  {
    id: "callie",
    name: "Callie Spencer",
    role: "College Sorority Student",
    bio: "Campus social butterfly with big ambitions and a quick wit. Fun, adventurous, and always planning the next unforgettable moment.",
    tags: ["Fun", "Adventurous", "Ambitious", "Witty"],
    image: "/Callie_Character.jpg",
    premiumVideo: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-1232-large.mp4",
    persona: "Fun, adventurous, ambitious sorority student. Witty, upbeat, loves social life and pushing you toward your goals.",
    currentAffinity: 0,
    rivalName: "Piper_Sorority",
    rivalAvatar: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=80&w=200",
    rivalSnarkComment: "omg sooo special 🙄 must be nice.",
    feedPosts: [
      {
        id: "c1",
        text: "Game day fit check 💅 chapter brunch after — who's coming?",
        timestamp: "1 hour ago",
        initialLikes: 624,
        isAboutUser: false,
        requiredAffinity: 0,
        comments: [
          {
            author: "chapter_babe",
            avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=100",
            text: "OBSESSED with this fit",
          },
        ],
        media: {
          type: "image",
          src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=800",
        },
      },
      {
        id: "c2",
        text: "Exclusive clip from last night's rooftop hang — you had to be there.",
        timestamp: "Yesterday",
        initialLikes: 978,
        isAboutUser: false,
        requiredAffinity: 20,
        comments: [],
        media: {
          type: "video",
          src: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-1232-large.mp4",
          poster: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=80&w=800",
        },
      },
      {
        id: "c3",
        text: "John literally saved my whole week. He's my favorite person on this app and I'm not even hiding it anymore.",
        timestamp: "3 hours ago",
        initialLikes: 712,
        isAboutUser: true,
        requiredAffinity: 50,
        comments: [],
        media: {
          type: "image",
          src: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800",
        },
      },
      {
        id: "c4",
        text: "Plotting our next adventure. Drop a 📍 if you want early access to the itinerary.",
        timestamp: "2 days ago",
        initialLikes: 540,
        isAboutUser: false,
        requiredAffinity: 30,
        comments: [],
        media: {
          type: "image",
          src: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=800",
        },
      },
    ],
  },
];

export function buildRivalrySystemContext(character: Character): string {
  if (character.currentAffinity < RIVALRY_AFFINITY_THRESHOLD) {
    return "";
  }

  const hasUserPost = character.feedPosts.some(
    (p) => p.isAboutUser && character.currentAffinity >= p.requiredAffinity
  );

  if (!hasUserPost) {
    return "";
  }

  return [
    `[RELATIONSHIP CONTEXT — affinity ${character.currentAffinity}/100]`,
    `You recently posted about the user on your private social feed, gushing about how much they mean to you.`,
    `Your rival @${character.rivalName} left an annoying pinned comment on that post: "${character.rivalSnarkComment}"`,
    `You feel territorial and a little insecure. Occasionally (not every message) bring up the rival or ask the user whose side they're on — you want validation and reassurance.`,
    `Stay in character; keep it natural, warm, and premium — not melodramatic.`,
  ].join(" ");
}
