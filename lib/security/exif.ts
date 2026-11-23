/**
 * Binary EXIF / GPS / XMP metadata stripper for uploaded images.
 * Removes APP1-APP15 and COM markers from JPEG files and ancillary text/eXIf chunks from PNG files
 * before storing anything on disk, ensuring zero GPS coordinates or device metadata survive.
 */

export function stripImageMetadata(buffer: Buffer, mimeType: string): { clean: Buffer; strippedSegments: number } {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return stripJpegExif(buffer);
  }
  if (mimeType === 'image/png') {
    return stripPngMetadata(buffer);
  }
  return { clean: buffer, strippedSegments: 0 };
}

function stripJpegExif(buf: Buffer): { clean: Buffer; strippedSegments: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return { clean: buf, strippedSegments: 0 };
  }

  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let offset = 2;
  let strippedSegments = 0;

  while (offset + 1 < buf.length) {
    if (buf[offset] !== 0xff) {
      out.push(buf.subarray(offset));
      break;
    }

    const marker = buf[offset + 1];
    // Start of Scan (0xDA) or End of Image (0xD9): copy remainder verbatim
    if (marker === 0xda || marker === 0xd9) {
      out.push(buf.subarray(offset));
      break;
    }

    // Standalone markers without length
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > buf.length) break;
    const segmentLength = buf.readUInt16BE(offset + 2);
    const totalLen = 2 + segmentLength;
    if (offset + totalLen > buf.length) {
      out.push(buf.subarray(offset));
      break;
    }

    // Strip APP1..APP15 (0xE1..0xEF: EXIF, GPS, XMP, IPTC) and COM (0xFE)
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) {
      strippedSegments += 1;
    } else {
      out.push(buf.subarray(offset, offset + totalLen));
    }

    offset += totalLen;
  }

  return { clean: Buffer.concat(out), strippedSegments };
}

function stripPngMetadata(buf: Buffer): { clean: Buffer; strippedSegments: number } {
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(pngSig)) {
    return { clean: buf, strippedSegments: 0 };
  }

  const out: Buffer[] = [pngSig];
  let offset = 8;
  let strippedSegments = 0;
  const stripChunkTypes = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

  while (offset + 12 <= buf.length) {
    const dataLen = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const totalChunkLen = 12 + dataLen;
    if (offset + totalChunkLen > buf.length) break;

    if (stripChunkTypes.has(type)) {
      strippedSegments += 1;
    } else {
      out.push(buf.subarray(offset, offset + totalChunkLen));
    }

    offset += totalChunkLen;
    if (type === 'IEND') break;
  }

  return { clean: Buffer.concat(out), strippedSegments };
}
