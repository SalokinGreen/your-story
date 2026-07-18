import Compressor from "compressorjs";

/**
 * Converts a File/Blob into a base64 data URL for local-only storage
 * (no backend upload needed).
 */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function compressImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.8,
): Promise<File> {
  return new Promise((resolve, reject) => {
    new Compressor(file, {
      quality,
      maxWidth,
      maxHeight,
      resize: "contain",
      success(result) {
        // Compressor can return a Blob; wrap it as File to keep name/type
        const compressedFile = new File([result], file.name, {
          type: file.type || "image/jpeg",
        });
        resolve(compressedFile);
      },
      error(err) {
        reject(err);
      },
    });
  });
}
