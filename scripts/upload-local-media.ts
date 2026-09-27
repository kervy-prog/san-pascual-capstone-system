import fs from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "private-uploads";
const projectDirectory = process.cwd();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the terminal before running this script");
}

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

async function uploadDirectory(directory: string) {
  const files = await fs.readdir(path.join(projectDirectory, "private-uploads", directory));
  let uploaded = 0;
  for (const fileName of files) {
    const localPath = path.join(projectDirectory, "private-uploads", directory, fileName);
    const file = await fs.readFile(localPath);
    const storagePath = `${directory}/${fileName}`;
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": contentTypes[path.extname(fileName).toLowerCase()] || "application/octet-stream",
        "x-upsert": "true",
      },
      body: new Uint8Array(file),
    });
    if (!response.ok) throw new Error(`Upload failed for ${storagePath}: ${response.status} ${await response.text()}`);
    uploaded += 1;
  }
  return uploaded;
}

async function main() {
  const uploaded = (await Promise.all(["reports", "residents", "officials"].map(uploadDirectory)))
    .reduce((total, count) => total + count, 0);
  console.log(`Uploaded ${uploaded} local media files to Supabase Storage bucket '${bucket}'.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});