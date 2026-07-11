"use client";

import type { Lesson } from "@touchproof/core";

/** The engineering title-block strip: chapter/concept eyebrow, lesson title,
 * the standing procedure note and the obligation progress counter. */
export function TitleBlock({
  lesson,
  solved,
  total,
}: {
  lesson: Lesson | undefined;
  solved: number;
  total: number;
}) {
  return (
    <section className="lesson-strip">
      <div><span className="eyebrow">{lesson?.chapter} · {lesson?.concept}</span><h1>{lesson?.title}</h1></div>
      <p>Transform both sides until they are visibly the same. Touch highlighted calls, then solve only the local obligations.</p>
      <div className="progress"><strong>{solved}/{total}</strong><span>obligations</span></div>
    </section>
  );
}
