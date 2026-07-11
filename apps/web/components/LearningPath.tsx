"use client";

import type { Lesson } from "@touchproof/core";

/** The clipboard sidebar: the ordered lesson list (current one highlighted)
 * and a link to the current lesson's source. */
export function LearningPath({
  lessons,
  currentLessonId,
  currentLesson,
  busy,
  onStartLesson,
}: {
  lessons: readonly Lesson[];
  currentLessonId: string;
  currentLesson: Lesson | undefined;
  busy: boolean;
  onStartLesson: (lessonId: string) => void;
}) {
  return (
    <aside className="context-panel">
      <h2>Learning path</h2>
      <nav className="lesson-list" aria-label="Lessons">
        {lessons.map((lesson, index) => (
          <button
            className={lesson.id === currentLessonId ? "active" : ""}
            disabled={busy}
            key={lesson.id}
            onClick={() => onStartLesson(lesson.id)}
          ><span>{index + 1}</span><div><strong>{lesson.title}</strong><small>{lesson.concept}</small></div></button>
        ))}
      </nav>
      {currentLesson !== undefined && <a className="lesson-source" href={currentLesson.sourceUrl} target="_blank" rel="noreferrer">{currentLesson.source} ↗</a>}
    </aside>
  );
}
