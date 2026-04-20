"use client";

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

    if (isGuest || !hasSession) {
      setProjects(listLocalProjects(isGuest ? 3 : 8));
      return;
    }

    void listSupabaseProjects(8)
      .then(setProjects)
      .catch(() => {
        setProjects(listLocalProjects(3));
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
      <div className="yiiya-scrollbar grid max-h-[calc(100%-112px)] gap-2 overflow-y-auto pr-1">
        {projects.length === 0 ? (
          <p className="text-xs text-white/35">No saved projects yet.</p>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="border border-terminalBorder bg-white/[0.025] p-2"
            >
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
                {relativeTime(project.updated_at)}
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
          ))
        )}
      </div>
      {isGuest || !hasSession ? (
        <p className="mt-4 border-t border-terminalBorder pt-3 text-xs text-white/38">
          Sign in to sync
        </p>
      ) : null}
    </aside>
  );
}
