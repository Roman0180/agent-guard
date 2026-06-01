import { describe, expect, it } from "vitest";

import { isApprovedLesson, type LessonSummary } from "./index.js";

describe("@agent-sidecar/lessons", () => {
  it("identifies approved lessons", () => {
    const lesson: LessonSummary = {
      id: "lesson_1",
      status: "approved",
      text: "Inspect service registration before editing constructors."
    };

    expect(isApprovedLesson(lesson)).toBe(true);
  });
});
