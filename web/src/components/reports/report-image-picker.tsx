"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent } from "react";

import {
  REPORT_IMAGE_CONTENT_TYPES,
  REPORT_IMAGE_LIMIT,
  REPORT_IMAGE_MAX_BYTES,
} from "@/lib/reports/photo-reference";

import styles from "./report-form.module.css";

export type PendingReportImage = {
  uploadKey: string;
  file: File;
};

type ReportImagePickerProps = {
  id: string;
  images: PendingReportImage[];
  disabled: boolean;
  errors: string[];
  onChange: (images: PendingReportImage[]) => void;
  onErrorsChange: (errors: string[]) => void;
};

function validateFiles(files: File[], currentCount: number): string[] {
  const errors: string[] = [];

  if (currentCount + files.length > REPORT_IMAGE_LIMIT) {
    errors.push(`Choose no more than ${REPORT_IMAGE_LIMIT} images`);
  }
  if (files.some((file) => file.size === 0)) {
    errors.push("Choose a non-empty image file");
  }
  if (files.some((file) => file.size > REPORT_IMAGE_MAX_BYTES)) {
    errors.push("Each image must be 3 MB or smaller");
  }
  if (
    files.some(
      (file) =>
        !REPORT_IMAGE_CONTENT_TYPES.includes(
          file.type as (typeof REPORT_IMAGE_CONTENT_TYPES)[number],
        ),
    )
  ) {
    errors.push("Use a JPEG, PNG or WebP image");
  }

  return errors;
}

function ImagePreview({
  image,
  index,
  disabled,
  onRemove,
}: {
  image: PendingReportImage;
  index: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextPreviewUrl = URL.createObjectURL(image.file);
    let isActive = true;

    queueMicrotask(() => {
      if (isActive) setPreviewUrl(nextPreviewUrl);
    });

    return () => {
      isActive = false;
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [image.file]);

  return (
    <li className={styles.previewItem}>
      {previewUrl && (
        <Image
          className={styles.previewImage}
          src={previewUrl}
          alt={`Selected image ${index + 1}`}
          width={320}
          height={240}
          unoptimized
        />
      )}
      <button
        className={styles.removeButton}
        type="button"
        onClick={onRemove}
        disabled={disabled}
      >
        Remove image {index + 1}
      </button>
    </li>
  );
}

export function ReportImagePicker({
  id,
  images,
  disabled,
  errors,
  onChange,
  onErrorsChange,
}: ReportImagePickerProps) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const nextErrors = validateFiles(files, images.length);
    onErrorsChange(nextErrors);
    if (nextErrors.length > 0) return;

    onChange([
      ...images,
      ...files.map((file) => ({ uploadKey: crypto.randomUUID(), file })),
    ]);
  }

  return (
    <div className={styles.imagePicker}>
      <div className={styles.field}>
        <label htmlFor={id}>Report images (optional)</label>
        <input
          id={id}
          className={styles.fileInput}
          name="images"
          type="file"
          accept={REPORT_IMAGE_CONTENT_TYPES.join(",")}
          multiple
          disabled={disabled || images.length >= REPORT_IMAGE_LIMIT}
          onChange={selectFiles}
          aria-invalid={errors.length > 0}
          aria-describedby={`${helpId}${errors.length ? ` ${errorId}` : ""}`}
        />
        <p className={styles.help} id={helpId}>
          Choose up to five JPEG, PNG or WebP images. Each image may be up to 3
          MB. Files stay on this device until the report is created.
        </p>
        {errors.length > 0 && (
          <p className={styles.fieldError} id={errorId} role="alert">
            {errors.join(". ")}
          </p>
        )}
      </div>

      <p className={styles.selectionStatus} aria-live="polite">
        {images.length} of {REPORT_IMAGE_LIMIT} images selected
      </p>
      {images.length > 0 && (
        <ul className={styles.previewList} aria-label="Selected report images">
          {images.map((image, index) => (
            <ImagePreview
              key={image.uploadKey}
              image={image}
              index={index}
              disabled={disabled}
              onRemove={() => {
                onErrorsChange([]);
                onChange(
                  images.filter(
                    (candidate) => candidate.uploadKey !== image.uploadKey,
                  ),
                );
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
