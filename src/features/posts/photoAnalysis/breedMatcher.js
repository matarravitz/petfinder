function capitalizeWords(label) {
  return label
    .split(' ')
    .map((word) => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

export function matchBreedLabel(predictionLabel, breedOptions) {
  const normalizedLabel = predictionLabel.toLowerCase()

  const matchedOption = breedOptions.find((option) => {
    const optionWords = option.toLowerCase().split(/\s+/)
    return optionWords.every((word) => normalizedLabel.includes(word))
  })

  if (matchedOption) {
    return { breed: matchedOption, breedOther: '' }
  }

  return { breed: 'other', breedOther: capitalizeWords(predictionLabel) }
}
