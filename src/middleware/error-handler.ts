import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    response.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? "Each report media file must be 4 MB or smaller, with no more than 4 MB total."
        : "Report upload is invalid or exceeds the 5-file limit.",
    });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
};
