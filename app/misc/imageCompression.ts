import Compressor from "compressorjs";

export function compressImage(file: File, maxWidth: number, maxHeight: number, quality = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    new Compressor(file, {
      quality,
      maxWidth,
      maxHeight,
      resize: "contain",
      success(result) {
        // Compressor can return a Blob; wrap it as File to keep name/type
        const compressedFile = new File([result], file.name, { type: file.type || "image/jpeg" });
        resolve(compressedFile);
      },
      error(err) {
        reject(err);
      },
    });
  });
}
