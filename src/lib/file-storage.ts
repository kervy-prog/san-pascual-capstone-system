import fs from "node:fs/promises";
import path from "node:path";
import type { Response } from "express";
import sharp from "sharp";
import { env } from "../config/env.js";

const bucket = env.SUPABASE_STORAGE_BUCKET;

function isCloudStorageConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function storageUrl(storagePath: string) {
  return `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
}

export async function storeUpload(options: {
  localDirectory: string;
  storagePath: string;
  fileName: string;
  buffer: Buffer;
  contentType: string;
}) {
  if (isCloudStorageConfigured()) {
    const response = await fetch(storageUrl(options.storagePath), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": options.contentType,
        "x-upsert": "false",
      },
      signal: AbortSignal.timeout(8000),
      body: new Uint8Array(options.buffer),
    });
    if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status})`);
    return options.storagePath;
  }

  await fs.mkdir(options.localDirectory, { recursive: true });
  await fs.writeFile(path.join(options.localDirectory, options.fileName), options.buffer);
  return options.fileName;
}

export async function compressStoredReportImage(fileName: string) {
  const safeFileName = path.basename(fileName);
  const extension = path.extname(safeFileName).toLowerCase();
  const formats = {
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".png": "png",
    ".webp": "webp",
  } as const;
  const outputFormat = formats[extension as keyof typeof formats];
  if (!outputFormat) return { compressed: false, reason: "unsupported-format" } as const;

  const localDirectory = path.resolve(process.cwd(), "private-uploads", "reports");
  const localPath = path.join(localDirectory, safeFileName);
  const storagePath = `reports/${safeFileName}`;
  let original: Buffer;

  if (isCloudStorageConfigured()) {
    const fileResponse = await fetch(storageUrl(storagePath), {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!fileResponse.ok) throw new Error(`Unable to download report image (${fileResponse.status})`);
    original = Buffer.from(await fileResponse.arrayBuffer());
  } else {
    original = await fs.readFile(localPath);
  }

  const image = sharp(original, { failOn: "none" }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
  const optimized = await image[outputFormat](
    outputFormat === "jpeg" ? { quality: 78, mozjpeg: true }
      : outputFormat === "webp" ? { quality: 78, effort: 5 }
        : { compressionLevel: 9, adaptiveFiltering: true },
  ).toBuffer();

  if (optimized.length >= original.length) {
    return { compressed: false, reason: "already-optimized", originalBytes: original.length } as const;
  }

  const contentType = outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
  if (isCloudStorageConfigured()) {
    const uploadResponse = await fetch(storageUrl(storagePath), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      signal: AbortSignal.timeout(8000),
      body: new Uint8Array(optimized),
    });
    if (!uploadResponse.ok) throw new Error(`Unable to replace report image (${uploadResponse.status})`);
  } else {
    const temporaryPath = `${localPath}.optimized`;
    await fs.writeFile(temporaryPath, optimized);
    await fs.rename(temporaryPath, localPath);
  }

  return { compressed: true, originalBytes: original.length, compressedBytes: optimized.length } as const;
}

export async function sendStoredFile(response: Response, options: {
  localDirectory: string;
  storagePath: string;
  fileName: string;
}) {
  if (isCloudStorageConfigured()) {
    const fileResponse = await fetch(storageUrl(options.storagePath), {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!fileResponse.ok) return false;
    response.type(fileResponse.headers.get("content-type") || "application/octet-stream");
    response.send(Buffer.from(await fileResponse.arrayBuffer()));
    return true;
  }

  try {
    await fs.access(path.join(options.localDirectory, options.fileName));
  } catch {
    return false;
  }
  response.sendFile(path.join(options.localDirectory, options.fileName));
  return true;
}