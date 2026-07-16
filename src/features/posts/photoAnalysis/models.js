// @tensorflow-models/coco-ssd and @tensorflow-models/mobilenet only depend on
// @tensorflow/tfjs-core (tensor APIs), not a backend implementation. Without
// importing the @tensorflow/tfjs umbrella package first (which registers the
// CPU/WebGL backends as a side effect), model.load() throws "No backend found
// in registry." Dynamic-imported here (not at module top) so it code-splits
// alongside coco-ssd/mobilenet instead of loading on every page.
//
// Each promise below is cleared back to null on rejection (via .catch) so a
// transient failure (e.g. a network blip downloading the multi-MB model
// weights) doesn't permanently poison every future call in this page
// session — without the .catch, a rejected promise is still truthy, so the
// `if (!xPromise)` guard would never re-fire and every subsequent call would
// replay the same stale rejection until a full page reload.
let tfjsBackendPromise = null
let cocoModelPromise = null
let mobilenetModelPromise = null

export function ensureTfjsBackend() {
  if (!tfjsBackendPromise) {
    tfjsBackendPromise = import('@tensorflow/tfjs').catch((err) => {
      tfjsBackendPromise = null
      throw err
    })
  }
  return tfjsBackendPromise
}

export function getCocoModel() {
  if (!cocoModelPromise) {
    cocoModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/coco-ssd'))
      .then((module) => module.load())
      .catch((err) => {
        cocoModelPromise = null
        throw err
      })
  }
  return cocoModelPromise
}

export function getMobilenetModel() {
  if (!mobilenetModelPromise) {
    mobilenetModelPromise = ensureTfjsBackend()
      .then(() => import('@tensorflow-models/mobilenet'))
      .then((module) => module.load())
      .catch((err) => {
        mobilenetModelPromise = null
        throw err
      })
  }
  return mobilenetModelPromise
}
