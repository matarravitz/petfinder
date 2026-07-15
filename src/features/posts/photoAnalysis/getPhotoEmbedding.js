import { loadImageElement } from './imageCanvas.js'
import { getMobilenetModel } from './models.js'

export async function getPhotoEmbedding(file) {
  try {
    const imageElement = await loadImageElement(file)
    const model = await getMobilenetModel()
    const embeddingTensor = model.infer(imageElement, true)
    try {
      const values = await embeddingTensor.data()
      return Array.from(values)
    } finally {
      embeddingTensor.dispose()
    }
  } catch {
    return null
  }
}
