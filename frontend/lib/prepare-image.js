const imageLimit = 256 * 1024;

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file, maxDimension = 1200) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("The selected image could not be processed.");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= imageLimit && ["image/png", "image/jpeg", "image/webp"].includes(blob.type)) {
      return readAsDataUrl(blob);
    }
  }
  throw new Error("This image is still too large. Choose a smaller image and try again.");
}
