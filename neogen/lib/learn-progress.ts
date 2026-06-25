export type LearnProgressState = {
  xp: number;
  completedTopicSlugs: string[];
  lastTopicSlug: string | null;
};

export const LEARN_PROGRESS_STORAGE_KEY = "defi-learn-progress-v1";

export const defaultLearnProgress: LearnProgressState = {
  xp: 0,
  completedTopicSlugs: [],
  lastTopicSlug: null,
};

/** XP band per level (level 1 = 0–199 XP, level 2 = 200–399, …). */
export const XP_PER_LEVEL = 200;

export function xpToLevel(xp: number) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  return { level, xpInLevel, xpForNextLevel: XP_PER_LEVEL };
}

export function loadLearnProgress(): LearnProgressState {
  if (typeof window === "undefined") return defaultLearnProgress;
  try {
    const raw = window.localStorage.getItem(LEARN_PROGRESS_STORAGE_KEY);
    if (!raw) return defaultLearnProgress;
    const p = JSON.parse(raw) as Partial<LearnProgressState>;
    if (typeof p.xp !== "number" || !Array.isArray(p.completedTopicSlugs)) {
      return defaultLearnProgress;
    }
    return {
      xp: Math.max(0, p.xp),
      completedTopicSlugs: p.completedTopicSlugs.filter(
        (s) => typeof s === "string",
      ),
      lastTopicSlug:
        typeof p.lastTopicSlug === "string" ? p.lastTopicSlug : null,
    };
  } catch {
    return defaultLearnProgress;
  }
}

export function saveLearnProgress(state: LearnProgressState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LEARN_PROGRESS_STORAGE_KEY,
    JSON.stringify(state),
  );
}
