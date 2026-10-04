import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/lectures/$lectureId/summary")({
  component: Outlet,
});
