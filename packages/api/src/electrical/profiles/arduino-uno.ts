import type { BoardElectricalProfile } from "@dreamer/schemas";

/**
 * Conservative limits for safe planning.
 * These are intentionally lower than absolute maximum ratings.
 */
export const ARDUINO_UNO_ELECTRICAL_PROFILE: BoardElectricalProfile = {
  boardType: "arduino_uno",
  pinCurrentLimitMa: 20,
  totalCurrentLimitMa: 200,
  railCurrentLimitsMa: {
    v5: 200,
    v3v3: 50,
  },
};

