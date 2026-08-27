export const REFERENCE_DATA_REQUEST_BODY_LIMIT = 8 * 1024;

export class ReferenceDataBodyTooLarge extends Error {
  constructor() {
    super("Reference data request body exceeds the size limit");
    this.name = "ReferenceDataBodyTooLarge";
  }
}

export class InvalidReferenceDataBodyEncoding extends Error {
  constructor() {
    super("Reference data request body is not valid UTF-8");
    this.name = "InvalidReferenceDataBodyEncoding";
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    // Preserve the original request-body error classification.
  }
}

export async function readReferenceDataRequestBody(
  request: Request,
): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > REFERENCE_DATA_REQUEST_BODY_LIMIT
  ) {
    await cancelBody(request.body);
    throw new ReferenceDataBodyTooLarge();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new Error("Reference data request body stream failed");
      }

      if (chunk.done) {
        try {
          return text + decoder.decode();
        } catch {
          throw new InvalidReferenceDataBodyEncoding();
        }
      }

      byteLength += chunk.value.byteLength;
      if (byteLength > REFERENCE_DATA_REQUEST_BODY_LIMIT) {
        throw new ReferenceDataBodyTooLarge();
      }
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new InvalidReferenceDataBodyEncoding();
      }
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the original request-body error classification.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
