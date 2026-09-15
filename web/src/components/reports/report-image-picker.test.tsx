// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportImagePicker, type PendingReportImage } from "./report-image-picker";

const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
const revokeObjectURL = vi.fn();

function imageFile(name: string, type = "image/jpeg", size = 4) {
  return new File([new Uint8Array(size)], name, { type });
}

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [images, setImages] = useState<PendingReportImage[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  return (
    <ReportImagePicker
      id="report-images"
      images={images}
      disabled={disabled}
      errors={errors}
      onChange={setImages}
      onErrorsChange={setErrors}
    />
  );
}

beforeEach(() => {
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: revokeObjectURL },
  });
  createObjectURL.mockClear();
  createObjectURL.mockImplementation((file) => `blob:${file.name}`);
  revokeObjectURL.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("ReportImagePicker", () => {
  it("renders the live object URL recreated by React Strict Mode", async () => {
    createObjectURL.mockImplementation(
      (file) => `blob:${file.name}-${createObjectURL.mock.calls.length}`,
    );

    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText("Report images (optional)"), {
      target: { files: [imageFile("strict.jpg")] },
    });

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:strict.jpg-1");
    expect((await screen.findByRole("img")).getAttribute("src")).toBe(
      "blob:strict.jpg-2",
    );
  });

  it("selects supported files with opaque upload keys and private previews", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Report images (optional)");
    const files = [
      imageFile("private-one.jpg"),
      imageFile("private-two.png", "image/png"),
      imageFile("private-three.webp", "image/webp"),
    ];

    fireEvent.change(input, { target: { files } });

    expect(await screen.findAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("3 of 5 images selected")).toBeTruthy();
    expect(document.body.textContent).not.toContain("private-one.jpg");
    expect(createObjectURL).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [imageFile("empty.jpg", "image/jpeg", 0), "Choose a non-empty image file"],
    [imageFile("large.jpg", "image/jpeg", 3 * 1024 * 1024 + 1), "Each image must be 3 MB or smaller"],
    [imageFile("unsafe.svg", "image/svg+xml"), "Use a JPEG, PNG or WebP image"],
  ])("rejects invalid local files without previewing them", (file, message) => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Report images (optional)"), {
      target: { files: [file] },
    });

    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("enforces the five-image limit across selections", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Report images (optional)");

    fireEvent.change(input, {
      target: {
        files: Array.from({ length: 5 }, (_, index) => imageFile(`${index}.jpg`)),
      },
    });
    fireEvent.change(input, { target: { files: [imageFile("six.jpg")] } });

    expect(await screen.findAllByRole("img")).toHaveLength(5);
    expect(screen.getByRole("alert").textContent).toContain(
      "Choose no more than 5 images",
    );
  });

  it("removes one preview and revokes only its object URL", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Report images (optional)"), {
      target: { files: [imageFile("one.jpg"), imageFile("two.jpg")] },
    });

    await user.click(screen.getByRole("button", { name: "Remove image 1" }));

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:one.jpg");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("revokes every remaining preview when unmounted", () => {
    const view = render(<Harness />);
    fireEvent.change(screen.getByLabelText("Report images (optional)"), {
      target: { files: [imageFile("one.jpg"), imageFile("two.jpg")] },
    });

    view.unmount();

    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("disables selection and removal while its owner is pending", () => {
    render(<Harness disabled />);

    expect(
      (screen.getByLabelText("Report images (optional)") as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});
