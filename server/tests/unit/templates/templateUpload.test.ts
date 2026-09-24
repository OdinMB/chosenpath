import { Readable } from "stream";
import type { Request, Response } from "express";
import { templateUpload } from "../../../src/templates/templateUpload.js";

const BOUNDARY = "----templateUploadTestBoundary";

type Part =
  | { name: string; value: string }
  | { name: string; filename: string; content: string };

function multipartRequest(parts: Part[]): Request {
  const body = Buffer.from(
    parts
      .map((part) =>
        "filename" in part
          ? `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: application/zip\r\n\r\n${part.content}\r\n`
          : `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`
      )
      .join("") + `--${BOUNDARY}--\r\n`
  );
  const req = Readable.from([body]) as unknown as Request;
  req.headers = {
    "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    "content-length": String(body.length),
  };
  return req;
}

function runUpload(
  fieldName: string,
  req: Request
): Promise<{ error: unknown; req: Request }> {
  return new Promise((resolve) => {
    templateUpload.single(fieldName)(req, {} as Response, (error?: unknown) =>
      resolve({ error, req })
    );
  });
}

describe("templateUpload", () => {
  it("accepts a single file part", async () => {
    const { error, req } = await runUpload(
      "zip",
      multipartRequest([
        { name: "zip", filename: "template.zip", content: "PK-data" },
      ])
    );

    expect(error).toBeUndefined();
    expect(req.file?.originalname).toBe("template.zip");
    expect(req.file?.buffer.toString()).toBe("PK-data");
  });

  it("rejects a field name with an array index", async () => {
    const { error } = await runUpload(
      "zip",
      multipartRequest([
        { name: "items[4294967294]", value: "x" },
        { name: "items[a]", value: "y" },
      ])
    );

    expect(error).toMatchObject({ code: "LIMIT_FIELD_NESTING" });
  });

  it("rejects a nested field name", async () => {
    const { error } = await runUpload(
      "zip",
      multipartRequest([{ name: "a[b][c]", value: "x" }])
    );

    expect(error).toMatchObject({ code: "LIMIT_FIELD_NESTING" });
  });
});
