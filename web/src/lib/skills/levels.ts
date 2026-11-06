/** 技能等級（規格 5 節）。null＝未評估，不是 0。 */
export const SKILL_LEVELS = [0, 1, 2, 3, 4] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  0: "未接觸",
  1: "知道概念",
  2: "能解釋",
  3: "能實作",
  4: "能獨立應用",
};

export const SKILL_LEVEL_HINTS: Record<SkillLevel, string> = {
  0: "尚未學習",
  1: "能辨認並簡單描述",
  2: "能說明原理與用途",
  3: "能依文件完成基本實作",
  4: "能處理常見問題並做合理取捨",
};

export const UNASSESSED_LABEL = "未評估";

export function levelLabel(level: number | null | undefined): string {
  if (level === null || level === undefined) return UNASSESSED_LABEL;
  return SKILL_LEVEL_LABELS[level as SkillLevel] ?? String(level);
}

export const EVIDENCE_LABELS: Record<string, string> = {
  self_assessment: "自評",
  quiz: "測驗",
  project: "實作",
  interview_practice: "面試練習",
};

export const REQUIREMENT_WEIGHT = { required: 3, preferred: 1 } as const;

export interface PriorityInput {
  requirementType: "required" | "preferred";
  requiredLevel: number;
  /** null＝未評估 */
  currentLevel: number | null;
  goalWeight: number;
}

export interface PriorityResult {
  /** null＝未評估，不算分 */
  score: number | null;
  gap: number | null;
  /** 可解釋的理由（規格：前端要顯示「為什麼這項技能排在前面」） */
  reasons: string[];
}

/** priority = requirement_weight × skill_gap × user_goal_weight（規格 5 節），未評估不推定為 0 */
export function computePriority(input: PriorityInput): PriorityResult {
  const weight = REQUIREMENT_WEIGHT[input.requirementType];
  const reqLabel = input.requirementType === "required" ? `必要技能（權重 ${weight}）` : `加分技能（權重 ${weight}）`;
  if (input.currentLevel === null) {
    return { score: null, gap: null, reasons: [reqLabel, "尚未自評，先評估才能算出差距"] };
  }
  const gap = Math.max(0, input.requiredLevel - input.currentLevel);
  const score = Math.round(weight * gap * input.goalWeight * 10) / 10;
  const reasons = [reqLabel, `差距 ${gap}：職缺要求「${levelLabel(input.requiredLevel)}」，你目前「${levelLabel(input.currentLevel)}」`];
  if (input.goalWeight !== 1) reasons.push(`你的目標權重 ${input.goalWeight}`);
  if (gap === 0) reasons.push("已達要求，不需補強");
  return { score, gap, reasons };
}
