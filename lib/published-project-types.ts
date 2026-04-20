export type PublishedProject = {
  slug: string;
  htmlSnapshot: string;
  htmlCanvasImage: string;
  sceneState: {
    projectName: string;
    sections: unknown[];
    sceneObjects: unknown[];
    themeState: unknown;
    layers: unknown[];
    selectedElementId: string | null;
    sceneCanvasImage: string | null;
  };
  createdAt: string;
};

export type PublishedProjectContent = Omit<
  PublishedProject,
  "slug" | "createdAt"
> & {
  createdAt?: string;
};
