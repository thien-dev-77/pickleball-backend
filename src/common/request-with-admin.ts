import { Request } from 'express';

export type RequestWithAdmin = Request & {
  adminSession?: { id: string; username: string; expiresAt: Date };
};
