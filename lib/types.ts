export interface Member {
  id: string;
  username: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  fromId: string;
  text: string;
  sentAt: number;
}

export type ApiError = { error: string };
