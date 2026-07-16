export const EXPIRY_DAYS = 60
export const EXPIRY_WARNING_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function getExpiryDate(post) {
  return new Date(new Date(post.renewed_at).getTime() + EXPIRY_DAYS * MS_PER_DAY)
}

export function isExpired(post, now) {
  return now >= getExpiryDate(post)
}

// True during the EXPIRY_WARNING_DAYS window right before expiry (and only
// then) — not before it, and not after the post has actually expired.
export function isExpiringSoon(post, now) {
  const expiry = getExpiryDate(post)
  const warnAt = new Date(expiry.getTime() - EXPIRY_WARNING_DAYS * MS_PER_DAY)
  return now >= warnAt && now < expiry
}

export function daysUntilExpiry(post, now) {
  return Math.max(0, Math.ceil((getExpiryDate(post) - now) / MS_PER_DAY))
}
