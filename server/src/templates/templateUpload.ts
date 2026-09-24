import multer from "multer";

// multer 2.2+ reads these two limits, but @types/multer does not declare them yet.
type UploadLimits = NonNullable<multer.Options["limits"]> & {
  fieldNestingDepth?: number;
  fieldArrayIndexLimit?: number;
};

// Template uploads carry one file part and no text fields, so text field names
// with brackets are refused. Without these limits a single crafted field name
// makes multer allocate a huge array or a deeply nested object
// (GHSA-535w-7cp7-47q4, GHSA-72gw-mp4g-v24j); upgrading multer alone does not
// close either advisory.
const limits: UploadLimits = {
  fieldNestingDepth: 0,
  fieldArrayIndexLimit: 0,
};

export const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits,
});
