import type { Difficulty, QuestionType } from "@/lib/types";

export type ImportedQuestion = {
  type: QuestionType;
  text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
  image_url: string | null;
  reference: string | null;
};

export type ImportError = { index: number; messages: string[] };

export type ImportResult = {
  total: number;
  valid: ImportedQuestion[];
  errors: ImportError[];
  fatal?: string;
};

export const JSON_TEMPLATE = [
  {
    question: "Example MCQ question?",
    type: "MCQ",
    options: ["Option A", "Option B", "Option C", "Option D"],
    correct_answer: "Option A",
    explanation: "Explanation here.",
    difficulty: "Easy",
  },
  {
    question: "Example True/False statement.",
    type: "TRUE_FALSE",
    correct_answer: "True",
    explanation: "Explanation here.",
    difficulty: "Medium",
  },
];

function parseType(raw: unknown): QuestionType | null {
  const v = String(raw).trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (v === "mcq" || v === "multiple_choice") return "mcq";
  if (v === "true_false" || v === "truefalse" || v === "tf") return "true_false";
  return null;
}

function parseDifficulty(raw: unknown): Difficulty | null {
  const v = String(raw).trim().toLowerCase();
  return v === "easy" || v === "medium" || v === "hard" ? v : null;
}

function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function validateImport(
  source: string,
  defaults: { type: QuestionType; difficulty: Difficulty },
): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return { total: 0, valid: [], errors: [], fatal: "The file is not valid JSON." };
  }
  if (!Array.isArray(data)) {
    return { total: 0, valid: [], errors: [], fatal: "The JSON must be an array of questions." };
  }

  const valid: ImportedQuestion[] = [];
  const errors: ImportError[] = [];

  data.forEach((item, i) => {
    const messages: string[] = [];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ index: i + 1, messages: ["Entry is not an object"] });
      return;
    }
    const q = item as Record<string, unknown>;
    const text = typeof q.question === "string" ? q.question.trim() : "";
    if (!text) messages.push("Missing question text");

    const type = q.type === undefined || q.type === "" ? defaults.type : parseType(q.type);
    if (!type) messages.push("Invalid question type");

    const difficulty =
      q.difficulty === undefined || q.difficulty === "" ? defaults.difficulty : parseDifficulty(q.difficulty);
    if (!difficulty) messages.push("Invalid difficulty");

    let options: string[] = [];
    let correct = q.correct_answer === undefined || q.correct_answer === null ? "" : String(q.correct_answer).trim();
    if (!correct) messages.push("Missing correct_answer");

    if (type === "mcq") {
      if (!Array.isArray(q.options)) messages.push("MCQ requires an options array");
      else {
        options = q.options.map((o) => String(o).trim()).filter((o) => o !== "");
        if (options.length < 2) messages.push("MCQ needs at least 2 options");
        if (new Set(options).size !== options.length) messages.push("Options must be unique");
        if (correct && !options.includes(correct)) messages.push("correct_answer does not match any option");
      }
    } else if (type === "true_false") {
      options = ["True", "False"];
      const c = correct.toLowerCase();
      if (correct) {
        if (c === "true") correct = "True";
        else if (c === "false") correct = "False";
        else messages.push("True/False answer must be True or False");
      }
    }

    if (messages.length || !type || !difficulty) {
      errors.push({ index: i + 1, messages });
      return;
    }
    valid.push({
      type,
      text,
      options,
      correct_answer: correct,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
      difficulty,
      image_url: optStr(q.image_url ?? q.image),
      reference: optStr(q.reference),
    });
  });

  return { total: data.length, valid, errors };
}

export function normalizeText(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
