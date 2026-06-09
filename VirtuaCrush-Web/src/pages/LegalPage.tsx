import { useMemo } from "react";
import type { ReactNode } from "react";

interface LegalPageProps {
  markdown: string;
}

/** Renders **bold** spans within a line of text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-stone-900 dark:text-stone-100">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

/**
 * Minimal markdown renderer for our legal documents.
 * Supports: # / ## / ### headings, "- " bullet lists, "---" rules,
 * **bold** spans, and paragraphs. Keeps the .md files as the source of truth.
 */
function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={key++} className="mb-4 leading-relaxed">
        {renderInline(paragraph.join(" "), `p${key}`)}
      </p>
    );
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key++} className="mb-4 list-disc space-y-2 pl-6">
        {list.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {renderInline(item, `li${key}-${i}`)}
          </li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      flushList();
    } else if (line === "---") {
      flushParagraph();
      flushList();
      blocks.push(<hr key={key++} className="my-8 border-black/10 dark:border-white/10" />);
    } else if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={key++} className="mb-3 mt-6 text-base font-semibold text-stone-900 dark:text-stone-100">
          {renderInline(line.slice(4), `h3${key}`)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={key++} className="mb-4 mt-10 font-serif text-xl font-bold text-stone-900 dark:text-white">
          {renderInline(line.slice(3), `h2${key}`)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h1 key={key++} className="mb-6 font-serif text-3xl font-bold tracking-tight text-stone-900 dark:text-white">
          {renderInline(line.slice(2), `h1${key}`)}
        </h1>
      );
    } else if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.slice(2));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return blocks;
}

export default function LegalPage({ markdown }: LegalPageProps) {
  const content = useMemo(() => renderMarkdown(markdown), [markdown]);

  return (
    <main className="px-6 pb-16 md:px-12">
      <article className="mx-auto max-w-3xl text-sm text-stone-600 dark:text-stone-400">
        {content}
      </article>
    </main>
  );
}
