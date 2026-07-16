import { expect, test } from 'vitest'
import { BUMP_COOLDOWN_HOURS, canBump, hoursUntilNextBump } from './postBump.js'

const BUMPED_AT = '2026-01-01T00:00:00.000Z'

function hoursAfterBump(hours) {
  return new Date(new Date(BUMPED_AT).getTime() + hours * 60 * 60 * 1000)
}

test('canBump is false right after bumping', () => {
  const post = { bumped_at: BUMPED_AT }
  expect(canBump(post, hoursAfterBump(1))).toBe(false)
})

test('canBump is false just under the cooldown', () => {
  const post = { bumped_at: BUMPED_AT }
  expect(canBump(post, hoursAfterBump(BUMP_COOLDOWN_HOURS - 1))).toBe(false)
})

test('canBump is true once the cooldown has fully elapsed', () => {
  const post = { bumped_at: BUMPED_AT }
  expect(canBump(post, hoursAfterBump(BUMP_COOLDOWN_HOURS))).toBe(true)
  expect(canBump(post, hoursAfterBump(BUMP_COOLDOWN_HOURS + 5))).toBe(true)
})

test('hoursUntilNextBump counts down and never goes negative', () => {
  const post = { bumped_at: BUMPED_AT }
  expect(hoursUntilNextBump(post, hoursAfterBump(BUMP_COOLDOWN_HOURS - 3))).toBe(3)
  expect(hoursUntilNextBump(post, hoursAfterBump(BUMP_COOLDOWN_HOURS + 10))).toBe(0)
})
