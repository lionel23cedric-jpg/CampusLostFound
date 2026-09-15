// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */

import type { ImgHTMLAttributes } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & {
    priority?: boolean;
  }) => {
    void priority;
    return <img {...props} />;
  },
}));

import {
  ContextIllustration,
  type IllustrationKind,
} from "./context-illustration";

afterEach(cleanup);

it.each([
  ["auth", "/illustrations/auth.webp"],
  ["reports", "/illustrations/reports.webp"],
  ["claims", "/illustrations/claims.webp"],
  ["notifications", "/illustrations/notifications.webp"],
  ["administration", "/illustrations/administration.webp"],
] satisfies ReadonlyArray<readonly [IllustrationKind, string]>)
  ("renders the local %s visual as decorative content", (kind, source) => {
    const { container } = render(<ContextIllustration kind={kind} />);
    const image = container.querySelector("img");

    expect(image?.getAttribute("src")).toBe(source);
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("width")).toBe("960");
    expect(image?.getAttribute("height")).toBe("640");
    expect(container.querySelector("figure")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
