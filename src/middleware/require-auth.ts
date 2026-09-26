import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AuthRequest = Request & { userId?: string; userRole?: string };

export function requireAuth(request: AuthRequest, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & { role?: string };
    if (typeof payload.sub !== "string") {
      response.status(401).json({ error: "Invalid session" });
      return;
    }

    request.userId = payload.sub;
    request.userRole = payload.role;
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired session" });
  }
}
