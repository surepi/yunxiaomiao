import { z, ZodTypeAny } from "zod";
import { badRequest } from "../errors";

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join("; ");
    throw badRequest(message, "VALIDATION_ERROR");
  }
  return result.data;
}

/** Parse and validate a numeric route id, throwing BAD_REQUEST on junk input. */
export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest("Invalid id", "BAD_ID");
  }
  return id;
}
