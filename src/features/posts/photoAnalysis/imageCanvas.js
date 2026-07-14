export async function loadImageElement(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function cropToImageData(imageElement, bbox) {
  const [x, y, width, height] = bbox
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.drawImage(imageElement, x, y, width, height, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}
