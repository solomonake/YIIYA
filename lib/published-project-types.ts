export type PublishedProject = {
  slug: string;
  userId?: string | null;
  isPro?: boolean;
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
    showWatermark?: boolean;
  };
  createdAt: string;
  reactCode?: string;
  zipUrl?: string;
};

export type PublishedProjectContent = Omit<
  PublishedProject,
  "slug" | "createdAt"
> & {
  draft?: boolean;
  createdAt?: string;
};
