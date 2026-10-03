import path from "node:path";
import { compressStoredReportImage } from "./file-storage.js";

type ReportImage = { filePath: string; mediaType: string };

export async function compressResolvedReportImages(media: ReportImage[]) {
  const images = media.filter((item) => item.mediaType === "IMAGE");
  const results = await Promise.all(images.map(async (item) => {
    try {
      return await compressStoredReportImage(path.basename(item.filePath));
    } catch (error) {
      console.error(`Unable to compress resolved report image ${path.basename(item.filePath)}:`, error);
      return { compressed: false, reason: "compression-failed" } as const;
    }
  }));

  return {
    imageCount: images.length,
    compressedCount: results.filter((result) => result.compressed).length,
  };
}