/**
 * stripImagesFromPDF tests - the last-resort shrink applied to a single PDF
 * page whose payload exceeds the OCR upload size limit (see
 * `ocrPageWithoutImages` in PDFImporter.tsx).
 */
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFRawStream, PDFName, PDFRef, PDFDict } from "pdf-lib";
import { stripImagesFromPDF } from "@/app/misc/pdfImageStrip";

const IMAGE_BYTES = 200_000;

/**
 * Build a one-page PDF carrying a raw image XObject of `IMAGE_BYTES`,
 * optionally with an equally large `/SMask` alpha channel hanging off it.
 * The image data is dummy bytes rather than a real encode - nothing here
 * decodes pixels, and what's under test is which indirect objects get
 * replaced.
 */
async function makePDFWithImage(
  options: { smask?: boolean } = {},
): Promise<{ bytes: Uint8Array; imageRef: PDFRef }> {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const page = doc.addPage([200, 200]);

  let smaskRef: PDFRef | undefined;
  if (options.smask) {
    smaskRef = context.register(
      PDFRawStream.of(
        context.obj({
          Type: "XObject",
          Subtype: "Image",
          Width: 100,
          Height: 100,
          ColorSpace: "DeviceGray",
          BitsPerComponent: 8,
        }),
        new Uint8Array(IMAGE_BYTES).fill(0x42),
      ),
    );
  }

  const imageRef = context.register(
    PDFRawStream.of(
      context.obj({
        Type: "XObject",
        Subtype: "Image",
        Width: 100,
        Height: 100,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
        ...(smaskRef ? { SMask: smaskRef } : {}),
      }),
      new Uint8Array(IMAGE_BYTES).fill(0x41),
    ),
  );

  page.node.setXObject(PDFName.of("Im0"), imageRef);
  page.drawText("Text under the artwork", { x: 10, y: 100, size: 12 });

  return { bytes: await doc.save(), imageRef };
}

/** Resolve the image XObject the reloaded page's resources point at. */
function lookupPageImage(doc: PDFDocument): PDFRawStream | undefined {
  const resources = doc.getPage(0).node.Resources();
  const xObjects = resources?.lookup(PDFName.of("XObject"), PDFDict);
  const entry = xObjects?.get(PDFName.of("Im0"));
  if (!entry) return undefined;
  return doc.context.lookup(entry) as PDFRawStream;
}

describe("stripImagesFromPDF", () => {
  it("replaces embedded images and shrinks the document", async () => {
    const { bytes } = await makePDFWithImage();

    const result = await stripImagesFromPDF(bytes);

    expect(result.imagesRemoved).toBe(1);
    expect(result.bytes.length).toBeLessThan(bytes.length / 10);
  });

  it("also strips the soft-mask images hanging off transparent artwork", async () => {
    const { bytes } = await makePDFWithImage({ smask: true });

    const result = await stripImagesFromPDF(bytes);

    // Both the image and its /SMask alpha channel - leaving the mask behind
    // would keep ~half the payload, since it is serialized whether or not
    // anything still points at it.
    expect(result.imagesRemoved).toBe(2);
    expect(result.bytes.length).toBeLessThan(bytes.length / 10);
  });

  it("leaves a loadable PDF whose page still resolves its image reference", async () => {
    const { bytes } = await makePDFWithImage();

    const result = await stripImagesFromPDF(bytes);
    const reloaded = await PDFDocument.load(result.bytes);

    expect(reloaded.getPageCount()).toBe(1);
    // The content stream still carries the `/Im0 Do` operator that drew the
    // original image, so the name has to keep resolving to a real image
    // object - a dangling reference is a parse error in some readers.
    const placeholder = lookupPageImage(reloaded);
    expect(placeholder).toBeInstanceOf(PDFRawStream);
    expect(placeholder?.dict.get(PDFName.of("Subtype"))).toBe(
      PDFName.of("Image"),
    );
    expect(placeholder?.getContentsSize()).toBe(1);
  });

  it("preserves the page's text content stream", async () => {
    const { bytes } = await makePDFWithImage();
    const before = await PDFDocument.load(bytes);
    const beforeOps = before.getPage(0).node.Contents()?.toString();

    const result = await stripImagesFromPDF(bytes);
    const after = await PDFDocument.load(result.bytes);

    expect(after.getPage(0).node.Contents()?.toString()).toBe(beforeOps);
    expect(after.getPage(0).node.Resources()?.get(PDFName.of("Font"))).toBeDefined();
  });

  it("reports zero removals for a PDF with no images", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]).drawText("All text, no artwork", { x: 10, y: 100 });
    const bytes = await doc.save();

    const result = await stripImagesFromPDF(bytes);

    expect(result.imagesRemoved).toBe(0);
    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
