import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { REPORT_IMAGE_MAX_BYTES } from "./photo-reference";
import { readAndValidateReportImageFile } from "./image-validation";

type SupportedContentType = "image/jpeg" | "image/png" | "image/webp";

function imageFile(bytes: Uint8Array, type: string) {
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return new File([data], "PRIVATE-campus-location-image.bin", { type });
}

async function validImage(contentType: SupportedContentType) {
  const pipeline = sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: "#1f6a52",
    },
  });

  switch (contentType) {
    case "image/jpeg":
      return pipeline.jpeg().toBuffer();
    case "image/png":
      return pipeline.png().toBuffer();
    case "image/webp":
      return pipeline.webp().toBuffer();
  }
}

async function metadataImage(contentType: SupportedContentType) {
  const pipeline = sharp({
    create: {
      width: 2,
      height: 3,
      channels: 3,
      background: "#1f6a52",
    },
  }).withMetadata({
    orientation: 6,
    exif: { IFD0: { Copyright: "private campus detail" } },
  });

  switch (contentType) {
    case "image/jpeg":
      return pipeline.jpeg().toBuffer();
    case "image/png":
      return pipeline.png().toBuffer();
    case "image/webp":
      return pipeline.webp().toBuffer();
  }
}

async function expectImageError(file: File, code: string, status: number) {
  const failure = await readAndValidateReportImageFile(file).catch(
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ name: "ReportImageError", code, status });
  expect(String(failure)).not.toMatch(
    /PRIVATE-campus-location-image|ff d8 ff|MongoServerError|database/i,
  );
}

describe("report image byte validation", () => {
  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "accepts, decodes and re-encodes declared %s",
    async (contentType) => {
      const source = await validImage(contentType);
      const result = await readAndValidateReportImageFile(
        imageFile(source, contentType),
      );
      const metadata = await sharp(result.data).metadata();

      expect(result.contentType).toBe(contentType);
      expect(result.byteLength).toBe(result.data.byteLength);
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(metadata.width).toBe(3);
      expect(metadata.height).toBe(2);
    },
  );

  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "removes metadata and applies orientation for %s",
    async (contentType) => {
      const source = await metadataImage(contentType);
      expect((await sharp(source).metadata()).exif).toBeDefined();

      const result = await readAndValidateReportImageFile(
        imageFile(source, contentType),
      );
      const metadata = await sharp(result.data).metadata();

      expect(metadata.orientation).toBeUndefined();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.width).toBe(3);
      expect(metadata.height).toBe(2);
    },
  );

  it("derives byteLength from one arrayBuffer read", async () => {
    const bytes = await validImage("image/png");
    const file = imageFile(bytes, "image/png");
    Object.defineProperty(file, "size", { value: 1 });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    const result = await readAndValidateReportImageFile(file);

    expect(result.byteLength).toBe(result.data.byteLength);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty image", async () => {
    await expectImageError(
      imageFile(new Uint8Array(), "image/jpeg"),
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
    const file = imageFile(await validImage("image/jpeg"), "image/jpeg");
    Object.defineProperty(file, "size", { value: 1 });
    const arrayBuffer = vi
      .spyOn(file, "arrayBuffer")
      .mockResolvedValue(new ArrayBuffer(REPORT_IMAGE_MAX_BYTES + 1));

    await expectImageError(file, "IMAGE_TOO_LARGE", 413);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported declared MIME type", async () => {
    await expectImageError(
      imageFile(await validImage("image/jpeg"), "image/gif"),
      "IMAGE_TYPE_UNSUPPORTED",
      400,
    );
  });

  it.each([
    ["image/png", "image/jpeg"],
    ["image/webp", "image/png"],
    ["image/jpeg", "image/webp"],
  ] as const)("rejects %s when its signature is spoofed", async (type, actual) => {
    await expectImageError(
      imageFile(await validImage(actual), type),
      "IMAGE_CONTENT_INVALID",
      400,
    );
  });

  it.each([
    ["image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff])],
    [
      "image/png",
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    [
      "image/webp",
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ]),
    ],
  ] as const)("rejects truncated %s content", async (type, bytes) => {
    await expectImageError(imageFile(bytes, type), "IMAGE_CONTENT_INVALID", 400);
  });

  it("closes an arrayBuffer read failure without leaking details", async () => {
    const file = imageFile(await validImage("image/jpeg"), "image/jpeg");
    const arrayBuffer = vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new Error(
        "PRIVATE-campus-location-image.bin FF D8 FF MongoServerError database stack",
      ),
    );

    await expectImageError(file, "IMAGE_CONTENT_INVALID", 400);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });
});
