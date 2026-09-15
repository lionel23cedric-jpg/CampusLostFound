import { describe, expect, it } from "vitest";

import {
  JSON_REQUEST_BODY_LIMIT,
  RequestBodyError,
  readJsonRequestBody,
  requestBodyErrorResponse,
} from "./request-body";

const encoder = new TextEncoder();

function jsonRequest(body: BodyInit | null, headers?: HeadersInit) {
  return new Request("https://campus-find.test/api", {
    method: "POST",
    body,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function streamRequest(chunks: Uint8Array[], headers?: HeadersInit) {
  return jsonRequest(
    new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }),
    headers,
  );
}

async function expectCode(request: Request, code: string) {
  await expect(readJsonRequestBody(request)).rejects.toMatchObject({
    name: "RequestBodyError",
    code,
  });
}

describe("readJsonRequestBody", () => {
  it("uses one 16 KiB limit and returns parsed JSON values", async () => {
    expect(JSON_REQUEST_BODY_LIMIT).toBe(16 * 1024);
    await expect(readJsonRequestBody(jsonRequest("true"))).resolves.toBe(true);
  });

  it("accepts a body at the exact UTF-8 byte boundary", async () => {
    const body = `"${"é".repeat((JSON_REQUEST_BODY_LIMIT - 2) / 2)}"`;
    expect(encoder.encode(body)).toHaveLength(JSON_REQUEST_BODY_LIMIT);
    await expect(readJsonRequestBody(jsonRequest(body))).resolves.toBe(
      body.slice(1, -1),
    );
  });

  it("rejects one byte over the stream limit", async () => {
    const bytes = encoder.encode(" ".repeat(JSON_REQUEST_BODY_LIMIT + 1));
    await expectCode(streamRequest([bytes]), "BODY_TOO_LARGE");
  });

  it("rejects an oversized declared content length before reading", async () => {
    await expectCode(
      jsonRequest("{}", {
        "content-length": String(JSON_REQUEST_BODY_LIMIT + 1),
      }),
      "BODY_TOO_LARGE",
    );
  });

  it("requires the JSON media type", async () => {
    await expectCode(
      new Request("https://campus-find.test/api", {
        method: "POST",
        body: "{}",
      }),
      "UNSUPPORTED_MEDIA_TYPE",
    );
  });

  it("rejects empty and whitespace-only bodies", async () => {
    await expectCode(jsonRequest(null), "EMPTY_BODY");
    await expectCode(jsonRequest(" \r\n\t"), "EMPTY_BODY");
  });

  it("rejects malformed JSON without retaining raw text", async () => {
    const failure = await readJsonRequestBody(jsonRequest('{"private":'))
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "INVALID_JSON" });
    expect(String(failure)).not.toContain("private");
  });

  it("rejects invalid and incomplete UTF-8", async () => {
    await expectCode(streamRequest([new Uint8Array([0xff])]), "INVALID_UTF8");
    await expectCode(
      streamRequest([new Uint8Array([0xe2, 0x82])]),
      "INVALID_UTF8",
    );
  });

  it("decodes a multibyte character split across chunks", async () => {
    const bytes = encoder.encode('"A€B"');
    await expect(
      readJsonRequestBody(
        streamRequest([bytes.slice(0, 3), bytes.slice(3, 4), bytes.slice(4)]),
      ),
    ).resolves.toBe("A€B");
  });

  it("cancels an open stream after detecting overflow", async () => {
    let cancelled = false;
    const request = jsonRequest(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(
            encoder.encode("x".repeat(JSON_REQUEST_BODY_LIMIT + 1)),
          );
        },
        cancel() {
          cancelled = true;
        },
      }),
    );

    await expectCode(request, "BODY_TOO_LARGE");
    expect(cancelled).toBe(true);
  });

  it("keeps the size error when stream cancellation also fails", async () => {
    const request = jsonRequest(
      new ReadableStream<Uint8Array>({
        cancel() {
          throw new Error("PRIVATE-CANCEL");
        },
      }),
      { "content-length": String(JSON_REQUEST_BODY_LIMIT + 1) },
    );

    await expectCode(request, "BODY_TOO_LARGE");
  });

  it("returns safe no-store error responses", async () => {
    const oversized = requestBodyErrorResponse(
      new RequestBodyError("BODY_TOO_LARGE"),
    );
    const invalid = requestBodyErrorResponse(
      new RequestBodyError("INVALID_JSON"),
    );

    expect(oversized.status).toBe(413);
    expect(oversized.headers.get("cache-control")).toBe("no-store");
    expect(await oversized.json()).toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
      },
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Request body is invalid" },
    });
  });
});
