export type MatchFactorKey =
  | "category"
  | "location"
  | "date"
  | "colors"
  | "tags"
  | "text";

export type ScoringReport = {
  id: string;
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string | null;
  occurredAt: string | null;
  colors: string[];
  tags: string[];
  createdAt: string;
};

export type MatchFactor = {
  key: MatchFactorKey;
  points: number;
  maximum: number;
  explanation: string;
};

export type MatchScore = {
  score: number;
  factors: MatchFactor[];
};

const DAY_MS = 86_400_000;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "near",
  "of",
  "on",
  "the",
  "to",
  "was",
  "were",
  "with",
]);

const SYNONYMS: Readonly<Record<string, string>> = {
  adapter: "charger",
  cellphone: "phone",
  mobile: "phone",
  smartphone: "phone",
  notebook: "laptop",
  earbuds: "earphones",
  spectacles: "glasses",
};

function normaliseValue(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-NZ");
}

function normaliseSet(values: string[]) {
  return [...new Set(values.map(normaliseValue).filter(Boolean))];
}

function sharedValues(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function jaccard(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const shared = sharedValues(left, right).length;
  return shared / new Set([...left, ...right]).size;
}

function termFrequency(report: ScoringReport) {
  const text = `${report.title} ${report.publicDescription}`
    .normalize("NFKC")
    .toLocaleLowerCase("en-NZ");
  const terms = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const frequencies = new Map<string, number>();

  for (const rawTerm of terms) {
    if (STOP_WORDS.has(rawTerm)) continue;
    const term = SYNONYMS[rawTerm] ?? rawTerm;
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }

  return frequencies;
}

function cosineSimilarity(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
) {
  if (left.size === 0 || right.size === 0) return 0;

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const count of left.values()) leftMagnitude += count * count;
  for (const count of right.values()) rightMagnitude += count * count;
  for (const [term, count] of left) {
    dotProduct += count * (right.get(term) ?? 0);
  }

  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

function addFactor(
  factors: MatchFactor[],
  key: MatchFactorKey,
  points: number,
  maximum: number,
  explanation: string,
) {
  if (points > 0) factors.push({ key, points, maximum, explanation });
}

function sharedExplanation(label: "colours" | "tags", values: string[]) {
  const explanation = `Shared ${label}: ${values.join(", ")}`;
  return explanation.length <= 80
    ? explanation
    : `Shared ${label}: ${values.length} matches`;
}

function dateScore(sourceDate: string | null, candidateDate: string | null) {
  if (!sourceDate || !candidateDate) return null;

  const difference = Math.floor(
    Math.abs(Date.parse(sourceDate) - Date.parse(candidateDate)) / DAY_MS,
  );
  if (!Number.isFinite(difference)) return null;
  if (difference === 0) {
    return { points: 15, explanation: "Reports occurred on the same day" };
  }
  if (difference <= 3) {
    return { points: 12, explanation: "Dates are within 3 days" };
  }
  if (difference <= 7) {
    return { points: 8, explanation: "Dates are within 7 days" };
  }
  if (difference <= 14) {
    return { points: 4, explanation: "Dates are within 14 days" };
  }
  return { points: 0, explanation: "" };
}

export function scoreReportMatch(
  source: ScoringReport,
  candidate: ScoringReport,
): MatchScore {
  const factors: MatchFactor[] = [];

  addFactor(
    factors,
    "category",
    source.categoryId === candidate.categoryId ? 25 : 0,
    25,
    "Same category",
  );

  addFactor(
    factors,
    "location",
    source.campusLocationId &&
      candidate.campusLocationId &&
      source.campusLocationId === candidate.campusLocationId
      ? 15
      : 0,
    15,
    "Same public campus location",
  );

  const date = dateScore(source.occurredAt, candidate.occurredAt);
  if (date) {
    addFactor(factors, "date", date.points, 15, date.explanation);
  }

  const sourceColors = normaliseSet(source.colors);
  const candidateColors = normaliseSet(candidate.colors);
  const colors = sharedValues(sourceColors, candidateColors);
  addFactor(
    factors,
    "colors",
    Math.round(15 * jaccard(sourceColors, candidateColors)),
    15,
    sharedExplanation("colours", colors),
  );

  const sourceTags = normaliseSet(source.tags);
  const candidateTags = normaliseSet(candidate.tags);
  const tags = sharedValues(sourceTags, candidateTags);
  addFactor(
    factors,
    "tags",
    Math.round(10 * jaccard(sourceTags, candidateTags)),
    10,
    sharedExplanation("tags", tags),
  );

  addFactor(
    factors,
    "text",
    Math.round(
      20 *
        cosineSimilarity(termFrequency(source), termFrequency(candidate)),
    ),
    20,
    "Similar report wording",
  );

  return {
    score: factors.reduce((sum, factor) => sum + factor.points, 0),
    factors,
  };
}
