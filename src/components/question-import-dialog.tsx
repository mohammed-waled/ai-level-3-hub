import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileJson, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DIFFICULTIES, type Course, type Difficulty, type Lecture, type Question, type QuestionType } from "@/lib/types";
import { JSON_TEMPLATE, normalizeText, validateImport, type ImportResult } from "@/lib/question-import";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

export function QuestionImportDialog({
  open,
  onOpenChange,
  courses,
  lectures,
  questions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  lectures: Lecture[];
  questions: Question[];
}) {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [lectureId, setLectureId] = useState("");
  const [type, setType] = useState<QuestionType>("mcq");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const result: ImportResult | null = source ? validateImport(source, { type, difficulty }) : null;
  const course = courses.find((c) => c.id === courseId);
  const lecture = lectures.find((l) => l.id === lectureId);
  const existing = new Set(
    questions.filter((q) => q.course_id === courseId && q.lecture_id === lectureId).map((q) => normalizeText(q.text)),
  );
  const duplicates = (result?.valid ?? []).filter((q) => existing.has(normalizeText(q.text)));
  const canImport = Boolean(courseId && lectureId && result && !result.fatal && result.errors.length === 0 && result.valid.length);

  function reset() {
    setSource("");
    setFileName("");
  }

  async function runImport(skipDuplicates: boolean) {
    if (!result || !canImport) return;
    const rows = result.valid
      .filter((q) => !skipDuplicates || !existing.has(normalizeText(q.text)))
      .map((q) => ({ ...q, course_id: courseId, lecture_id: lectureId }));
    if (rows.length === 0) {
      toast.info("Nothing to import — all questions were duplicates.");
      return;
    }
    setBusy(true);
    // Single insert statement: all rows succeed or none are written.
    const { error } = await supabase.from("questions").insert(rows);
    setBusy(false);
    if (error) {
      toast.error(`Import failed — no questions were added. ${error.message}`);
      return;
    }
    toast.success(`${rows.length} questions imported successfully.`);
    void queryClient.invalidateQueries();
    reset();
    onOpenChange(false);
  }

  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(JSON_TEMPLATE, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions-template.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const count = (pred: (q: ImportResult["valid"][number]) => boolean) => (result?.valid ?? []).filter(pred).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Questions</DialogTitle>
          <DialogDescription>Upload a JSON file to add many questions to one lecture at once.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Course *</Label>
            <select className={selectCls} value={courseId} onChange={(e) => { setCourseId(e.target.value); setLectureId(""); }}>
              <option value="">Choose course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title} — {c.code}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Lecture *</Label>
            <select className={selectCls} value={lectureId} disabled={!courseId} onChange={(e) => setLectureId(e.target.value)}>
              <option value="">Choose lecture…</option>
              {lectures.filter((l) => l.course_id === courseId).map((l) => (
                <option key={l.id} value={l.id}>Lecture {String(l.number).padStart(2, "0")} — {l.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Default type</Label>
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
              <option value="mcq">Multiple choice</option>
              <option value="true_false">True / False</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Default difficulty</Label>
            <select className={selectCls} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d} className="capitalize">{d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline" disabled={!courseId || !lectureId}>
            <label className={!courseId || !lectureId ? "pointer-events-none opacity-50" : "cursor-pointer"}>
              <Upload className="size-4" /> {fileName ? "Choose another file" : "Choose JSON File"}
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setFileName(file.name);
                  setSource(await file.text());
                }}
              />
            </label>
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadTemplate}>
            <Download className="size-4" /> Download JSON Template
          </Button>
          {fileName && <span className="flex items-center gap-1 text-xs text-muted-foreground"><FileJson className="size-3.5" />{fileName}</span>}
        </div>

        <details className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-foreground">JSON Format</summary>
          <p className="mt-2">The file must be an array of objects. Fields:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li><b>question</b> (required) — question text</li>
            <li><b>type</b> — "MCQ" or "TRUE_FALSE" (uses default if missing)</li>
            <li><b>options</b> — required for MCQ, at least 2</li>
            <li><b>correct_answer</b> (required) — must match an option exactly; "True"/"False" for True/False</li>
            <li><b>explanation</b>, <b>difficulty</b> (Easy/Medium/Hard), <b>image_url</b>, <b>reference</b> — optional</li>
            <li>Course and lecture in the file are ignored — the selection above is used.</li>
          </ul>
        </details>

        {result?.fatal && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{result.fatal}</p>}

        {result && !result.fatal && (
          <div className="space-y-3">
            <div className="card-surface p-4 text-sm">
              <p className="font-semibold">Import Preview</p>
              <p className="mt-1 text-muted-foreground">
                {course?.title} · {lecture ? `Lecture ${String(lecture.number).padStart(2, "0")} — ${lecture.title}` : "No lecture selected"}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                {[
                  ["Total", result.total],
                  ["Valid", result.valid.length],
                  ["Invalid", result.errors.length],
                  ["MCQ", count((q) => q.type === "mcq")],
                  ["True/False", count((q) => q.type === "true_false")],
                  ["E / M / H", `${count((q) => q.difficulty === "easy")}/${count((q) => q.difficulty === "medium")}/${count((q) => q.difficulty === "hard")}`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border p-2">
                    <p className="text-muted-foreground">{k}</p>
                    <p className="font-bold">{v}</p>
                  </div>
                ))}
              </div>
              {result.errors.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-success">✓ All questions valid</p>
              ) : (
                <p className="mt-3 text-sm font-semibold text-destructive">Fix the errors below and upload the file again.</p>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-destructive/30 p-3 text-sm">
                {result.errors.map((err) => (
                  <div key={err.index}>
                    <p className="font-semibold">Question #{err.index}</p>
                    {err.messages.map((m) => <p key={m} className="text-destructive">✕ {m}</p>)}
                  </div>
                ))}
              </div>
            )}

            {result.errors.length === 0 && (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-sm">
                {result.valid.map((q, i) => (
                  <div key={i} className="border-b border-border pb-2 last:border-0">
                    <p className="font-medium">
                      {i + 1}. {q.text}
                      {existing.has(normalizeText(q.text)) && <span className="ml-2 rounded bg-secondary px-1.5 text-[0.7rem]">Possible duplicate</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {q.type === "mcq" ? "MCQ" : "True/False"} · <span className="capitalize">{q.difficulty}</span> · Answer: {q.correct_answer}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {canImport && duplicates.length > 0 && (
              <p className="rounded-lg bg-secondary p-3 text-sm">{duplicates.length} possible duplicate questions found.</p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              {canImport && duplicates.length > 0 && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void runImport(true)}>
                  Skip duplicates ({result.valid.length - duplicates.length})
                </Button>
              )}
              <Button size="sm" disabled={!canImport || busy} onClick={() => void runImport(false)}>
                {duplicates.length > 0 ? "Import anyway" : "Import"} {result.valid.length}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
