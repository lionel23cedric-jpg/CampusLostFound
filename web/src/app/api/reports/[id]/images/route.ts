import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  ReportImageError,
  reportImageErrorResponse,
} from "@/lib/reports/image-errors";
import { uploadReportImage } from "@/lib/reports/image-upload-service";
import { readAndValidateReportImageFile } from "@/lib/reports/image-validation";

type Context = { params: Promise<{ id: string }> };

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const UUID_PATTERN =
  /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function invalidRequest(status = 400) {
  const response = reportImageErrorResponse(
    new ReportImageError("IMAGE_CONTENT_INVALID", {
      image: ["Image request is invalid"],
    }),
  );
  if (status === response.status) return noStore(response);
  return noStore(
    new Response(response.body, { status, headers: response.headers }),
  );
}

export async function POST(request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new ReportImageError("AUTHENTICATION_REQUIRED");
    if (current.status !== "active" || current.role !== "student") {
      throw new ReportImageError("ACCOUNT_UNAVAILABLE");
    }
    user = current;
  } catch (error) {
    return noStore(reportImageErrorResponse(error));
  }

  let reportId: string;
  try {
    const rawId = (await context.params).id;
    if (!OBJECT_ID_PATTERN.test(rawId)) {
      throw new ReportImageError("REPORT_NOT_FOUND");
    }
    reportId = rawId.toLowerCase();
  } catch (error) {
    return noStore(reportImageErrorResponse(error));
  }

  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (!contentType?.startsWith("multipart/form-data;")) {
    return invalidRequest(415);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return invalidRequest();
  }

  const entries = [...formData.entries()];
  const images = entries.filter(([name]) => name === "image");
  const uploadKeys = entries.filter(([name]) => name === "uploadKey");
  if (
    entries.length !== 2 ||
    images.length !== 1 ||
    uploadKeys.length !== 1 ||
    !(images[0][1] instanceof File) ||
    typeof uploadKeys[0][1] !== "string"
  ) {
    return invalidRequest();
  }

  const imageFile = images[0][1];
  const uploadKey = uploadKeys[0][1];
  if (!UUID_PATTERN.test(uploadKey)) {
    return noStore(
      reportImageErrorResponse(
        new ReportImageError("IMAGE_CONTENT_INVALID", {
          uploadKey: ["Upload key is invalid"],
        }),
      ),
    );
  }

  try {
    const image = await readAndValidateReportImageFile(imageFile);
    const result = await uploadReportImage({
      reportId,
      actorId: user.id,
      uploadKey,
      image,
    });
    return noStore(
      Response.json(
        {
          image: {
            url: result.image.url,
            contentType: result.image.contentType,
            byteLength: result.image.byteLength,
          },
        },
        { status: result.created ? 201 : 200 },
      ),
    );
  } catch (error) {
    return noStore(reportImageErrorResponse(error));
  }
}
