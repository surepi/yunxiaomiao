export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "BAD_REQUEST") =>
  new AppError(400, code, message);
export const unauthorized = (message: string, code = "UNAUTHORIZED") =>
  new AppError(401, code, message);
export const forbidden = (message: string, code = "FORBIDDEN") =>
  new AppError(403, code, message);
export const notFound = (message: string, code = "NOT_FOUND") =>
  new AppError(404, code, message);
export const conflict = (message: string, code = "CONFLICT") =>
  new AppError(409, code, message);
export const tooManyRequests = (message: string, code = "RATE_LIMITED") =>
  new AppError(429, code, message);
export const upstream = (message: string, code = "UPSTREAM_ERROR") =>
  new AppError(502, code, message);

/**
 * Translate a Prisma known-request error into a typed AppError. Returns null for
 * anything that is not a recognized Prisma constraint error.
 */
export function prismaError(err: unknown): AppError | null {
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") {
      if (code === "P2002") {
        return conflict("A record with the same unique value already exists", "DUPLICATE");
      }
      if (code === "P2003" || code === "P2014") {
        return conflict(
          "This record is referenced by cards, orders or instances and cannot be changed or deleted",
          "RECORD_IN_USE"
        );
      }
    }
  }
  return null;
}
