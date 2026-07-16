export const BUMP_COOLDOWN_HOURS = 24

const MS_PER_HOUR = 60 * 60 * 1000

export function canBump(post, now) {
  return now - new Date(post.bumped_at) >= BUMP_COOLDOWN_HOURS * MS_PER_HOUR
}

export function hoursUntilNextBump(post, now) {
  const remainingMs = BUMP_COOLDOWN_HOURS * MS_PER_HOUR - (now - new Date(post.bumped_at))
  return Math.max(0, Math.ceil(remainingMs / MS_PER_HOUR))
}
