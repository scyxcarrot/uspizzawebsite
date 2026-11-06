import Link from "next/link";
import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/chat/markdown";

/** Renders model output as React elements. Never uses raw HTML. */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) =>
        block.type === "paragraph" ? (
          <p key={i} className="whitespace-pre-wrap">
            <Inlines nodes={block.children} />
          </p>
        ) : block.ordered ? (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <Fragment key={i}>{node.text}</Fragment>;
          case "bold":
            return (
              <strong key={i}>
                <Inlines nodes={node.children} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Inlines nodes={node.children} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-crust px-1 py-0.5 text-[0.9em]">
                {node.text}
              </code>
            );
          case "link":
            return node.internal ? (
              <Link key={i} href={node.href} className="font-semibold text-brand underline underline-offset-2">
                {node.text}
              </Link>
            ) : (
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-words font-semibold text-brand underline underline-offset-2"
              >
                {node.text}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            );
        }
      })}
    </>
  );
}
