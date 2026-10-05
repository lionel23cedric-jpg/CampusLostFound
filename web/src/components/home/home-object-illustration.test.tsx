// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { HomeObjectIllustration } from "./home-object-illustration";

afterEach(cleanup);

it.each(["backpack", "keys", "bottle", "headphones"] as const)(
  "renders a decorative %s illustration",
  (kind) => {
    const { container } = render(<HomeObjectIllustration kind={kind} className="sample" />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.classList.contains("sample")).toBe(true);
    expect(svg?.querySelector("path, circle, rect")).not.toBeNull();
  },
);
