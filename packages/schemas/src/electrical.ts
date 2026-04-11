import { z } from "zod";

export const voltageRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});
export type VoltageRange = z.infer<typeof voltageRangeSchema>;

export const boardElectricalProfileSchema = z.object({
  boardType: z.string().min(1),
  pinCurrentLimitMa: z.number().positive(),
  totalCurrentLimitMa: z.number().positive(),
  railCurrentLimitsMa: z.object({
    v5: z.number().positive(),
    v3v3: z.number().positive(),
  }),
});
export type BoardElectricalProfile = z.infer<typeof boardElectricalProfileSchema>;

export const componentElectricalProfileSchema = z.object({
  type: z.string().min(1),
  nominalVoltage: z.number().positive().optional(),
  voltageRange: voltageRangeSchema.optional(),
  signalPinCurrentMa: z.number().nonnegative().default(0),
  typicalCurrentMa: z.number().nonnegative().default(0),
  peakCurrentMa: z.number().nonnegative().default(0),
  startupCurrentMa: z.number().nonnegative().default(0),
  mustUseExternalPower: z.boolean().default(false),
  notes: z.string().optional(),
});
export type ComponentElectricalProfile = z.infer<typeof componentElectricalProfileSchema>;

export const pinLoadSchema = z.object({
  pin: z.number().int(),
  currentMa: z.number().nonnegative(),
  connectedComponentIds: z.array(z.string()),
});
export type PinLoad = z.infer<typeof pinLoadSchema>;

export const railLoadSchema = z.object({
  rail: z.enum(["5V", "3V3", "GND", "external"]),
  currentMa: z.number().nonnegative(),
  connectedComponentIds: z.array(z.string()),
});
export type RailLoad = z.infer<typeof railLoadSchema>;

export const powerIssueSeveritySchema = z.enum(["error", "warning"]);
export type PowerIssueSeverity = z.infer<typeof powerIssueSeveritySchema>;

export const powerIssueSchema = z.object({
  severity: powerIssueSeveritySchema,
  code: z.string().min(1),
  message: z.string().min(1),
  componentId: z.string().optional(),
  pin: z.number().int().optional(),
});
export type PowerIssue = z.infer<typeof powerIssueSchema>;

export const powerRecommendationSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});
export type PowerRecommendation = z.infer<typeof powerRecommendationSchema>;

export const powerBudgetReportSchema = z.object({
  board: boardElectricalProfileSchema,
  pinLoads: z.array(pinLoadSchema),
  railLoads: z.array(railLoadSchema),
  issues: z.array(powerIssueSchema),
  recommendations: z.array(powerRecommendationSchema),
  estimatedTotalCurrentMa: z.number().nonnegative(),
});
export type PowerBudgetReport = z.infer<typeof powerBudgetReportSchema>;

