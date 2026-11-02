export type LearningLevel = 'shuangpin' | 'yinxing'

const levelKey = 'babble:learning-level'

/** First visit, invalid values and restricted storage all start with sound learning. */
export function loadLearningLevel(): LearningLevel {
  try { return localStorage.getItem(levelKey) === 'yinxing' ? 'yinxing' : 'shuangpin' }
  catch { return 'shuangpin' }
}

/** A storage failure never blocks switching the current interface. */
export function saveLearningLevel(level: LearningLevel): boolean {
  try { localStorage.setItem(levelKey, level); return true }
  catch { return false }
}
