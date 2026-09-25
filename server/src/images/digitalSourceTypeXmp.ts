import { TRAINED_ALGORITHMIC_MEDIA } from "core/types/index.js";
import {
  JPEG_APP0,
  JPEG_APP1,
  JPEG_APP11,
  readJpegHeaderSegments,
} from "./jpegSegments.js";

/*
 * Writes the IPTC digital source type "trainedAlgorithmicMedia" into a JPEG
 * as an XMP packet, losslessly (no re-encode). An unsigned fallback marker for
 * stored images that already lost the vendor's C2PA content credentials; it
 * does not meet the Code of Practice's signed metadata layer. A file that
 * still carries credentials is never touched, because their signature covers
 * its bytes.
 */

const XMP_NAMESPACE = "http://ns.adobe.com/xap/1.0/\u0000";
/** The XMP packet header's begin attribute holds a byte order mark. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const XMP_PACKET = `<?xpacket begin="${BYTE_ORDER_MARK}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    Iptc4xmpExt:DigitalSourceType="${TRAINED_ALGORITHMIC_MEDIA}"/>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

export type DigitalSourceTypeSkipReason =
  | "not-jpeg"
  | "has-content-credentials"
  | "already-marked"
  | "has-other-xmp";

export type DigitalSourceTypeResult =
  | { status: "marked"; image: Buffer }
  | { status: "skipped"; reason: DigitalSourceTypeSkipReason };

function xmpSegment(): Buffer {
  const payload = Buffer.concat([
    Buffer.from(XMP_NAMESPACE, "latin1"),
    Buffer.from(XMP_PACKET, "utf8"),
  ]);
  const header = Buffer.from([0xff, JPEG_APP1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

export function addDigitalSourceTypeXmp(image: Buffer): DigitalSourceTypeResult {
  const segments = readJpegHeaderSegments(image);
  if (!segments) {
    return { status: "skipped", reason: "not-jpeg" };
  }
  if (segments.some((segment) => segment.marker === JPEG_APP11)) {
    return { status: "skipped", reason: "has-content-credentials" };
  }
  const existingXmp = segments.find(
    (segment) =>
      segment.marker === JPEG_APP1 &&
      segment.payload.subarray(0, XMP_NAMESPACE.length).toString("latin1") ===
        XMP_NAMESPACE
  );
  if (existingXmp) {
    // A second XMP packet would be invalid; merging into another is not needed yet
    return {
      status: "skipped",
      reason: existingXmp.payload
        .toString("utf8")
        .includes(TRAINED_ALGORITHMIC_MEDIA)
        ? "already-marked"
        : "has-other-xmp",
    };
  }
  // Readers expect a JFIF APP0 segment first, so insert after it when present
  const insertAt =
    segments[0]?.marker === JPEG_APP0 ? segments[0].end : 2;
  return {
    status: "marked",
    image: Buffer.concat([
      image.subarray(0, insertAt),
      xmpSegment(),
      image.subarray(insertAt),
    ]),
  };
}
