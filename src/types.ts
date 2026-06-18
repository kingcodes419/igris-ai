export interface ChatSession {
  id: number;
  title: string;
  created_at?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface User {
  username: string;
  email: string;
  photoUrl?: string;
  token?: string;
  rememberMe?: boolean;
}

export interface AppConfig {
  apiBaseUrl: string;
  themeAccent: "violet" | "crimson" | "silver";
  systemInstructions: string;
}
