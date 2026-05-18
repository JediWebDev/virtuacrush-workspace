import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CHARACTERS, Character } from "../types/character";
import CompanionCard from "../components/CompanionCard";

interface BrowseCharactersPageProps {
  onSelect: (c: Character) => void;
}

export default function BrowseCharactersPage({ onSelect }: BrowseCharactersPageProps) {
  return (
    <main className="relative px-6 pb-24 pt-4 md:px-12">
      <div className="mx-auto max-w-7xl">

        <div className="mb-12">
          <h1 className="font-serif text-4xl font-bold text-stone-900 dark:text-stone-50 md:text-5xl">Browse Characters</h1>
          <p className="mt-3 max-w-2xl text-lg text-stone-600 dark:text-stone-400">
            Meet every companion on VirtuaCrush. Tap a profile to start a conversation or watch their intro.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 xl:gap-12">
          {CHARACTERS.map((char) => (
            <CompanionCard
              key={char.id}
              character={char}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
