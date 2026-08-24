import { describe, expect, it } from "vitest";

import {
  BodyTooLarge,
  CLAIM_REQUEST_BODY_LIMIT,
  InvalidBodyEncoding,
  readClaimRequestBody,
} from "@/lib/claims/request-body";

const encoder = new TextEncoder();

function streamRequest(
  chunks: Uint8Array[],
  headers?: HeadersInit,
) {
  return new Request("http://localhost/api/claims", {
    method: "POST",
    headers,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readClaimRequestBody", () => {
  it("returns an empty string when the request has no body", async () => {
    await expect(
      readClaimRequestBody(
        new Request("http://localhost/api/claims", { method: "POST" }),
      ),
    ).resolves.toBe("");
  });

  it("accepts a body exactly at the byte limit", async () => {
    const text = "x".repeat(CLAIM_REQUEST_BODY_LIMIT);

    await expect(
      readClaimRequestBody(streamRequest([encoder.encode(text)])),
    ).resolves.toBe(text);
  });

  it("rejects a body one byte over the limit", async () => {
    const bytes = encoder.encode("x".repeat(CLAIM_REQUEST_BODY_LIMIT + 1));

    await expect(
      readClaimRequestBody(streamRequest([bytes])),
    ).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("counts multibyte UTF-8 input by bytes", async () => {
    const exact = "é".repeat(CLAIM_REQUEST_BODY_LIMIT / 2);

    await expect(
      readClaimRequestBody(streamRequest([encoder.encode(exact)])),
    ).resolves.toBe(exact);
    await expect(
      readClaimRequestBody(
        streamRequest([encoder.encode(`${exact}a`)]),
      ),
    ).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("preserves UTF-8 characters split across stream chunks", async () => {
    const bytes = encoder.encode("A€B");

    await expect(
      readClaimRequestBody(
        streamRequest([
          bytes.slice(0, 2),
          bytes.slice(2, 3),
          bytes.slice(3),
        ]),
      ),
    ).resolves.toBe("A€B");
  });

  it("rejects invalid UTF-8 instead of replacing it", async () => {
    await expect(
      readClaimRequestBody(streamRequest([new Uint8Array([0xff])])),
    ).rejects.toBeInstanceOf(InvalidBodyEncoding);
  });

  it("rejects an incomplete UTF-8 sequence at the end of the stream", async () => {
    await expect(
      readClaimRequestBody(streamRequest([new Uint8Array([0xe2, 0x82])])),
    ).rejects.toBeInstanceOf(InvalidBodyEncoding);
  });

  it("rejects an oversized declared Content-Length", async () => {
    await expect(
      readClaimRequestBody(
        streamRequest([encoder.encode("{}")], {
          "content-length": String(CLAIM_REQUEST_BODY_LIMIT + 1),
        }),
      ),
    ).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("cancels the body when Content-Length is already oversized", async () => {
    let cancelled = false;
    const request = new Request("http://localhost/api/claims", {
      method: "POST",
      headers: {
        "content-length": String(CLAIM_REQUEST_BODY_LIMIT + 1),
      },
      body: new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readClaimRequestBody(request)).rejects.toBeInstanceOf(
      BodyTooLarge,
    );
    expect(cancelled).toBe(true);
  });

  it("rejects chunked overflow despite a forged small Content-Length", async () => {
    const half = "x".repeat(CLAIM_REQUEST_BODY_LIMIT / 2);

    await expect(
      readClaimRequestBody(
        streamRequest(
          [encoder.encode(half), encoder.encode(half), encoder.encode("x")],
          { "content-length": "1" },
        ),
      ),
    ).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("cancels an open stream after detecting chunked overflow", async () => {
    let cancelled = false;
    const request = new Request("http://localhost/api/claims", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(
            encoder.encode("x".repeat(CLAIM_REQUEST_BODY_LIMIT + 1)),
          );
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readClaimRequestBody(request)).rejects.toBeInstanceOf(
      BodyTooLarge,
    );
    expect(cancelled).toBe(true);
  });

  it("cancels an open stream after detecting invalid UTF-8", async () => {
    let cancelled = false;
    const request = new Request("http://localhost/api/claims", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array([0xff]));
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readClaimRequestBody(request)).rejects.toBeInstanceOf(
      InvalidBodyEncoding,
    );
    expect(cancelled).toBe(true);
  });

  it("does not let cancellation errors replace the size error", async () => {
    const request = new Request("http://localhost/api/claims", {
      method: "POST",
      headers: {
        "content-length": String(CLAIM_REQUEST_BODY_LIMIT + 1),
      },
      body: new ReadableStream<Uint8Array>({
        cancel() {
          throw new Error("PRIVATE-CANCEL");
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readClaimRequestBody(request)).rejects.toBeInstanceOf(
      BodyTooLarge,
    );
  });
});
