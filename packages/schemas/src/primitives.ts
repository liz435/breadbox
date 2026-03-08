import { z } from "zod";

export const nonEmptyStringSchema = z.string().min(1);
export const timestampSchema = z.string().min(1);

export const vec2Schema = z.object({
  x: z.number(),
  y: z.number(),
});
