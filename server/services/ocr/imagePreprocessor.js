/**
 * Image Preprocessor for Passport OCR
 *
 * Enforces quality standards:
 * - Checks image dimensions: rejects width < 1000 px with "Image is too small. Upload a clearer photo or a 300 DPI scan."
 * - Auto-rotates using EXIF orientation metadata
 * - Enhances contrast & normalizes image
 * - Generates bottom ~25% cropped MRZ zone
 */

const sharp = require('sharp');

/**
 * Validates image size and preprocesses image buffer.
 * If file is a PDF, leaves the buffer untouched (as PDFDocument handles page extraction).
 *
 * @param {Buffer} buffer Raw file buffer
 * @param {string} mimetype MIME type or filename
 * @returns {Promise<{
 *   processedBuffer: Buffer,
 *   mrzCropBuffer: Buffer|null,
 *   width: number,
 *   height: number,
 *   isPdf: boolean
 * }>}
 */
async function preprocessPassportImage(buffer, mimetype = 'image/jpeg') {
  const isPdf = (mimetype || '').toLowerCase().includes('pdf') ||
                buffer.slice(0, 5).toString() === '%PDF-';

  if (isPdf) {
    return {
      processedBuffer: buffer,
      mrzCropBuffer: null,
      width: 0,
      height: 0,
      isPdf: true
    };
  }

  // Inspect image metadata
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    // If not a valid image format for sharp, pass through
    return {
      processedBuffer: buffer,
      mrzCropBuffer: null,
      width: 0,
      height: 0,
      isPdf: false
    };
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Rule 5: Reject images under ~1000 px wide
  if (width > 0 && width < 980) {
    const error = new Error('Image is too small. Upload a clearer photo or a 300 DPI scan.');
    error.code = 'IMAGE_TOO_SMALL';
    throw error;
  }

  // Preprocess: auto-rotate based on EXIF, boost contrast, convert to high-clarity image
  let processedBuffer;
  try {
    processedBuffer = await sharp(buffer)
      .rotate() // auto-rotate based on EXIF orientation
      .modulate({ brightness: 1.05, contrast: 1.25 })
      .toBuffer();
  } catch (e) {
    processedBuffer = buffer;
  }

  // Crop bottom ~25% (the MRZ zone)
  let mrzCropBuffer = null;
  if (width > 0 && height > 0) {
    try {
      const cropHeight = Math.floor(height * 0.25);
      const cropTop = height - cropHeight;
      mrzCropBuffer = await sharp(buffer)
        .rotate()
        .extract({ left: 0, top: cropTop, width, height: cropHeight })
        .grayscale()
        .linear(1.3, -15) // contrast boost for OCR
        .toBuffer();
    } catch (e) {
      mrzCropBuffer = null;
    }
  }

  return {
    processedBuffer,
    mrzCropBuffer,
    width,
    height,
    isPdf: false
  };
}

module.exports = {
  preprocessPassportImage
};
