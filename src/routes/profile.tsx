import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, LogOut, Pencil } from "lucide-react";
import { AppShell, Container, EmptyState, ProgressBar } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/site-header";
import { courseStats, useOverview } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Account — Level 3 Academic Hub" },
      { name: "description", content: "Your personal account, quick study dashboard and recent activity." },
      { property: "og:title", content: "My Account — Level 3 Academic Hub" },
      { property: "og:description", content: "Personal profile and quick dashboard for Level 3 students." },
    ],
  }),
  component: ProfilePage,
});

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function ProfilePage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useOverview();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("profiles")
        .select("full_name, created_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return <AppShell><Container className="py-10" ><p className="text-muted-foreground">Loading…</p></Container></AppShell>;

  const fullName = profileQ.data?.full_name || user.email?.split("@")[0] || "Student";
  const memberSince = profileQ.data?.created_at ?? user.created_at;
  const isPasswordUser = user.app_metadata?.provider === "email" || (user.identities ?? []).some((i) => i.provider === "email");

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) { toast.error("Enter a name (max 100 characters)."); return; }
    setBusy(true);
    const { error } = await supabase.from("profiles").upsert({ id: user!.id, full_name: trimmed });
    setBusy(false);
    if (error) { toast.error("Could not save your name."); return; }
    toast.success("Name updated");
    setEditing(false);
    void queryClient.invalidateQueries({ queryKey: ["profile", user!.id] });
  }

  async function savePassword() {
    if (password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed");
    setPassword("");
    setPwOpen(false);
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Stats — all derived from the signed-in user's own rows (RLS-scoped).
  const attempts = data?.attempts ?? [];
  const assessments = data?.assessments ?? [];
  const lectures = data?.lectures ?? [];
  const courses = data?.courses ?? [];
  const kindOf = new Map(assessments.map((a) => [a.id, a.kind]));
  const quizAttempts = attempts.filter((a) => kindOf.get(a.assessment_id) === "quiz");
  const examAttempts = attempts.filter((a) => kindOf.get(a.assessment_id) === "exam");
  const avg = (rows: typeof attempts) =>
    rows.length === 0 ? 0 : Math.round(rows.reduce((s, a) => s + Number(a.score_percent), 0) / rows.length);
  const answered = attempts.reduce((s, a) => s + a.correct + a.incorrect, 0);
  const correct = attempts.reduce((s, a) => s + a.correct, 0);
  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);

  const resolve = (assessmentId: string) => {
    const assessment = assessments.find((a) => a.id === assessmentId);
    const lecture = lectures.find((l) => l.id === assessment?.lecture_id);
    const course = courses.find((c) => c.id === lecture?.course_id);
    return { assessment, lecture, course };
  };

  const lectureCourse = new Map(lectures.map((l) => [l.id, l.course_id]));
  const courseRows = courses.map((course) => {
    const stats = courseStats(data, course.id);
    const own = attempts.filter((a) => resolve(a.assessment_id).course?.id === course.id);
    const reads = (data?.summaryReads ?? []).filter((r) => lectureCourse.get(r.lecture_id) === course.id);
    return {
      course,
      stats,
      quizzes: own.filter((a) => kindOf.get(a.assessment_id) === "quiz").length,
      exams: own.filter((a) => kindOf.get(a.assessment_id) === "exam").length,
      last: own[0]?.completed_at ?? null,
      started: own.length > 0 || reads.length > 0,
    };
  });
  const started = courseRows.filter((r) => r.started).length;
  const overall =
    courses.length === 0 ? 0 : Math.round(courseRows.reduce((s, r) => s + r.stats.progress, 0) / courses.length);

  const latest = attempts[0];
  const latestInfo = latest ? resolve(latest.assessment_id) : null;
  const recent = attempts.slice(0, 5);

  return (
    <AppShell>
      <Container className="py-10">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "My Account" }]} />

        {/* Profile header */}
        <section className="card-surface mt-6 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-extrabold text-primary-foreground">
              {initialsOf(fullName)}
            </span>
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="max-w-xs" autoFocus />
                  <Button size="sm" onClick={saveName} disabled={busy}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              ) : (
                <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{fullName}</h1>
              )}
              <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-secondary px-2 py-1 font-bold text-secondary-foreground">
                  {isAdmin ? "Admin" : "Student"}
                </span>
                <span className="text-muted-foreground">Member since {fmtDate(memberSince)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
              <Button size="sm" variant="outline" onClick={() => { setName(fullName); setEditing(true); }}>
                <Pencil className="size-4" /> Edit name
              </Button>
              {isPasswordUser && (
                <Button size="sm" variant="outline" onClick={() => setPwOpen((v) => !v)}>
                  <KeyRound className="size-4" /> Change password
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={signOut}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </div>
          </div>
          {pwOpen && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
              <Input
                type="password"
                placeholder="New password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="max-w-xs"
                autoComplete="new-password"
              />
              <Button size="sm" onClick={savePassword} disabled={busy}>Update password</Button>
            </div>
          )}
        </section>

        {/* Quick dashboard */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DashCard label="Courses" value={`${started} / ${courses.length}`} hint={started ? "courses started" : "Start your first course to see your progress here."} />
          <DashCard
            label="Quizzes"
            value={quizAttempts.length ? String(quizAttempts.length) : "—"}
            hint={quizAttempts.length ? `completed · avg ${avg(quizAttempts)}%` : "No quizzes completed yet"}
          />
          <DashCard
            label="Exams"
            value={examAttempts.length ? String(examAttempts.length) : "—"}
            hint={examAttempts.length ? `completed · avg ${avg(examAttempts)}%` : "No exams completed yet"}
          />
          <DashCard
            label="Questions"
            value={answered ? String(answered) : "—"}
            hint={answered ? `${correct} correct · ${accuracy}% accuracy` : "No questions answered yet"}
          />
          <div className="card-surface p-5">
            <p className="label-eyebrow">Overall progress</p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight">{overall}%</p>
            <ProgressBar value={overall} className="mt-3" />
          </div>
          <DashCard
            label="Study activity"
            value={latest ? fmtDate(latest.completed_at) : "—"}
            hint={
              latestInfo
                ? `Last: ${latestInfo.assessment?.title ?? "Assessment"} · ${latestInfo.course?.code ?? ""} Lecture ${latestInfo.lecture?.number ?? ""}`
                : "No activity yet"
            }
          />
        </div>

        {/* Per-course progress */}
        <h2 className="mt-12 text-2xl font-bold">Progress by course</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {courseRows.map(({ course, stats, quizzes, exams, last }) => (
            <div key={course.id} className="card-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-bold">{course.title}</p>
                  <p className="label-eyebrow mt-0.5">{course.code}</p>
                </div>
                <span className="text-sm font-bold">{stats.progress}%</span>
              </div>
              <ProgressBar value={stats.progress} className="mt-3" />
              <p className="mt-2 text-xs text-muted-foreground">
                {quizzes} {quizzes === 1 ? "Quiz" : "Quizzes"} · {exams} {exams === 1 ? "Exam" : "Exams"} ·{" "}
                {last ? `Last activity ${fmtDate(last)}` : "Not started"}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link to="/courses/$courseId" params={{ courseId: course.id }}>Continue Learning</Link>
              </Button>
            </div>
          ))}
        </div>

        {/* Recent activity */}
        <h2 className="mt-12 text-2xl font-bold">Recently completed</h2>
        <div className="mt-5 space-y-3">
          {recent.length === 0 && (
            <EmptyState title="No activity yet" description="Completed quizzes and exams will appear here." />
          )}
          {recent.map((attempt) => {
            const { assessment, lecture, course } = resolve(attempt.assessment_id);
            return (
              <div key={attempt.id} className="card-surface flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {assessment?.kind === "exam" ? "Exam" : "Quiz"} · {assessment?.title ?? "Assessment"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {course?.code} · Lecture {lecture?.number} · {fmtDateTime(attempt.completed_at)}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-sm font-bold">
                  {Math.round(Number(attempt.score_percent))}%
                </span>
              </div>
            );
          })}
        </div>
      </Container>
    </AppShell>
  );
}

function DashCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-surface p-5">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
