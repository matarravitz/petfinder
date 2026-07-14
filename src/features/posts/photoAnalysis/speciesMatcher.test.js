import { describe, expect, test } from 'vitest'
import { matchSpeciesClass } from './speciesMatcher.js'

describe('matchSpeciesClass', () => {
  test('passes through the three supported COCO-SSD classes', () => {
    expect(matchSpeciesClass('cat')).toBe('cat')
    expect(matchSpeciesClass('dog')).toBe('dog')
    expect(matchSpeciesClass('bird')).toBe('bird')
  })

  test('returns null for any other COCO-SSD class', () => {
    expect(matchSpeciesClass('horse')).toBeNull()
    expect(matchSpeciesClass('person')).toBeNull()
  })

  test('returns null for undefined input', () => {
    expect(matchSpeciesClass(undefined)).toBeNull()
  })
})
