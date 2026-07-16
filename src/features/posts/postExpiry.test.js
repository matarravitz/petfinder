import { expect, test } from 'vitest'
import { EXPIRY_DAYS, EXPIRY_WARNING_DAYS, getExpiryDate, isExpired, isExpiringSoon, daysUntilExpiry } from './postExpiry.js'

const RENEWED_AT = '2026-01-01T00:00:00.000Z'

function daysAfterRenewal(days) {
  return new Date(new Date(RENEWED_AT).getTime() + days * 24 * 60 * 60 * 1000)
}

test('getExpiryDate is EXPIRY_DAYS after renewed_at', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(getExpiryDate(post)).toEqual(daysAfterRenewal(EXPIRY_DAYS))
})

test('isExpired is false well before the expiry date', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(isExpired(post, daysAfterRenewal(EXPIRY_DAYS - 10))).toBe(false)
})

test('isExpired is true once the expiry date has passed', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(isExpired(post, daysAfterRenewal(EXPIRY_DAYS + 1))).toBe(true)
})

test('isExpired is true exactly at the expiry date', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(isExpired(post, daysAfterRenewal(EXPIRY_DAYS))).toBe(true)
})

test('isExpiringSoon is false outside the warning window', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(isExpiringSoon(post, daysAfterRenewal(EXPIRY_DAYS - EXPIRY_WARNING_DAYS - 1))).toBe(false)
})

test('isExpiringSoon is true inside the warning window', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(isExpiringSoon(post, daysAfterRenewal(EXPIRY_DAYS - 1))).toBe(true)
})

test('isExpiringSoon is false once the post has actually expired', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(isExpiringSoon(post, daysAfterRenewal(EXPIRY_DAYS + 1))).toBe(false)
})

test('daysUntilExpiry counts down and never goes negative', () => {
  const post = { renewed_at: RENEWED_AT }
  expect(daysUntilExpiry(post, daysAfterRenewal(EXPIRY_DAYS - 5))).toBe(5)
  expect(daysUntilExpiry(post, daysAfterRenewal(EXPIRY_DAYS + 10))).toBe(0)
})
