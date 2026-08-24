export const CLAIM_REQUEST_BODY_LIMIT = 16 * 1024;

export class BodyTooLarge extends Error {
  constructor() {
    super("Claim request body exceeds the size limit");
    this.name = "BodyTooLarge";
  }
}

export class InvalidBodyEncoding extends Error {
  constructor() {
    super("Claim request body is not valid UTF-8");
    this.name = "InvalidBodyEncoding";
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    // Preserve the original request-body error classification.
  }
}

export async function readClaimRequestBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > CLAIM_REQUEST_BODY_LIMIT
  ) {
    await cancelBody(request.body);
    throw new BodyTooLarge();
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
        throw new Error("Claim request body stream failed");
      }

      const { done, value } = chunk;
      if (done) {
        try {
          return text + decoder.decode();
        } catch {
          throw new InvalidBodyEncoding();
        }
      }

      byteLength += value.byteLength;
      if (byteLength > CLAIM_REQUEST_BODY_LIMIT) {
        throw new BodyTooLarge();
      }
      try {
        text += decoder.decode(value, { stream: true });
      } catch {
        throw new InvalidBodyEncoding();
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
