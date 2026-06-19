"use client";
// @ts-nocheck

import { type FormEvent, useEffect, useState } from "react";
import {
  deleteLocalProject,
  deleteSupabaseProject,
  listLocalProjects,
  listSupabaseProjects,
  saveProjectToLocalStorage,
  updateSupabaseProjectName,
  type ProjectRecord
} from "@/lib/project-persistence";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { useYiiyaStore } from "@/lib/store";

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60000));

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

export function ProjectDrawer({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const isGuest = useYiiyaStore((state) => state.isGuest);
  const loadProject = useYiiyaStore((state) => state.loadProject);
  const resetProject = useYiiyaStore((state) => state.resetProject);
  const addLog = useYiiyaStore((state) => state.addLog);
  const [hasSession, setHasSession] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setStatus("loading");
    setStatusMessage("");

    if (isGuest || !hasSession) {
      setProjects(listLocalProjects(isGuest ? 3 : 8));
      setStatus("idle");
      return;
    }

    void listSupabaseProjects(8)
      .then((items) => {
        setProjects(items);
        setStatus("idle");
      })
      .catch(() => {
        setProjects(listLocalProjects(3));
        setStatus("error");
        setStatusMessage("Cloud projects unavailable. Showing local drafts.");
        addLog("SYSTEM: Project list unavailable — showing local drafts.");
      });
  }, [addLog, hasSession, isGuest, open]);

  const handleOpenProject = (project: ProjectRecord) => {
    loadProject({
      id: project.id,
      projectName: project.project_name,
      canvas_json: project.canvas_json,
      theme_json: project.theme_json,
      logLabel: "SYSTEM: Project opened."
    });
    onClose();
  };

  const handleDeleteProject = async (project: ProjectRecord) => {
    if (isGuest || !hasSession) {
      deleteLocalProject(project.id);
    } else {
      await deleteSupabaseProject(project.id);
    }

    setProjects((current) => current.filter((item) => item.id !== project.id));
  };

  const handleRenameSubmit = async (
    event: FormEvent<HTMLFormElement>,
    project: ProjectRecord
  ) => {
    event.preventDefault();

    const projectName = editingName.trim() || "untitled project";
    const nextProject = {
      ...project,
      project_name: projectName,
      updated_at: new Date().toISOString()
    };

    if (isGuest || !hasSession) {
      saveProjectToLocalStorage(nextProject);
    } else {
      await updateSupabaseProjectName(project.id, projectName);
    }

    setProjects((current) =>
      current.map((item) => (item.id === project.id ? nextProject : item))
    );
    setEditingId(null);
  };

  const filteredProjects = projects.filter((project) => {
    const haystack = `${project.project_name} ${project.canvas_json.meta?.briefSummary ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <aside
      className="absolute bottom-0 right-0 top-12 z-40 w-[280px] border-l border-terminalBorder bg-ink/98 p-4 text-bone shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-transform duration-200"
      style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white/48">
          Projects
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="h-7 px-2 text-white/45 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
        >
          Close
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          resetProject();
          onClose();
        }}
        className="mb-4 h-9 w-full border border-terminalBorder text-xs font-bold uppercase tracking-[0.12em] text-white/70 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
      >
        New project
      </button>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search projects"
        className="mb-4 h-9 w-full border border-terminalBorder bg-black px-3 text-xs text-bone outline-none placeholder:text-white/28 focus:border-amber"
      />
      <div className="yiiya-scrollbar grid max-h-[calc(100%-112px)] gap-2 overflow-y-auto pr-1">
        {status === "loading" ? (
          <p className="text-xs text-white/35">Loading projects...</p>
        ) : filteredProjects.length === 0 ? (
          <p className="text-xs text-white/35">No saved projects yet.</p>
        ) : (
          filteredProjects.map((project) => (
            <div
              key={project.id}
              className="overflow-hidden border border-terminalBorder bg-white/[0.025]"
            >
              {project.canvas_json.meta?.thumbnailImage ? (
                <div
                  className="h-24 w-full border-b border-terminalBorder bg-cover bg-center"
                  style={{
                    backgroundImage: `linear-gradient(rgba(5,5,5,0.08), rgba(5,5,5,0.28)), url(${project.canvas_json.meta.thumbnailImage})`
                  }}
                />
              ) : (
                <div className="grid h-24 w-full place-items-center border-b border-terminalBorder bg-[radial-gradient(circle_at_top,_rgba(239,159,39,0.2),_transparent_55%)] text-[10px] uppercase tracking-[0.18em] text-white/28">
                  Preview pending
                </div>
              )}
              <div className="p-2">
              {editingId === project.id ? (
                <form onSubmit={(event) => handleRenameSubmit(event, project)}>
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={() => setEditingId(null)}
                    className="w-full border border-terminalBorder bg-black px-2 py-1 text-xs text-bone outline-none focus:border-amber"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(project.id);
                    setEditingName(project.project_name);
                  }}
                  className="block w-full truncate text-left text-xs font-semibold text-white/82 transition hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
                >
                  {project.project_name}
                </button>
              )}
              <p className="mt-1 text-[10px] text-white/35">
                {project.canvas_json.sections.length} sections ·{" "}
                {relativeTime(project.updated_at)}
              </p>
              <p
                className="mt-2 overflow-hidden text-[10px] leading-relaxed text-white/46"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical"
                }}
              >
                {project.canvas_json.meta?.briefSummary ?? "Resume this spatial draft and keep building."}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenProject(project)}
                  className="h-7 flex-1 border border-terminalBorder text-[10px] uppercase tracking-[0.12em] text-white/60 transition hover:border-amber/70 hover:text-amber focus:outline-none focus:ring-1 focus:ring-amber"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteProject(project)}
                  className="h-7 flex-1 border border-terminalBorder text-[10px] uppercase tracking-[0.12em] text-white/45 transition hover:border-red-500/70 hover:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-400"
                >
                  Delete
                </button>
              </div>
              </div>
            </div>
          ))
        )}
      </div>
      {status === "error" ? (
        <p className="mt-3 border-t border-terminalBorder pt-3 text-xs text-amber/70">
          {statusMessage}
        </p>
      ) : null}
      {isGuest || !hasSession ? (
        <p className="mt-4 border-t border-terminalBorder pt-3 text-xs text-white/38">
          Sign in to sync
        </p>
      ) : null}
    </aside>
  );
}
