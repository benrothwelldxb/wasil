/** Encode an SVG string as a data URL — the most cross-browser way to feed an <img>. */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Rasterise an SVG string to a PNG Blob via an offscreen canvas. The card SVG
 * embeds no external images, so the canvas never taints and `toBlob` succeeds
 * on every platform.
 */
export async function svgToPngBlob(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not render the card image."));
    img.src = svgToDataUrl(svg);
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode the image.")),
      "image/png",
    );
  });
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Share a PNG via the Web Share API when the platform can share files
 * (Android, iOS, some desktops); otherwise fall back to a download. Returns
 * what actually happened so the UI can respond.
 */
export async function shareOrDownloadPng(
  blob: Blob,
  filename: string,
  shareData: { title?: string; text?: string },
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };

  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareData.title, text: shareData.text });
      return "shared";
    } catch (err) {
      // The user dismissing the share sheet is not an error.
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      // Any other failure → fall back to a download.
    }
  }

  downloadBlob(blob, filename);
  return "downloaded";
}
