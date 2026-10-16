export const JSON_REQUEST_BODY_LIMIT = 16 * 1024;

export type RequestBodyErrorCode =
  | "UNSUPPORTED_MEDIA_TYPE"
  | "BODY_TOO_LARGE"
  | "INVALID_UTF8"
  | "EMPTY_BODY"
  | "INVALID_JSON"
  | "INVALID_MULTIPART";

export class RequestBodyError extends Error {
  constructor(readonly code: RequestBodyErrorCode) {
    super(code);
    this.name = "RequestBodyError";
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    // Keep the original safe error classification when cancellation also fails.
  }
}

function isJsonContentType(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

export function requestBodyErrorResponse(error: RequestBodyError) {
  const bodyTooLarge = error.code === "BODY_TOO_LARGE";
  return Response.json(
    {
      error: {
        code: bodyTooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST",
        message: bodyTooLarge
          ? "Request body is too large"
          : "Request body is invalid",
      },
    },
    {
      status: bodyTooLarge ? 413 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

async function readBoundedBody(
  request: Request,
  limit: number,
): Promise<ArrayBuffer> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > limit
  ) {
    await cancelBody(request.body);
    throw new RequestBodyError("BODY_TOO_LARGE");
  }

  if (!request.body) throw new RequestBodyError("EMPTY_BODY");

  const reader = request.body.getReader();
  let byteLength = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new Error("Request body stream failed");
      }

      if (chunk.done) {
        break;
      }

      byteLength += chunk.value.byteLength;
      if (byteLength > limit) {
        throw new RequestBodyError("BODY_TOO_LARGE");
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Keep the original safe error classification when cancellation also fails.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function readJsonRequestBody(
  request: Request,
  limit = JSON_REQUEST_BODY_LIMIT,
): Promise<unknown> {
  const bytes = await readBoundedBody(request, limit);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RequestBodyError("INVALID_UTF8");
  }

  if (text.trim().length === 0) throw new RequestBodyError("EMPTY_BODY");
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new RequestBodyError("UNSUPPORTED_MEDIA_TYPE");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError("INVALID_JSON");
  }
}

export async function readMultipartRequestBody(
  request: Request,
  limit: number,
): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data\s*;/i.test(contentType)) {
    await cancelBody(request.body);
    throw new RequestBodyError("UNSUPPORTED_MEDIA_TYPE");
  }
  const bytes = await readBoundedBody(request, limit);
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new RequestBodyError("INVALID_MULTIPART");
  }
}
