export type LessonStatus = "candidate" | "approved" | "disabled" | "expired";

export type LessonSummary = {
  id: string;
  status: LessonStatus;
  text: string;
};

export function isApprovedLesson(lesson: LessonSummary): boolean {
  return lesson.status === "approved";
}
