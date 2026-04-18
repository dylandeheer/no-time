import { useEffect, useState } from "react";
import type { TrackingState } from "@shared/types";

const EMPTY_STATE: TrackingState = {
  activities: {},
  projects: [],
  rules: [],
  currentActivity: null,
  totalTodaySeconds: 0,
  isPaused: false,
};

export function useTrackingState(): TrackingState {
  const [state, setState] = useState<TrackingState>(EMPTY_STATE);

  useEffect(() => {
    let mounted = true;

    window.electronAPI.getState().then((s) => {
      if (mounted) setState(s);
    });

    const off = window.electronAPI.onTrackingUpdate((s) => {
      if (mounted) setState(s);
    });

    return () => {
      mounted = false;
      off();
    };
  }, []);

  return state;
}
