export const NOTIFICATION_REQUEST_BODY_LIMIT = 16 * 1024;

export class NotificationBodyTooLarge extends Error {
  constructor() {
    super("Notification request body exceeds the size limit");
    this.name = "NotificationBodyTooLarge";
  }
}

export class InvalidNotificationBodyEncoding extends Error {
  constructor() {
    super("Notification request body is not valid UTF-8");
    this.name = "InvalidNotificationBodyEncoding";
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    // Preserve the original request-body error classification.
  }
}

export async function readNotificationRequestBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > NOTIFICATION_REQUEST_BODY_LIMIT
  ) {
    await cancelBody(request.body);
    throw new NotificationBodyTooLarge();
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
        throw new Error("Notification request body stream failed");
      }
      if (chunk.done) {
        try {
          return text + decoder.decode();
        } catch {
          throw new InvalidNotificationBodyEncoding();
        }
      }
      byteLength += chunk.value.byteLength;
      if (byteLength > NOTIFICATION_REQUEST_BODY_LIMIT) {
        throw new NotificationBodyTooLarge();
      }
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new InvalidNotificationBodyEncoding();
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
