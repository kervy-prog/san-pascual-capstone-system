import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AdminRequest = Request & { adminId?: string };

export function requireAdmin(request: AdminRequest, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: "Admin authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & { role?: string };
    if (payload.role !== "ADMIN" || typeof payload.sub !== "string") {
      response.status(403).json({ error: "Admin access only" });
      return;
    }
    request.adminId = payload.sub;
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired admin session" });
  }
}
