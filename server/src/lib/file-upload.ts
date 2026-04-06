import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

const ALLOWED_TYPES: Record<string, string[]> = {
  text: ['.txt', '.md'],
  audio: ['.mp3', '.wav', '.m4a', '.ogg', '.webm'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  pdf: ['.pdf'],
  presentation: ['.ppt', '.pptx'],
  video: ['.mp4', '.mov', '.avi', '.mkv'],
  document: ['.doc', '.docx', '.xls', '.xlsx'],
};

const MAX_SIZES: Record<string, number> = {
  text: 2 * 1024 * 1024,           // 2MB
  audio: 50 * 1024 * 1024,         // 50MB
  image: 10 * 1024 * 1024,         // 10MB
  pdf: 20 * 1024 * 1024,           // 20MB
  presentation: 50 * 1024 * 1024,  // 50MB
  video: 200 * 1024 * 1024,        // 200MB
  document: 20 * 1024 * 1024,      // 20MB
};

function detectFileType(fileName: string): string | null {
  const ext = extname(fileName).toLowerCase();
  for (const [type, exts] of Object.entries(ALLOWED_TYPES)) {
    if (exts.includes(ext)) return type;
  }
  return null;
}

export async function saveUploadedFile(
  orgId: string,
  buffer: Buffer,
  fileName: string,
): Promise<{ filePath: string; fileName: string; fileType: string; fileSize: number }> {
  const fileType = detectFileType(fileName);
  if (!fileType) throw new Error(`Unsupported file type: ${fileName}`);

  const maxSize = MAX_SIZES[fileType];
  if (buffer.length > maxSize) {
    throw new Error(`File too large (max ${maxSize / 1024 / 1024}MB for ${fileType})`);
  }

  const ext = extname(fileName);
  const storedName = `${randomUUID()}${ext}`;
  const dir = join(UPLOAD_DIR, orgId);
  await mkdir(dir, { recursive: true });

  const filePath = join(dir, storedName);
  await writeFile(filePath, buffer);

  return {
    filePath: `uploads/${orgId}/${storedName}`,
    fileName,
    fileType,
    fileSize: buffer.length,
  };
}
