import { create } from "zustand";

type SettingsState = {
  temperature: number;
  setTemperature: (temp: number) => void;
  topP: number;
  setTopP: (topp: number) => void;
};


export const useSettingsStore = create<SettingsState>(set => ({
  temperature: 0.7,
  setTemperature: (temp) => set({ temperature: temp }),
  topP: 0.9,
  setTopP: (topp) => set({ topP: topp }),
}));