/*
 * Reads a JPEG's header segments (everything before the compressed image
 * data) without decoding the image, for lossless metadata edits.
 */

const JPEG_SOI = 0xd8;
const JPEG_SOS = 0xda;
export const JPEG_APP0 = 0xe0;
/** EXIF and XMP live in APP1 segments. */
export const JPEG_APP1 = 0xe1;
/** C2PA content credentials live in APP11 segments (JUMBF boxes). */
export const JPEG_APP11 = 0xeb;

export type JpegSegment = {
  marker: number;
  /** Offset of the segment's FF marker byte. */
  start: number;
  /** Offset just past the segment. */
  end: number;
  /** The bytes after the two length bytes. */
  payload: Buffer;
};

/** The header segments in file order, or undefined when the buffer is not a JPEG. */
export function readJpegHeaderSegments(
  image: Buffer
): JpegSegment[] | undefined {
  if (image.length < 4 || image[0] !== 0xff || image[1] !== JPEG_SOI) {
    return undefined;
  }
  const segments: JpegSegment[] = [];
  let offset = 2;
  // Each header segment is FF <marker> <2-byte length>, up to the start of scan
  while (offset + 4 <= image.length && image[offset] === 0xff) {
    const marker = image[offset + 1];
    if (marker === JPEG_SOS) {
      break;
    }
    const end = offset + 2 + image.readUInt16BE(offset + 2);
    segments.push({
      marker,
      start: offset,
      end,
      payload: image.subarray(offset + 4, end),
    });
    offset = end;
  }
  return segments;
}
