import { describe, expect, it } from "vitest";
import { validateImport } from "./question-import";

const d = { type: "mcq" as const, difficulty: "medium" as const };

describe("validateImport", () => {
  it("rejects non-array JSON", () => {
    expect(validateImport('{"a":1}', d).fatal).toBeDefined();
  });
  it("rejects MCQ whose correct answer is not an option", () => {
    const r = validateImport(JSON.stringify([{ question: "Q", type: "MCQ", options: ["A", "B"], correct_answer: "C" }]), d);
    expect(r.valid).toHaveLength(0);
    expect(r.errors[0]?.messages).toContain("correct_answer does not match any option");
  });
  it("uses default difficulty when missing and JSON difficulty when present", () => {
    const r = validateImport(
      JSON.stringify([
        { question: "Q1", options: ["A", "B"], correct_answer: "A" },
        { question: "Q2", type: "TRUE_FALSE", correct_answer: "false", difficulty: "Hard" },
      ]),
      d,
    );
    expect(r.valid[0]?.difficulty).toBe("medium");
    expect(r.valid[1]?.difficulty).toBe("hard");
    expect(r.valid[1]?.correct_answer).toBe("False");
  });
});
