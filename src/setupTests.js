import '@testing-library/jest-dom'

// jsdom has no canvas rendering backend, so HTMLCanvasElement#getContext('2d')
// returns null. analyzePhoto.js creates a canvas to hand cropped pixel data to
// mobilenet.classify(); stub just enough of the 2D context API for that to work.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => ({ putImageData: () => {} })
}
