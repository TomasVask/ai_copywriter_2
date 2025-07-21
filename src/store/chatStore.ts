import { create } from "zustand";
import { ChatSession } from "@/models/chatSession.model";

type ChatStoreState = {
  chatHistory: ChatSession[];
  setChatHistory: (history: ChatSession[]) => void;
  currentSession: ChatSession | null;
  setCurrentSession: (session: ChatSession | null) => void;
};

export const useChatStore = create<ChatStoreState>((set) => ({
  chatHistory: [],
  setChatHistory: (history) => set({ chatHistory: history }),
  currentSession: null,
  setCurrentSession: (session) => set({ currentSession: session }),
}));