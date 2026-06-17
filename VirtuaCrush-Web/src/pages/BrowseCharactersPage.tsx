import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { CHARACTERS, Character } from "../types/character";
import type { UserTier } from "../types/subscription";
import CompanionCard from "../components/CompanionCard";
import { listStudioCharacters } from "../lib/api";
import { studioToCharacter } from "../lib/customCharacter";

interface BrowseCharactersPageProps {
  onSelect: (c: Character) => void;
  userTier: UserTier;
}

function matchesQuery(char: Character, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    char.name.toLowerCase().includes(q) ||
    char.role.toLowerCase().includes(q) ||
    char.bio.toLowerCase().includes(q) ||
    char.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export default function BrowseCharactersPage({ onSelect, userTier }: BrowseCharactersPageProps) {
  const [customChars, setCustomChars] = useState<Character[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listStudioCharacters()
      .then((chars) => setCustomChars(chars.map(studioToCharacter)))
      .catch(() => setCustomChars([]));
  }, []);

  const filteredCustom = useMemo(
    () => customChars.filter((c) => matchesQuery(c, query)),
    [customChars, query],
  );
  const filteredBuiltIn = useMemo(
    () => CHARACTERS.filter((c) => matchesQuery(c, query)),
    [query],
  );
  const hasResults = filteredCustom.length > 0 || filteredBuiltIn.length > 0;

  return (
    <main className="relative px-6 pb-24 pt-4 md:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12">
          <h1 className="font-serif text-4xl font-bold text-stone-900 dark:text-stone-50 md:text-5xl">Browse Characters</h1>
          <p className="mt-3 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            Meet every character on VirtuaCrush — built-in companions and ones you&apos;ve created in Studio.
          </p>
          <div className="relative mt-6 max-w-md">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-stone-800 dark:text-stone-100 outline-none transition-colors placeholder:text-stone-500 focus:border-accent/35 focus:ring-2 focus:ring-accent/10"
            />
          </div>
        </div>

        {!hasResults ? (
          <p className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-6 text-sm text-stone-500">
            {query.trim()
              ? `No characters match "${query.trim()}".`
              : "No characters to show yet."}
            {query.trim() ? (
              <>
                {" "}
                <Link to="/studio" className="font-semibold text-accent hover:text-accent-deep">
                  Create one in Studio
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <>
            {filteredCustom.length > 0 && (
              <section className="mb-16">
                <h2 className="mb-6 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50">My companions</h2>
                <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:gap-12">
                  {filteredCustom.map((char) => (
                    <CompanionCard
                      key={char.id}
                      character={char}
                      onSelect={onSelect}
                      userTier={userTier}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredBuiltIn.length > 0 && (
              <section>
                {filteredCustom.length > 0 && (
                  <h2 className="mb-6 font-serif text-2xl font-bold text-stone-900 dark:text-stone-50">VirtuaCrush roster</h2>
                )}
                <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:gap-12">
                  {filteredBuiltIn.map((char) => (
                    <CompanionCard
                      key={char.id}
                      character={char}
                      onSelect={onSelect}
                      userTier={userTier}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
