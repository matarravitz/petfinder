import * as cocoSsd from '@tensorflow-models/coco-ssd'
import * as mobilenet from '@tensorflow-models/mobilenet'
import { loadImageElement, cropToImageData } from './imageCanvas.js'
import { matchSpeciesClass } from './speciesMatcher.js'
import { matchBreedLabel } from './breedMatcher.js'
import { computeDominantColorBucket, matchColorToOption } from './colorMatcher.js'

const SPECIES_CONFIDENCE_THRESHOLD = 0.6
const BREED_CONFIDENCE_THRESHOLD = 0.4
const SPECIES_WITH_BREED_SUPPORT = new Set(['cat', 'dog'])

let cocoModelPromise = null
let mobilenetModelPromise = null

function getCocoModel() {
  if (!cocoModelPromise) {
    cocoModelPromise = cocoSsd.load()
  }
  return cocoModelPromise
}

function getMobilenetModel() {
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = mobilenet.load()
  }
  return mobilenetModelPromise
}

export async function analyzePhoto(file, breedOptionsBySpecies) {
  const result = { species: null, breed: null, breedOther: null, color: null, undetected: [] }

  const [cocoModel, imageElement] = await Promise.all([getCocoModel(), loadImageElement(file)])
  const predictions = await cocoModel.detect(imageElement)

  const speciesPrediction = predictions
    .filter((prediction) => matchSpeciesClass(prediction.class) !== null)
    .filter((prediction) => prediction.score >= SPECIES_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)[0]

  if (!speciesPrediction) {
    result.undetected.push('species', 'breed', 'color')
    return result
  }

  result.species = matchSpeciesClass(speciesPrediction.class)

  const croppedImageData = cropToImageData(imageElement, speciesPrediction.bbox)
  const colorBucket = computeDominantColorBucket(croppedImageData.data)
  result.color = matchColorToOption(colorBucket.rgb, colorBucket.ratio)

  if (!SPECIES_WITH_BREED_SUPPORT.has(result.species)) {
    result.undetected.push('breed')
    return result
  }

  const mobilenetModel = await getMobilenetModel()
  const croppedCanvas = document.createElement('canvas')
  croppedCanvas.width = croppedImageData.width
  croppedCanvas.height = croppedImageData.height
  croppedCanvas.getContext('2d').putImageData(croppedImageData, 0, 0)

  const breedPredictions = await mobilenetModel.classify(croppedCanvas)
  const topBreedPrediction = breedPredictions[0]

  if (topBreedPrediction && topBreedPrediction.probability >= BREED_CONFIDENCE_THRESHOLD) {
    const breedOptions = breedOptionsBySpecies[result.species]
    const { breed, breedOther } = matchBreedLabel(topBreedPrediction.className, breedOptions)
    result.breed = breed
    result.breedOther = breedOther
  } else {
    result.undetected.push('breed')
  }

  return result
}
