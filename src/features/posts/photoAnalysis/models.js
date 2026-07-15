// @tensorflow-models/coco-ssd and @tensorflow-models/mobilenet only depend on
// @tensorflow/tfjs-core (tensor APIs), not a backend implementation. Without
// importing the @tensorflow/tfjs umbrella package first (which registers the
// CPU/WebGL backends as a side effect), model.load() throws "No backend found
// in registry." Dynamic-imported here (not at module top) so it code-splits
// alongside coco-ssd/mobilenet instead of loading on every page.
let tfjsBackendPromise = null
let cocoModelPromise = null
let mobilenetModelPromise = null

export function ensureTfjsBackend() {
  if (!tfjsBackendPromise) {
    tfjsBackendPromise = import('@tensorflow/tfjs')
  }
  return tfjsBackendPromise
}

export function getCocoModel() {
  if (!cocoModelPromise) {
    cocoModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/coco-ssd'))
      .then((module) => module.load())
  }
  return cocoModelPromise
}

export function getMobilenetModel() {
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/mobilenet'))
      .then((module) => module.load())
  }
  return mobilenetModelPromise
}
