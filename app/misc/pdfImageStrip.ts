/**
 * Strip embedded images out of a PDF so an otherwise-unsendable page fits
 * under the OCR upload size limit.
 *
 * Background: PDFImporter splits a large PDF into page-range chunks and
 * halves any range whose base64 payload exceeds Vercel's hard body-size
 * limit. That recursion bottoms out at a single page - and a single
 * full-bleed scan or full-page illustration can blow the limit on its own,
 * at which point the page used to be dropped from the import entirely.
 * Removing the images is the last thing worth trying before giving up:
 * Mistral's OCR reads text, so a page that carries a real text layer under
 * its artwork still yields everything the import actually wants.
 *
 * This does NOT help a pure scan, where the text *is* the image - stripping
 * there leaves a blank page. Callers must treat empty OCR output from a
 * stripped page as a failure rather than as a successfully imported page
 * (see `ocrPDFRange` in PDFImporter.tsx).
 */

import { PDFDocument, PDFRawStream, PDFName } from "pdf-lib";

export interface StripImagesResult {
  /** Re-serialized PDF bytes with every image replaced by a placeholder. */
  bytes: Uint8Array;
  /** How many image streams were replaced. 0 means nothing was strippable. */
  imagesRemoved: number;
}

/**
 * A 1x1 opaque-white DeviceGray image, uncompressed (one byte of sample
 * data). Substituted for each real image so the reference stays valid.
 *
 * Replacing the object in place rather than deleting it matters twice over:
 * page content streams still carry the `/Im0 Do` operators that draw these
 * images, and a dangling reference is at best skipped and at worst a parse
 * error depending on the reader. DeviceGray also works as a drop-in for a
 * soft mask (`/SMask`), which must be a grayscale image - so the same
 * placeholder covers both cases.
 */
function makePlaceholderImage(doc: PDFDocument): PDFRawStream {
  return PDFRawStream.of(
    doc.context.obj({
      Type: "XObject",
      Subtype: "Image",
      Width: 1,
      Height: 1,
      ColorSpace: "DeviceGray",
      BitsPerComponent: 8,
    }),
    new Uint8Array([0xff]),
  );
}

/**
 * Replace every embedded image in a PDF with a 1x1 placeholder.
 *
 * Works over the document's whole indirect-object table rather than walking
 * page resource dictionaries. That's deliberate: it catches images nested
 * inside Form XObjects and annotation appearance streams, and - the big one
 * for file size - the separate `/SMask` alpha-channel images that transparent
 * artwork hangs off of. Walking only `page.Resources.XObject` would leave
 * those soft masks in the document, still fully serialized, and the payload
 * would barely shrink.
 *
 * @param bytes The source PDF.
 * @returns The re-serialized PDF and the number of images replaced.
 */
export async function stripImagesFromPDF(
  bytes: Uint8Array | ArrayBuffer,
): Promise<StripImagesResult> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const context = doc.context;
  const imageSubtype = PDFName.of("Image");
  const subtypeKey = PDFName.of("Subtype");

  let imagesRemoved = 0;
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.get(subtypeKey) !== imageSubtype) continue;

    context.assign(ref, makePlaceholderImage(doc));
    imagesRemoved++;
  }

  return { bytes: await doc.save(), imagesRemoved };
}
