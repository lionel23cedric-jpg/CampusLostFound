import {
  reportAssistantResponseSchema,
  type ReportAssistantRequest,
  type ReportAssistantResponse,
} from "@/lib/ai/contracts";
import { embedPublicText } from "@/lib/reports/local-embedding";
import { cosineSimilarity } from "@/lib/reports/semantic-score";

const CONTROLLED_TAGS = [
  "backpack",
  "bag",
  "charger",
  "phone",
  "keys",
  "wallet",
  "bottle",
  "book",
  "clothing",
  "laptop",
  "headphones",
  "card",
  "black",
  "blue",
  "red",
  "silver",
  "library",
  "student-centre",
  "gym",
  "bus-stop",
] as const;

const MAX_DESCRIPTION_LENGTH = 2000;
const TAG_THRESHOLD = 0.25;

function normaliseWhitespace(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function sentence(value: string) {
  const base = normaliseWhitespace(value).replace(/[.!?]+$/u, "");
  return `${base.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}.`;
}

function formatDescription(input: ReportAssistantRequest) {
  const description = sentence(input.publicDescription);
  const colors = Array.from(
    new Set(
      input.colors
        .map((color) => normaliseWhitespace(color).toLowerCase())
        .filter(Boolean),
    ),
  );
  if (colors.length === 0) return description;

  const suffix = `The item is ${colors.join(" and ")}.`;
  return description.length + suffix.length + 1 <= MAX_DESCRIPTION_LENGTH
    ? `${description} ${suffix}`
    : description;
}

function lexicalTags(input: ReportAssistantRequest) {
  const text = normaliseWhitespace(
    `${input.title} ${input.publicDescription} ${input.colors.join(" ")}`,
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ");
  const padded = ` ${text} `;

  return CONTROLLED_TAGS.filter((tag) =>
    padded.includes(` ${tag.replaceAll("-", " ")} `),
  ).slice(0, 5);
}

async function semanticTags(input: ReportAssistantRequest) {
  const publicText = `${input.title}. ${input.publicDescription}. ${input.colors.join(" ")}`;
  const source = await embedPublicText(publicText);
  const vectors = await Promise.all(
    CONTROLLED_TAGS.map((tag) => embedPublicText(tag)),
  );

  return CONTROLLED_TAGS.map((tag, index) => ({
    tag,
    score: cosineSimilarity(source, vectors[index]),
    index,
  }))
    .filter(({ score }) => score >= TAG_THRESHOLD)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 5)
    .map(({ tag }) => tag);
}

export async function suggestReportDetails(
  input: ReportAssistantRequest,
): Promise<ReportAssistantResponse> {
  const suggestedDescription = formatDescription(input);

  try {
    return reportAssistantResponseSchema.parse({
      method: "model_assisted",
      suggestedDescription,
      suggestedTags: await semanticTags(input),
    });
  } catch {
    return reportAssistantResponseSchema.parse({
      method: "fallback",
      suggestedDescription,
      suggestedTags: lexicalTags(input),
    });
  }
}
