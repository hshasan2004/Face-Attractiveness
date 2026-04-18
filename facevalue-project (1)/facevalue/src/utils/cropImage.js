const MAX_OUTPUT_DIMENSION = 2048
const JPEG_QUALITY = 0.9

/**
 * Decode image source to something drawable on canvas (ImageBitmap when possible).
 */
async function loadDrawableImage(imageSrc) {
  if (typeof createImageBitmap === 'function') {
    try {
      const res = await fetch(imageSrc)
      const blob = await res.blob()
      return await createImageBitmap(blob)
    } catch {
      /* fall through to Image */
    }
  }
  const image = new Image()
  image.src = imageSrc
  if (image.decode) await image.decode()
  else await new Promise((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Failed to load image'))
  })
  return image
}

function releaseDrawable(drawable) {
  if (drawable && typeof drawable.close === 'function') drawable.close()
}

/**
 * Crop region from image and return JPEG blob. Downscales large crops to avoid huge uploads / canvas limits.
 */
export async function getCroppedImageBlob(imageSrc, pixelCrop) {
  const { x, y, width: w, height: h } = pixelCrop
  if (!w || !h) throw new Error('Invalid crop area')

  const drawable = await loadDrawableImage(imageSrc)
  try {
    let scale = 1
    if (w > MAX_OUTPUT_DIMENSION) scale = MAX_OUTPUT_DIMENSION / w
    if (h * scale > MAX_OUTPUT_DIMENSION) scale = Math.min(scale, MAX_OUTPUT_DIMENSION / h)

    const outW = Math.max(1, Math.round(w * scale))
    const outH = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(drawable, x, y, w, h, 0, 0, outW, outH)

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
        'image/jpeg',
        JPEG_QUALITY
      )
    })
  } finally {
    releaseDrawable(drawable)
  }
}
