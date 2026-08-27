import { describe, expect, it, vi } from "vitest";

import {
  InvalidReferenceDataBodyEncoding,
  REFERENCE_DATA_REQUEST_BODY_LIMIT,
  ReferenceDataBodyTooLarge,
  readReferenceDataRequestBody,
} from "./reference-data-request-body";

describe("reference data request body", () => {
  it("accepts exactly 8 KiB", async () => {
    const text = "a".repeat(8 * 1024);
    await expect(
      readReferenceDataRequestBody(
        new Request("http://localhost", {
          method: "POST",
          body: text,
        }),
      ),
    ).resolves.toBe(text);
    expect(REFERENCE_DATA_REQUEST_BODY_LIMIT).toBe(8 * 1024);
  });

  it("rejects declared and streamed overflow", async () => {
    await expect(
      readReferenceDataRequestBody(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-length": String(8 * 1024 + 1) },
          body: "{}",
        }),
      ),
    ).rejects.toBeInstanceOf(ReferenceDataBodyTooLarge);
    await expect(
      readReferenceDataRequestBody(
        new Request("http://localhost", {
          method: "POST",
          body: "a".repeat(8 * 1024 + 1),
        }),
      ),
    ).rejects.toBeInstanceOf(ReferenceDataBodyTooLarge);
  });

  it("rejects invalid UTF-8", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    });
    await expect(readReferenceDataRequestBody(request)).rejects.toBeInstanceOf(
      InvalidReferenceDataBodyEncoding,
    );
  });

  it("preserves an unknown stream failure for safe 500 mapping", async () => {
    const request = new Request(
      "http://localhost",
      {
        method: "POST",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error("private stream detail"));
          },
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    let failure: unknown;
    try {
      await readReferenceDataRequestBody(request);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(
      expect.objectContaining({
        message: "Reference data request body stream failed",
      }),
    );
    expect(failure).not.toBeInstanceOf(ReferenceDataBodyTooLarge);
    expect(failure).not.toBeInstanceOf(InvalidReferenceDataBodyEncoding);
  });

  it("cancels the stream when streamed bytes exceed 8 KiB", async () => {
    const cancel = vi.fn();
    const request = new Request(
      "http://localhost",
      {
        method: "POST",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(8 * 1024 + 1));
          },
          cancel,
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    await expect(readReferenceDataRequestBody(request)).rejects.toBeInstanceOf(
      ReferenceDataBodyTooLarge,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
