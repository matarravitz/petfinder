import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as mobilenet from '@tensorflow-models/mobilenet'

vi.mock('@tensorflow/tfjs', () => ({}))
vi.mock('@tensorflow-models/coco-ssd', () => ({ load: vi.fn() }))
vi.mock('@tensorflow-models/mobilenet', () => ({ load: vi.fn() }))

// models.js memoizes each loaded model in a module-scoped promise variable
// (intentional in production — avoids re-downloading multi-MB model weights
// on every call). That state leaks between test cases sharing one module
// instance within this file, so each test resets the module registry and
// re-imports fresh, same pattern as analyzePhoto.test.js.
let getCocoModel
let getMobilenetModel

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  ;({ getCocoModel, getMobilenetModel } = await import('./models.js'))
})

describe('getCocoModel', () => {
  test('retries after a failed load instead of replaying the same rejection', async () => {
    cocoSsd.load
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ detect: vi.fn() })

    await expect(getCocoModel()).rejects.toThrow('network error')
    const model = await getCocoModel()
    expect(model).toEqual({ detect: expect.any(Function) })
    expect(cocoSsd.load).toHaveBeenCalledTimes(2)
  })

  test('caches a successful load and does not call load() again', async () => {
    cocoSsd.load.mockResolvedValue({ detect: vi.fn() })

    const first = await getCocoModel()
    const second = await getCocoModel()

    expect(first).toBe(second)
    expect(cocoSsd.load).toHaveBeenCalledTimes(1)
  })
})

describe('getMobilenetModel', () => {
  test('retries after a failed load instead of replaying the same rejection', async () => {
    mobilenet.load
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ classify: vi.fn() })

    await expect(getMobilenetModel()).rejects.toThrow('network error')
    const model = await getMobilenetModel()
    expect(model).toEqual({ classify: expect.any(Function) })
    expect(mobilenet.load).toHaveBeenCalledTimes(2)
  })
})
