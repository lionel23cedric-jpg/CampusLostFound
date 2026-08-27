import { describe, expect, it } from "vitest";

import {
  ACCOUNT_REQUEST_BODY_LIMIT,
  AccountBodyTooLarge,
  InvalidAccountBodyEncoding,
  readAccountRequestBody,
} from "./account-request-body";

describe("administrator account request body", () => {
  it("accepts absent and bounded UTF-8 bodies", async () => {
    await expect(
      readAccountRequestBody(new Request("http://localhost/status")),
    ).resolves.toBe("");
    await expect(
      readAccountRequestBody(
        new Request("http://localhost/status", {
          method: "PATCH",
          body: "{}",
        }),
      ),
    ).resolves.toBe("{}");
  });

  it("rejects declared and streamed oversized bodies", async () => {
    await expect(
      readAccountRequestBody(
        new Request("http://localhost/status", {
          method: "PATCH",
          headers: {
            "content-length": String(ACCOUNT_REQUEST_BODY_LIMIT + 1),
          },
          body: "{}",
        }),
      ),
    ).rejects.toBeInstanceOf(AccountBodyTooLarge);
    await expect(
      readAccountRequestBody(
        new Request("http://localhost/status", {
          method: "PATCH",
          body: "x".repeat(ACCOUNT_REQUEST_BODY_LIMIT + 1),
        }),
      ),
    ).rejects.toBeInstanceOf(AccountBodyTooLarge);
  });

  it("rejects invalid UTF-8 and failed streams", async () => {
    await expect(
      readAccountRequestBody(
        new Request("http://localhost/status", {
          method: "PATCH",
          body: new Blob([new Uint8Array([0xff])]),
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidAccountBodyEncoding);

    const failed = {
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        pull() {
          throw new Error("PRIVATE-STREAM-FAILURE");
        },
      }),
    } as Request;
    await expect(readAccountRequestBody(failed)).rejects.toThrow(
      "Account request body stream failed",
    );
  });

  it("preserves the original body error when cancellation fails", async () => {
    const failedCancellation = {
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(ACCOUNT_REQUEST_BODY_LIMIT + 1));
        },
        cancel() {
          throw new Error("PRIVATE-CANCEL-FAILURE");
        },
      }),
    } as Request;

    await expect(
      readAccountRequestBody(failedCancellation),
    ).rejects.toBeInstanceOf(AccountBodyTooLarge);
  });
});
