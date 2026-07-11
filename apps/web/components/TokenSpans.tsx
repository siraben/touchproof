import type { Segment } from "@/lib/doc";

/** Ordered highlighted runs (doc segments or tokenizer output) as spans. */
export function TokenSpans({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.tag === undefined
          ? <span key={index}>{segment.text}</span>
          : <span key={index} className={`tok-${segment.tag}`}>{segment.text}</span>)}
    </>
  );
}
