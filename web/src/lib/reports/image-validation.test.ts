import { describe, expect, it, vi } from "vitest";

import { REPORT_IMAGE_MAX_BYTES } from "./photo-reference";
import { readAndValidateReportImageFile } from "./image-validation";

const fixtures = [
  ["image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0x01])],
  [
    "image/png",
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ],
  [
    "image/webp",
    Uint8Array.from([
      0x52,
      0x49,
      0x46,
      0x46,
      0xde,
      0xad,
      0xbe,
      0xef,
      0x57,
      0x45,
      0x42,
      0x50,
    ]),
  ],
] as const;

function imageFile(bytes: Uint8Array, type: string) {
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return new File([data], "PRIVATE-campus-location-image.bin", { type });
}

async function expectImageError(file: File, code: string, status: number) {
  const failure = await readAndValidateReportImageFile(file).catch(
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({
    name: "ReportImageError",
    code,
    status,
  });
  expect(String(failure)).not.toMatch(
    /PRIVATE-campus-location-image|ff d8 ff|MongoServerError|database/i,
  );
}

describe("report image byte validation", () => {
  it.each(fixtures)(
    "accepts declared %s with its exact signature",
    async (contentType, bytes) => {
      const result = await readAndValidateReportImageFile(
        imageFile(bytes, contentType),
      );

      expect(result).toEqual({
        contentType,
        byteLength: bytes.byteLength,
        data: Buffer.from(bytes),
      });
      expect(Buffer.isBuffer(result.data)).toBe(true);
    },
  );

  it("derives byteLength from one arrayBuffer read", async () => {
    const bytes = fixtures[1][1];
    const file = imageFile(bytes, "image/png");
    Object.defineProperty(file, "size", { value: 1 });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    const result = await readAndValidateReportImageFile(file);

    expect(result.byteLength).toBe(bytes.byteLength);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty image", async () => {
    await expectImageError(imageFile(new Uint8Array(), "image/jpeg"),
      "IMAGE_REQUIRED",
      400,
    );
  });

  it("rejects an image over 3 MiB", async () => {
    await expectImageError(
      imageFile(new Uint8Array(REPORT_IMAGE_MAX_BYTES + 1), "image/jpeg"),
      "IMAGE_TOO_LARGE",
      413,
    );
  });

  it("checks the validated bytes even when File.size is inaccurate", async () => {
    const file = imageFile(fixtures[0][1], "image/jpeg");
    Object.defineProperty(file, "size", { value: 1 });
    const arrayBuffer = vi
      .spyOn(file, "arrayBuffer")
      .mockResolvedValue(new ArrayBuffer(REPORT_IMAGE_MAX_BYTES + 1));

    await expectImageError(file, "IMAGE_TOO_LARGE", 413);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported declared MIME type", async () => {
    await expectImageError(
      imageFile(fixtures[0][1], "image/gif"),
      "IMAGE_TYPE_UNSUPPORTED",
      400,
    );
  });

  it.each([
    ["image/png", fixtures[0][1]],
    ["image/webp", fixtures[1][1]],
    ["image/jpeg", fixtures[2][1]],
  ] as const)("rejects %s when its signature is spoofed", async (type, bytes) => {
    await expectImageError(imageFile(bytes, type), "IMAGE_CONTENT_INVALID", 400);
  });

  it.each([
    ["image/jpeg", Uint8Array.from([0xff, 0xd8])],
    [
      "image/png",
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]),
    ],
    [
      "image/webp",
      Uint8Array.from([
        0x52,
        0x49,
        0x46,
        0x46,
        0x00,
        0x00,
        0x00,
        0x00,
        0x57,
        0x45,
        0x42,
      ]),
    ],
  ] as const)("rejects a truncated %s signature", async (type, bytes) => {
    await expectImageError(imageFile(bytes, type), "IMAGE_CONTENT_INVALID", 400);
  });

  it("closes an arrayBuffer read failure without leaking details", async () => {
    const file = imageFile(fixtures[0][1], "image/jpeg");
    const arrayBuffer = vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new Error(
        "PRIVATE-campus-location-image.bin FF D8 FF MongoServerError database stack",
      ),
    );

    await expectImageError(file, "IMAGE_CONTENT_INVALID", 400);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });
});
