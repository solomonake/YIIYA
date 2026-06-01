/**
 * Zustand slice for the stage lifecycle.
 *
 * The existing lib/store.ts is large and complex. Rather than rewrite it,
 * spread this slice into the existing store-creator. Usage:
 *
 *   import { create } from "zustand";
 *   import { createStageSlice, type StageSlice } from "@/lib/scene/stage-slice";
 *
 *   export const useYiiyaStore = create<YiiyaState & StageSlice>()((set, get) => ({
 *     // ...existing state and actions...
 *     ...createStageSlice(set, get)
 *   }));
 *
 * The slice exposes `stage`, `stageDispatch(event)`, and `clearStage()`.
 */
import type { StageEvent, StageState } from "./stage-state";
import { initialStage, reduceStage } from "./stage-state";

export type StageSlice = {
  stage: StageState;
  stageDispatch: (event: StageEvent) => void;
  clearStage: () => void;
};

type SetState = (
  partial:
    | Partial<StageSlice>
    | ((state: StageSlice) => Partial<StageSlice>)
) => void;
type GetState = () => StageSlice;

export function createStageSlice(set: SetState, _get: GetState): StageSlice {
  return {
    stage: initialStage,
    stageDispatch: (event) =>
      set((s) => ({
        stage: reduceStage(s.stage, event, Date.now())
      })),
    clearStage: () => set({ stage: initialStage })
  };
}
