import { beforeEach, expect, test, vi } from 'vitest'
import * as mobilenet from '@tensorflow-models/mobilenet'

vi.mock('@tensorflow/tfjs', () => ({}))
vi.mock('@tensorflow-models/mobilenet', () => ({ load: vi.fn() }))
vi.mock('./imageCanvas.js', () => ({
  loadImageElement: vi.fn(() => Promise.resolve({})),
}))

const fakeFile = new File(['fake-image-content'], 'cat.jpg', { type: 'image/jpeg' })

// models.js (via getMobilenetModel) memoizes the loaded model in a module-scoped
// variable, same as analyzePhoto.js — reset the module registry and re-import
// fresh before each test, same pattern as analyzePhoto.test.js.
let getPhotoEmbedding

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  ;({ getPhotoEmbedding } = await import('./getPhotoEmbedding.js'))
})

test('returns a plain array of numbers from the model embedding tensor, and disposes it', async () => {
  const dispose = vi.fn()
  mobilenet.load.mockResolvedValue({
    infer: vi.fn(() => ({
      data: () => Promise.resolve(Float32Array.from([0.5, 0.25, -0.75])),
      dispose,
    })),
  })

  const result = await getPhotoEmbedding(fakeFile)

  expect(result).toEqual([0.5, 0.25, -0.75])
  expect(dispose).toHaveBeenCalled()
})

test('calls infer in embedding mode on the loaded (uncropped) image', async () => {
  const infer = vi.fn(() => ({ data: () => Promise.resolve(Float32Array.from([1])), dispose: vi.fn() }))
  mobilenet.load.mockResolvedValue({ infer })

  await getPhotoEmbedding(fakeFile)

  expect(infer).toHaveBeenCalledWith({}, true)
})

test('resolves null (never rejects) when the model fails to load', async () => {
  mobilenet.load.mockRejectedValue(new Error('network error'))

  const result = await getPhotoEmbedding(fakeFile)

  expect(result).toBeNull()
})
