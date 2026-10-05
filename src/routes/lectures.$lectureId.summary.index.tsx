import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Expand, MessageSquareText, Minus, Plus, Shrink } from "lucide-react";
import { AppShell, Container, EmptyState } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { SummaryFile } from "@/lib/types";

export const Route = createFileRoute("/lectures/$lectureId/summary/")({
  head: () => ({ meta: [
    { title: "Lecture Summary — Level 3 Academic Hub" },
    { name: "description", content: "View the published lecture summary." },
    { property: "og:title", content: "Lecture Summary — Level 3 Academic Hub" },
    { property: "og:description", content: "View the published lecture summary." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SummaryPage,
  errorComponent: ({ error }) => <AppShell><Container className="py-16"><p role="alert">{error instanceof Error ? error.message : "The summary could not be loaded."}</p></Container></AppShell>,
  notFoundComponent: () => <AppShell><Container className="py-16"><p>Summary not found.</p></Container></AppShell>,
});

type ViewerFile = SummaryFile & { signedUrl: string };

function SummaryPage() {
  const { lectureId } = Route.useParams();
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const sync = () => setIsFullscreen(Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggleFullscreen = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
    const el = viewerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const run = (p: Promise<void> | undefined) => { void p?.catch(() => undefined); };
    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      run(doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
    } else if (el) {
      run(el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.());
    }
  };

  // Pinch-to-zoom, one-finger pan and ctrl/trackpad-pinch wheel zoom on the image scroller.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const applyZoom = (next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    const prev = zoomRef.current;
    const clamped = Math.min(3, Math.max(0.5, next));
    if (!el || clamped === prev) return;
    const rect = el.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const k = clamped / prev;
    const left = (el.scrollLeft + px) * k - px;
    const top = (el.scrollTop + py) * k - py;
    zoomRef.current = clamped;
    setZoom(clamped);
    requestAnimationFrame(() => { el.scrollLeft = left; el.scrollTop = top; });
  };
  const applyZoomRef = useRef(applyZoom);
  applyZoomRef.current = applyZoom;

  // Reset zoom to exactly 100% and re-center the image (works in fullscreen too).
  const resetZoom = () => {
    zoomRef.current = 1;
    setZoom(1);
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
        el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
      });
    }
  };

  const downloadCurrent = async () => {
    const file = data?.files[page];
    if (!file) return;
    try {
      const response = await fetch(file.signedUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.original_file_name || `summary-page-${page + 1}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(file.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      applyZoomRef.current(zoomRef.current * Math.exp(-dy * 0.01), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer may already be released */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)), zoom: zoomRef.current };
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const el = e.currentTarget;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      applyZoomRef.current(pinch.current.zoom * (dist / pinch.current.dist), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    } else if (pointers.current.size === 1) {
      el.scrollLeft -= e.clientX - prev.x;
      el.scrollTop -= e.clientY - prev.y;
    }
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["summary-viewer", lectureId],
    queryFn: async () => {
      const [lectureResult, summaryResult] = await Promise.all([
        supabase.from("lectures").select("*, courses(id, code, title)").eq("id", lectureId).maybeSingle(),
        supabase.from("summaries").select("*").eq("lecture_id", lectureId).eq("published", true).maybeSingle(),
      ]);
      if (lectureResult.error) throw lectureResult.error;
      if (summaryResult.error) throw summaryResult.error;
      const summary = summaryResult.data;
      if (!summary) return { lecture: lectureResult.data, summary: null, files: [] as ViewerFile[] };
      const filesResult = await supabase.from("summary_files").select("*").eq("summary_id", summary.id).order("page_order");
      if (filesResult.error) throw filesResult.error;
      const files = await Promise.all((filesResult.data as SummaryFile[]).map(async (file) => {
        const signed = await supabase.storage.from("summary-files").createSignedUrl(file.storage_path, 3600);
        if (signed.error) throw signed.error;
        return { ...file, signedUrl: signed.data.signedUrl };
      }));
      return { lecture: lectureResult.data, summary, files };
    },
  });

  useEffect(() => {
    if (!user || !data?.summary || data.files.length === 0) return;
    void supabase.from("summary_reads").upsert({ user_id: user.id, lecture_id: lectureId }, { onConflict: "user_id,lecture_id" });
  }, [user, data?.summary, data?.files.length, lectureId]);

  const course = (data?.lecture as { courses?: { id: string; code: string; title: string } } | null | undefined)?.courses;
  const current = data?.files[page];

  return (
    <AppShell>
      <Container className="py-10">
        <Breadcrumbs items={[{ label: "Courses", to: "/courses" }, ...(course ? [{ label: course.title, to: "/courses/$courseId", params: { courseId: course.id } }] : []), { label: `Lecture ${data?.lecture?.number ?? ""}` }, { label: "Summary" }]} />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="label-eyebrow">{course?.code} · Lecture {String(data?.lecture?.number ?? "").padStart(2, "0")}</p><h1 className="mt-1.5 text-3xl font-extrabold">{data?.lecture?.title ?? "Lecture summary"}</h1></div>
          <div className="flex flex-wrap items-center gap-2">
            {user && current && <Button asChild size="sm"><Link to="/lectures/$lectureId/summary/chat/$threadId" params={{ lectureId, threadId: "new" }} onClick={async (event) => {
              event.preventDefault();
              const existing = await supabase.from("summary_chat_threads").select("id").eq("lecture_id", lectureId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
              if (existing.data) window.location.assign(`/lectures/${lectureId}/summary/chat/${existing.data.id}`);
              else {
                const created = await supabase.from("summary_chat_threads").insert({ lecture_id: lectureId, user_id: user.id }).select("id").single();
                if (created.data) window.location.assign(`/lectures/${lectureId}/summary/chat/${created.data.id}`);
              }
            }}><MessageSquareText className="size-4" /> Ask about this summary</Link></Button>}
            {course && <Button asChild variant="outline" size="sm"><Link to="/courses/$courseId" params={{ courseId: course.id }}><ArrowLeft className="size-4" /> Back to course</Link></Button>}
          </div>
        </div>

        <div className="mt-8">
          {isLoading && <p className="text-sm text-muted-foreground">Loading summary…</p>}
          {!isLoading && !current && <EmptyState title="No summary yet" description="This lecture summary has not been published yet." />}
          {current && current.file_type === "pdf" && (
            <div className="card-surface overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><p className="truncate text-sm font-semibold">{current.original_file_name}</p><div className="flex items-center gap-3"><a href={current.signedUrl} download={current.original_file_name} className="text-xs font-semibold text-primary hover:underline">Download</a><a href={current.signedUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">Open full screen</a></div></div>
              <iframe title="Lecture summary PDF" src={`${current.signedUrl}#toolbar=1&navpanes=0&view=FitH`} className="h-[75vh] min-h-[34rem] w-full bg-secondary/30" />
            </div>
          )}
          {current && current.file_type === "image" && (
            <div ref={viewerRef} className="card-surface overflow-hidden bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex items-center gap-1"><Button size="sm" variant="ghost" aria-label="Previous page" disabled={page === 0} onClick={() => { setPage((value) => Math.max(0, value - 1)); setZoom(1); }}><ChevronLeft className="size-4" /></Button><span className="min-w-20 text-center text-xs font-semibold">Page {page + 1} of {data?.files.length ?? 0}</span><Button size="sm" variant="ghost" aria-label="Next page" disabled={page === (data?.files.length ?? 1) - 1} onClick={() => { setPage((value) => Math.min((data?.files.length ?? 1) - 1, value + 1)); setZoom(1); }}><ChevronRight className="size-4" /></Button></div>
                <div className="flex items-center gap-1"><Button size="sm" variant="ghost" aria-label="Zoom out" onClick={() => applyZoom(zoomRef.current - 0.25)}><Minus className="size-4" /></Button><span className="w-12 text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span><Button size="sm" variant="ghost" aria-label="Zoom in" onClick={() => applyZoom(zoomRef.current + 0.25)}><Plus className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={resetZoom} className="text-xs font-semibold">100%</Button><Button size="sm" variant="ghost" aria-label="Download this page" title="Download this page" onClick={downloadCurrent}><Download className="size-4" /></Button><Button size="sm" variant="ghost" aria-label={isFullscreen ? "Exit full screen" : "Full screen"} title={isFullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>{isFullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}</Button></div>
              </div>
              <div ref={scrollRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} className="h-[72vh] min-h-[32rem] touch-none overscroll-contain overflow-auto bg-secondary/30 p-3 sm:p-6"><img draggable={false} key={current.id} src={current.signedUrl} alt={`Summary page ${page + 1}`} className="mx-auto max-w-none origin-top select-none object-contain" style={{ width: `${zoom * 100}%` }} /></div>
              {(data?.files.length ?? 0) > 1 && <div className="flex gap-2 overflow-x-auto border-t border-border p-3">{data?.files.map((file, index) => <button key={file.id} type="button" onClick={() => { setPage(index); setZoom(1); }} className={`h-20 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-secondary ${index === page ? "border-primary" : "border-transparent"}`}><img src={file.signedUrl} alt={`Page ${index + 1}`} className="h-full w-full object-cover" /></button>)}</div>}
            </div>
          )}
        </div>
      </Container>
    </AppShell>
  );
}