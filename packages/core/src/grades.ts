/** Stable storage codes keep existing stock and matching rules intact. */
export const CONDITION_GRADES = ["N", "A", "B", "C"] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];
export const GRADE_LABELS: Record<ConditionGrade, string> = {
  N: "New", A: "Like New", B: "Used", C: "Fair",
};
export const gradeLabel = (grade: string | null | undefined) => GRADE_LABELS[grade as ConditionGrade] ?? "Not assessed";
export const GRADE_GUIDANCE: Record<ConditionGrade, string> = {
  N: "New and unused. Do not use this label for refurbished or previously used items.",
  A: "Near-new appearance, with no significant visible wear. Previously owned or used.",
  B: "Visible signs of use, such as scratches or small dents. Describe and photograph them.",
  C: "Noticeable wear or cosmetic damage. Describe and photograph every material defect.",
};
