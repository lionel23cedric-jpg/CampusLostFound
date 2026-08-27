export const ACCOUNT_REQUEST_BODY_LIMIT = 8 * 1024;

export class AccountBodyTooLarge extends Error {
  constructor() {
    super("Account request body exceeds the size limit");
    this.name = "AccountBodyTooLarge";
  }
}

export class InvalidAccountBodyEncoding extends Error {
  constructor() {
    super("Account request body is not valid UTF-8");
    this.name = "InvalidAccountBodyEncoding";
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    // Preserve the original request-body error classification.
  }
}

export async function readAccountRequestBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > ACCOUNT_REQUEST_BODY_LIMIT
  ) {
    await cancelBody(request.body);
    throw new AccountBodyTooLarge();
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
        throw new Error("Account request body stream failed");
      }

      if (chunk.done) {
        try {
          return text + decoder.decode();
        } catch {
          throw new InvalidAccountBodyEncoding();
        }
      }

      byteLength += chunk.value.byteLength;
      if (byteLength > ACCOUNT_REQUEST_BODY_LIMIT) {
        throw new AccountBodyTooLarge();
      }
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new InvalidAccountBodyEncoding();
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
