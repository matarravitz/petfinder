export function cosineSimilarity(vectorA, vectorB) {
  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < vectorA.length; i += 1) {
    dotProduct += vectorA[i] * vectorB[i]
    magnitudeA += vectorA[i] ** 2
    magnitudeB += vectorB[i] ** 2
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB))
}
