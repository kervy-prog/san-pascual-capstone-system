import fs from "node:fs/promises";
import path from "node:path";
import type { Response } from "express";
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
      body: new Uint8Array(options.buffer),
    });
    if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status})`);
    return options.storagePath;
  }

  await fs.mkdir(options.localDirectory, { recursive: true });
  await fs.writeFile(path.join(options.localDirectory, options.fileName), options.buffer);
  return options.fileName;
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