import { describe, expect, test } from 'vitest'
import { matchBreedLabel } from './breedMatcher.js'

const DOG_BREEDS = [
  'Labrador Retriever',
  'German Shepherd',
  'Golden Retriever',
  'Poodle',
  'Bulldog',
  'Beagle',
  'Terrier Mix',
  'Chihuahua',
  'Dachshund',
  'Husky',
]

const CAT_BREEDS = [
  'Domestic Shorthair',
  'Domestic Longhair',
  'Siamese',
  'Persian',
  'Maine Coon',
  'British Shorthair',
  'Ragdoll',
  'Bengal',
  'Sphynx',
]

describe('matchBreedLabel', () => {
  test('matches a single-word ImageNet label to its breed option', () => {
    expect(matchBreedLabel('Siamese cat', CAT_BREEDS)).toEqual({
      breed: 'Siamese',
      breedOther: '',
    })
  })

  test('matches a multi-word ImageNet label to its breed option', () => {
    expect(matchBreedLabel('golden retriever', DOG_BREEDS)).toEqual({
      breed: 'Golden Retriever',
      breedOther: '',
    })
  })

  test('matches a compound ImageNet label (comma-separated aliases)', () => {
    expect(matchBreedLabel('German shepherd, German shepherd dog', DOG_BREEDS)).toEqual({
      breed: 'German Shepherd',
      breedOther: '',
    })
  })

  test('falls back to "other" with a capitalized raw label when nothing matches', () => {
    expect(matchBreedLabel('tabby, tabby cat', CAT_BREEDS)).toEqual({
      breed: 'other',
      breedOther: 'Tabby, Tabby Cat',
    })
  })
})
