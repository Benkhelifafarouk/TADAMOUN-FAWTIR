import { env } from '@/lib/env';

export type DetectedType = 'image/jpeg' | 'image/png' | 'application/pdf';

export interface FileInspection {
  mime: DetectedType;
  extension: 'jpg' | 'png' | 'pdf';
  width: number | null;
  height: number | null;
}

/**
 * Content-based validation. The extension and the browser-provided MIME type are
 * never trusted: the first bytes must match a supported format.
 */
export function detectFileType(buffer: Buffer): DetectedType | null {
  if (buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => buffer[index] === byte)) return 'image/png';
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

function pngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  // IHDR is always the first chunk.
  if (buffer.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

export type UploadValidation =
  | { ok: true; inspection: FileInspection }
  | { ok: false; reason: 'type' | 'size' | 'empty' | 'dimensions' };

export function validateUpload(buffer: Buffer, declaredMime: string | undefined): UploadValidation {
  if (buffer.length === 0) return { ok: false, reason: 'empty' };
  if (buffer.length > env().MAX_UPLOAD_BYTES) return { ok: false, reason: 'size' };

  const detected = detectFileType(buffer);
  if (!detected) return { ok: false, reason: 'type' };

  // Declared MIME may be generic (application/octet-stream) but must not claim a
  // different supported format than the bytes actually are.
  if (
    declaredMime &&
    ['.jpg', '.jpeg', '.png', '.pdf'].some((ext) => declaredMime.toLowerCase().includes(ext)) &&
    !declaredMime.toLowerCase().includes(detected.split('/')[1] === 'jpeg' ? 'jpeg' : detected.split('/')[1]) &&
    !(detected === 'image/jpeg' && declaredMime.toLowerCase().includes('jpg'))
  ) {
    return { ok: false, reason: 'type' };
  }

  if (detected === 'application/pdf') {
    return { ok: true, inspection: { mime: detected, extension: 'pdf', width: null, height: null } };
  }

  const size = detected === 'image/png' ? pngSize(buffer) : jpegSize(buffer);
  if (!size) return { ok: false, reason: 'type' };
  if (size.width < 200 || size.height < 200) return { ok: false, reason: 'dimensions' };
  if (size.width > 12000 || size.height > 12000) return { ok: false, reason: 'dimensions' };

  return {
    ok: true,
    inspection: {
      mime: detected,
      extension: detected === 'image/png' ? 'png' : 'jpg',
      width: size.width,
      height: size.height,
    },
  };
}

export type ScanOutcome = 'clean' | 'flagged' | 'not_available';

/**
 * Malware scanning hook. No engine is bundled or configured in this deployment,
 * therefore the honest result is `not_available` (recorded as `pending`).
 */
export async function scanFile(_buffer: Buffer): Promise<ScanOutcome> {
  return 'not_available';
}
