import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as mobilenet from '@tensorflow-models/mobilenet'
import { cropToImageData, loadImageElement } from './imageCanvas.js'

vi.mock('@tensorflow-models/coco-ssd', () => ({ load: vi.fn() }))
vi.mock('@tensorflow-models/mobilenet', () => ({ load: vi.fn() }))
vi.mock('./imageCanvas.js', () => ({
  loadImageElement: vi.fn(() => Promise.resolve({})),
  cropToImageData: vi.fn(),
}))

const DOG_BREEDS = ['Golden Retriever', 'Labrador Retriever']
const BREED_OPTIONS_BY_SPECIES = { dog: DOG_BREEDS, cat: [], bird: [] }

function buildSolidBlackImageData(pixelCount) {
  const data = []
  for (let i = 0; i < pixelCount; i += 1) data.push(0, 0, 0, 255)
  return { data, width: pixelCount, height: 1 }
}

const fakeFile = new File(['fake-image-content'], 'dog.jpg', { type: 'image/jpeg' })

// analyzePhoto.js memoizes the loaded TF.js models in module-scoped variables
// (intentional in production - avoid re-downloading multi-MB models on every
// call). That state otherwise leaks between the test cases below, since they
// share one module instance within this file. Reset the module registry and
// re-import analyzePhoto fresh before each test to keep them isolated.
let analyzePhoto

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  ;({ analyzePhoto } = await import('./analyzePhoto.js'))
})

describe('analyzePhoto', () => {
  test('fills species, breed, and color for a confidently detected dog', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'dog', score: 0.95 }]),
    })
    mobilenet.load.mockResolvedValue({
      classify: vi.fn().mockResolvedValue([{ className: 'golden retriever', probability: 0.7 }]),
    })
    cropToImageData.mockReturnValue(buildSolidBlackImageData(20))

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result).toEqual({
      species: 'dog',
      breed: 'Golden Retriever',
      breedOther: '',
      color: 'Black',
      undetected: [],
    })
  })

  test('leaves breed undetected for bird species, which has no breed support', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'bird', score: 0.9 }]),
    })
    mobilenet.load.mockResolvedValue({ classify: vi.fn() })
    cropToImageData.mockReturnValue(buildSolidBlackImageData(20))

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result.species).toBe('bird')
    expect(result.breed).toBeNull()
    expect(result.undetected).toEqual(['breed'])
    expect(mobilenet.load).not.toHaveBeenCalled()
  })

  test('leaves everything undetected when nothing is found above the species threshold', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'dog', score: 0.4 }]),
    })
    mobilenet.load.mockResolvedValue({ classify: vi.fn() })

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result).toEqual({
      species: null,
      breed: null,
      breedOther: null,
      color: null,
      undetected: ['species', 'breed', 'color'],
    })
    expect(cropToImageData).not.toHaveBeenCalled()
    expect(mobilenet.load).not.toHaveBeenCalled()
  })

  test('leaves breed undetected when the breed classification confidence is below threshold', async () => {
    cocoSsd.load.mockResolvedValue({
      detect: vi.fn().mockResolvedValue([{ bbox: [0, 0, 10, 10], class: 'dog', score: 0.95 }]),
    })
    mobilenet.load.mockResolvedValue({
      classify: vi.fn().mockResolvedValue([{ className: 'golden retriever', probability: 0.2 }]),
    })
    cropToImageData.mockReturnValue(buildSolidBlackImageData(20))

    const result = await analyzePhoto(fakeFile, BREED_OPTIONS_BY_SPECIES)

    expect(result.species).toBe('dog')
    expect(result.color).toBe('Black')
    expect(result.breed).toBeNull()
    expect(result.undetected).toEqual(['breed'])
  })
})
