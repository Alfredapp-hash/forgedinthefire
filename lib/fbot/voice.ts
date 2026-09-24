/** Runtime voice for FBot. Source of truth for humans: PERSONALITY.md */

export const FBOT_GREETING =
  "I'm FBot. I only answer from this admin — live records here, plus how-to for these tools. No AI."

export const FBOT_BUSY = 'Checking this admin…'

export function toBullets(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''))
  if (lines.length <= 1) {
    const sentences = text
      .split(/(?<=\.)\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 12)
    if (sentences.length > 1) return sentences.join('\n')
  }
  return lines.join('\n')
}

export function bulletLines(text: string) {
  return toBullets(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
