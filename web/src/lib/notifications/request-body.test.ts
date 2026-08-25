import { describe, expect, it } from "vitest";

import {
  InvalidNotificationBodyEncoding,
  NOTIFICATION_REQUEST_BODY_LIMIT,
  NotificationBodyTooLarge,
  readNotificationRequestBody,
} from "./request-body";

describe("notification request body", () => {
  it("accepts absent and bounded UTF-8 bodies", async () => {
    await expect(
      readNotificationRequestBody(new Request("http://localhost/read")),
    ).resolves.toBe("");
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          body: "{}",
        }),
      ),
    ).resolves.toBe("{}");
  });

  it("rejects declared and streamed oversized bodies", async () => {
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          headers: {
            "content-length": String(NOTIFICATION_REQUEST_BODY_LIMIT + 1),
          },
          body: "{}",
        }),
      ),
    ).rejects.toBeInstanceOf(NotificationBodyTooLarge);
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          body: "x".repeat(NOTIFICATION_REQUEST_BODY_LIMIT + 1),
        }),
      ),
    ).rejects.toBeInstanceOf(NotificationBodyTooLarge);
  });

  it("rejects invalid UTF-8 and failed streams", async () => {
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          body: new Blob([new Uint8Array([0xff])]),
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidNotificationBodyEncoding);

    const failed = {
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        pull() {
          throw new Error("PRIVATE-STREAM-FAILURE");
        },
      }),
    } as Request;
    await expect(readNotificationRequestBody(failed)).rejects.toThrow(
      "Notification request body stream failed",
    );
  });

  it("preserves the original body error when stream cancellation fails", async () => {
    const failedCancellation = {
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new Uint8Array(NOTIFICATION_REQUEST_BODY_LIMIT + 1),
          );
        },
        cancel() {
          throw new Error("PRIVATE-CANCEL-FAILURE");
        },
      }),
    } as Request;

    await expect(
      readNotificationRequestBody(failedCancellation),
    ).rejects.toBeInstanceOf(NotificationBodyTooLarge);
  });
});
