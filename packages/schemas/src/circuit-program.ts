import { z } from "zod";
import { boardTargetSchema, DEFAULT_BOARD_TARGET, type BoardTarget } from "./board-targets";
import { parseArduinoPinToken, isArduinoSignalPin } from "./board-pins";
import {
  DIAGRAM_SCHEMA_V1,
  type DreamerDiagram,
  type DiagramComponent,
  type DiagramWire,
} from "./design";
import { resolveComponentPin } from "./component-pins";

const CIRCUIT_MODULE_TYPES = [
  "led",
  "rgb_led",
  "button",
  "resistor",
  "capacitor",
  "ic",
  "potentiometer",
  "buzzer",
  "servo",
  "lcd_16x2",
  "seven_segment",
  "photoresistor",
  "temperature_sensor",
  "ultrasonic_sensor",
  "neopixel",
  "pir_sensor",
  "relay",
  "dc_motor",
  "dht_sensor",
  "ir_receiver",
  "shift_register",
  "oled_display",
] as const;

export const circuitModuleTypeSchema = z.enum(CIRCUIT_MODULE_TYPES);
export type CircuitModuleType = z.infer<typeof circuitModuleTypeSchema>;

export const circuitProgramModeSchema = z.enum(["build", "edit", "debug"]);
export type CircuitProgramMode = z.infer<typeof circuitProgramModeSchema>;

export const pinIntentRoleSchema = z.enum([
  "signal_input",
  "signal_output",
  "reference_power",
  "reference_ground",
  "passive_series",
]);
export type PinIntentRole = z.infer<typeof pinIntentRoleSchema>;

export const pinIntentSchema = z.object({
  role: pinIntentRoleSchema,
  arduinoPin: z.string().min(1).optional(),
  net: z.string().min(1).optional(),
});
export type PinIntent = z.infer<typeof pinIntentSchema>;

export const circuitModuleSchema = z.object({
  id: z.string().min(1),
  type: circuitModuleTypeSchema,
  role: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).optional(),
  pins: z.record(z.string(), pinIntentSchema),
});
export type CircuitModule = z.infer<typeof circuitModuleSchema>;

const moduleMemberSchema = z.object({
  moduleId: z.string().min(1),
  pin: z.string().min(1),
});

const arduinoMemberSchema = z.object({
  arduinoPin: z.string().min(1),
});

export const netMemberSchema = z.union([moduleMemberSchema, arduinoMemberSchema]);
export type NetMember = z.infer<typeof netMemberSchema>;

export const netConstraintSchema = z.enum([
  "rail_distribute",
  "single_source",
  "pwm_capable_pin",
  "analog_capable_pin",
  "servo_pulse",
  "ws2812_timing",
  "i2c_bus",
]);
export type NetConstraint = z.infer<typeof netConstraintSchema>;

export const netSpecSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["signal", "power", "ground", "protocol"]),
  members: z.array(netMemberSchema).min(2),
  constraints: z.array(netConstraintSchema).optional(),
});
export type NetSpec = z.infer<typeof netSpecSchema>;

const layoutGroupingSchema = z.object({
  id: z.string().min(1),
  moduleIds: z.array(z.string().min(1)).min(1),
});

export const layoutIntentSchema = z.object({
  strategy: z.enum(["auto", "compact", "debuggable"]).default("auto"),
  preserveModules: z.array(z.string().min(1)).optional(),
  groupings: z.array(layoutGroupingSchema).optional(),
});
export type LayoutIntent = z.infer<typeof layoutIntentSchema>;

export const sketchIntentSchema = z.object({
  code: z.string(),
  libraries: z.array(z.string().min(1)).optional(),
  behaviors: z.array(z.string().min(1)).default([]),
  pinClaims: z.array(z.string().min(1)).default([]),
});
export type SketchIntent = z.infer<typeof sketchIntentSchema>;

const circuitProgramBodySchema = z.object({
  modules: z.array(circuitModuleSchema).default([]),
  nets: z.array(netSpecSchema).default([]),
  layout: layoutIntentSchema.default({ strategy: "auto" }),
  sketch: sketchIntentSchema,
});

export const labelSpecSchema = z.object({
  target: z.string().min(1),
  label: z.string().min(1),
  aliases: z.array(z.string().min(1)).optional(),
});
export type LabelSpec = z.infer<typeof labelSpecSchema>;

export const componentProfileRefSchema = z.object({
  moduleId: z.string().min(1),
  profile: z.string().min(1),
});
export type ComponentProfileRef = z.infer<typeof componentProfileRefSchema>;

export const exampleProfileRefSchema = z.object({
  moduleId: z.string().min(1).optional(),
  example: z.string().min(1),
});
export type ExampleProfileRef = z.infer<typeof exampleProfileRefSchema>;

export const behaviorContractSchema = z.object({
  moduleId: z.string().min(1),
  runtime: z.enum(["digital", "analog", "pwm", "servo_pulse", "ws2812", "i2c"]),
  inspectorFields: z.array(z.string().min(1)),
  animationModel: z.string().min(1).optional(),
});
export type BehaviorContract = z.infer<typeof behaviorContractSchema>;

export const circuitProgramSchema = z.object({
  version: z.literal("circuit-program-v1"),
  board: boardTargetSchema.default(DEFAULT_BOARD_TARGET),
  mode: circuitProgramModeSchema.default("build"),
  program: circuitProgramBodySchema,
  words: z.object({
    labels: z.array(labelSpecSchema).default([]),
    userTerms: z.array(z.string().min(1)).default([]),
    editHandles: z.array(z.string().min(1)).default([]),
  }),
  profiles: z.object({
    components: z.array(componentProfileRefSchema).default([]),
    examples: z.array(exampleProfileRefSchema).default([]),
    behaviors: z.array(behaviorContractSchema).default([]),
  }),
});
export type CircuitProgram = z.infer<typeof circuitProgramSchema>;

export const circuitProgramTemplateSchema = z.object({
  board: boardTargetSchema.default(DEFAULT_BOARD_TARGET),
  mode: circuitProgramModeSchema.default("build"),
  program: z.object({
    modules: z.array(circuitModuleSchema).default([]),
    nets: z.array(netSpecSchema).optional(),
    layout: layoutIntentSchema.default({ strategy: "auto" }),
    sketch: sketchIntentSchema,
  }),
  words: z.object({
    labels: z.array(labelSpecSchema).optional(),
    userTerms: z.array(z.string().min(1)).optional(),
    editHandles: z.array(z.string().min(1)).optional(),
  }).optional(),
  profiles: z.object({
    components: z.array(componentProfileRefSchema).optional(),
    examples: z.array(exampleProfileRefSchema).optional(),
    behaviors: z.array(behaviorContractSchema).optional(),
  }).optional(),
});
export type CircuitProgramTemplate = z.infer<typeof circuitProgramTemplateSchema>;

export type CircuitProgramIssue = {
  path: string;
  message: string;
  severity: "error" | "warning";
};

export type CircuitProgramValidation = {
  ok: boolean;
  program?: CircuitProgram;
  errors: CircuitProgramIssue[];
  warnings: CircuitProgramIssue[];
};

export type CircuitProgramCompileResult = {
  ok: boolean;
  program?: CircuitProgram;
  diagram?: DreamerDiagram;
  runtimeContracts?: BehaviorContract[];
  errors: CircuitProgramIssue[];
  warnings: CircuitProgramIssue[];
};

function isArduinoMember(member: NetMember): member is z.infer<typeof arduinoMemberSchema> {
  return "arduinoPin" in member;
}

function isModuleMember(member: NetMember): member is z.infer<typeof moduleMemberSchema> {
  return "moduleId" in member;
}

function parseProgramPinToken(token: string, board: BoardTarget): number | null {
  const upper = token.trim().toUpperCase();
  if (upper === "GND") return -3;
  if (upper === "5V") return -1;
  if (upper === "5V2") return -12;
  if (upper === "3V3") return -2;
  return parseArduinoPinToken(token, board);
}

function arduinoEndpointFromToken(token: string, board: BoardTarget): string | null {
  const parsed = parseProgramPinToken(token, board);
  if (parsed === -3) return "arduino.GND";
  if (parsed === -2) return "arduino.3V3";
  if (parsed === -1 || parsed === -12) return "arduino.5V";
  if (parsed == null) return null;
  return parsed >= 14 ? `arduino.A${parsed - 14}` : `arduino.${parsed}`;
}

function inferNetKindFromRole(role: PinIntentRole): NetSpec["kind"] {
  if (role === "reference_ground") return "ground";
  if (role === "reference_power") return "power";
  return "signal";
}

function defaultBehaviorForModule(module: CircuitModule): BehaviorContract {
  switch (module.type) {
    case "potentiometer":
    case "photoresistor":
    case "temperature_sensor":
      return { moduleId: module.id, runtime: "analog", inspectorFields: ["analogValue"], animationModel: "steady_led" };
    case "servo":
      return { moduleId: module.id, runtime: "servo_pulse", inspectorFields: ["angle", "pulse_us"], animationModel: "servo_arm" };
    case "neopixel":
      return { moduleId: module.id, runtime: "ws2812", inspectorFields: ["pixels", "brightness"], animationModel: "neopixel_strip" };
    case "rgb_led":
      return { moduleId: module.id, runtime: "pwm", inspectorFields: ["red", "green", "blue"], animationModel: "realistic_led_rgb" };
    case "oled_display":
      return { moduleId: module.id, runtime: "i2c", inspectorFields: ["textBuffer"], animationModel: "display_buffer" };
    case "led":
      return { moduleId: module.id, runtime: "digital", inspectorFields: ["brightness"], animationModel: "realistic_led" };
    default:
      return { moduleId: module.id, runtime: "digital", inspectorFields: ["pinState"] };
  }
}

function defaultExampleForModule(module: CircuitModule): ExampleProfileRef | null {
  switch (module.type) {
    case "servo":
      return { moduleId: module.id, example: "servo-sweep" };
    case "neopixel":
      return { moduleId: module.id, example: "neopixel-rainbow" };
    case "potentiometer":
      return { moduleId: module.id, example: "pot-read" };
    case "rgb_led":
      return { moduleId: module.id, example: "rgb-fade" };
    default:
      return null;
  }
}

function componentHeight(type: CircuitModuleType): number {
  if (type === "led" || type === "rgb_led") return 2;
  if (
    type === "servo" ||
    type === "potentiometer" ||
    type === "temperature_sensor" ||
    type === "capacitor"
  ) return 3;
  if (type === "button") return 2;
  if (type === "resistor") return 1;
  if (type === "seven_segment") return 9;
  if (type === "lcd_16x2") return 12;
  return 1;
}

function componentCol(type: CircuitModuleType): number {
  if (type === "button" || type === "resistor") return 3;
  if (type === "seven_segment" || type === "lcd_16x2") return 5;
  return 2;
}

function defaultColorForKind(kind: NetSpec["kind"], index: number): string {
  if (kind === "power") return "#ef4444";
  if (kind === "ground") return "#1e293b";
  const signalPalette = ["#eab308", "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#06b6d4"];
  return signalPalette[index % signalPalette.length] ?? "#22c55e";
}

export function generateCircuitProgram(input: unknown): CircuitProgram {
  const template = circuitProgramTemplateSchema.parse(input);
  const modules = template.program.modules;
  const derivedNets = new Map<string, NetSpec>();

  if (!template.program.nets || template.program.nets.length === 0) {
    for (const module of modules) {
      for (const [pinName, pin] of Object.entries(module.pins)) {
        const netId = pin.net ?? `${module.id}.${pinName}`;
        if (!derivedNets.has(netId)) {
          derivedNets.set(netId, {
            id: netId,
            kind: inferNetKindFromRole(pin.role),
            members: [],
          });
        }
        const net = derivedNets.get(netId)!;
        net.members.push({ moduleId: module.id, pin: pinName });
        if (pin.arduinoPin) {
          net.members.push({ arduinoPin: pin.arduinoPin });
        }
      }
    }
  }

  const labels = template.words?.labels ?? modules.map((module) => ({
    target: module.id,
    label: module.role.replace(/_/g, " "),
    aliases: [module.id],
  }));
  const editHandles = template.words?.editHandles ?? Array.from(
    new Set(modules.flatMap((module) => [module.id, module.role])),
  );
  const componentProfiles = template.profiles?.components ?? modules.map((module) => ({
    moduleId: module.id,
    profile: `${module.type}/default`,
  }));
  const exampleProfiles = template.profiles?.examples ?? modules
    .map(defaultExampleForModule)
    .filter((value): value is ExampleProfileRef => value != null);
  const behaviors = template.profiles?.behaviors ?? modules.map(defaultBehaviorForModule);

  return circuitProgramSchema.parse({
    version: "circuit-program-v1",
    board: template.board,
    mode: template.mode,
    program: {
      modules,
      nets: template.program.nets ?? Array.from(derivedNets.values()),
      layout: template.program.layout,
      sketch: template.program.sketch,
    },
    words: {
      labels,
      userTerms: template.words?.userTerms ?? [],
      editHandles,
    },
    profiles: {
      components: componentProfiles,
      examples: exampleProfiles,
      behaviors,
    },
  });
}

export function validateCircuitProgram(input: unknown): CircuitProgramValidation {
  let program: CircuitProgram;
  try {
    program = circuitProgramSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        severity: "error" as const,
      }));
      return { ok: false, errors: issues, warnings: [] };
    }
    throw error;
  }

  const errors: CircuitProgramIssue[] = [];
  const warnings: CircuitProgramIssue[] = [];
  const moduleMap = new Map(program.program.modules.map((module) => [module.id, module]));
  const usedModulePins = new Set<string>();

  for (const module of program.program.modules) {
    for (const [pinName, pin] of Object.entries(module.pins)) {
      const key = `${module.id}.${pinName}`;
      if (pin.arduinoPin && parseProgramPinToken(pin.arduinoPin, program.board) == null) {
        errors.push({
          path: `program.modules.${module.id}.pins.${pinName}.arduinoPin`,
          message: `Unknown Arduino pin token "${pin.arduinoPin}".`,
          severity: "error",
        });
      }
      if (pin.role === "signal_input" && pin.arduinoPin) {
        const parsed = parseProgramPinToken(pin.arduinoPin, program.board);
        if (parsed != null && parsed >= 0 && !program.program.sketch.pinClaims.includes(pin.arduinoPin)) {
          warnings.push({
            path: `program.sketch.pinClaims`,
            message: `Pin claim list does not mention ${pin.arduinoPin} used by ${key}.`,
            severity: "warning",
          });
        }
      }
    }
  }

  for (const net of program.program.nets) {
    const arduinoMembers = net.members.filter(isArduinoMember);
    const moduleMembers = net.members.filter(isModuleMember);

    if (arduinoMembers.length === 0) {
      warnings.push({
        path: `program.nets.${net.id}`,
        message: "Net has no Arduino source member; compiler will emit only component-to-component wiring.",
        severity: "warning",
      });
    }

    for (const member of arduinoMembers) {
      if (parseProgramPinToken(member.arduinoPin, program.board) == null) {
        errors.push({
          path: `program.nets.${net.id}.members`,
          message: `Unknown Arduino pin token "${member.arduinoPin}".`,
          severity: "error",
        });
      }
    }

    for (const member of moduleMembers) {
      const module = moduleMap.get(member.moduleId);
      if (!module) {
        errors.push({
          path: `program.nets.${net.id}.members`,
          message: `Unknown module "${member.moduleId}".`,
          severity: "error",
        });
        continue;
      }
      if (!(member.pin in module.pins)) {
        errors.push({
          path: `program.nets.${net.id}.members`,
          message: `Module "${member.moduleId}" does not expose pin "${member.pin}".`,
          severity: "error",
        });
        continue;
      }
      const pinKey = `${member.moduleId}.${member.pin}`;
      if (usedModulePins.has(pinKey)) {
        errors.push({
          path: `program.nets.${net.id}.members`,
          message: `Pin "${pinKey}" is already assigned to another net.`,
          severity: "error",
        });
        continue;
      }
      usedModulePins.add(pinKey);
    }

    if ((net.constraints ?? []).includes("analog_capable_pin")) {
      for (const member of arduinoMembers) {
        const parsed = parseProgramPinToken(member.arduinoPin, program.board);
        if (parsed == null || parsed < 14) {
          errors.push({
            path: `program.nets.${net.id}.constraints`,
            message: `Constraint analog_capable_pin requires an analog pin, got "${member.arduinoPin}".`,
            severity: "error",
          });
        }
      }
    }
    if ((net.constraints ?? []).includes("pwm_capable_pin")) {
      for (const member of arduinoMembers) {
        const parsed = parseProgramPinToken(member.arduinoPin, program.board);
        if (parsed != null && ![3, 5, 6, 9, 10, 11].includes(parsed)) {
          errors.push({
            path: `program.nets.${net.id}.constraints`,
            message: `Constraint pwm_capable_pin requires a PWM-capable pin, got "${member.arduinoPin}".`,
            severity: "error",
          });
        }
      }
    }
    if ((net.constraints ?? []).includes("single_source") && arduinoMembers.length !== 1) {
      errors.push({
        path: `program.nets.${net.id}.members`,
        message: "Constraint single_source requires exactly one Arduino source member.",
        severity: "error",
      });
    }
  }

  for (const module of program.program.modules) {
    for (const pinName of Object.keys(module.pins)) {
      const key = `${module.id}.${pinName}`;
      if (!usedModulePins.has(key)) {
        warnings.push({
          path: `program.modules.${module.id}.pins.${pinName}`,
          message: `Pin "${key}" is not referenced by any net.`,
          severity: "warning",
        });
      }
    }
  }

  for (const behavior of program.profiles.behaviors) {
    if (!moduleMap.has(behavior.moduleId)) {
      errors.push({
        path: `profiles.behaviors.${behavior.moduleId}`,
        message: `Behavior contract references unknown module "${behavior.moduleId}".`,
        severity: "error",
      });
    }
    if (
      behavior.runtime === "servo_pulse" &&
      !program.program.sketch.libraries?.includes("Servo.h")
    ) {
      warnings.push({
        path: "program.sketch.libraries",
        message: `Servo runtime on "${behavior.moduleId}" should usually include Servo.h.`,
        severity: "warning",
      });
    }
    if (
      behavior.runtime === "ws2812" &&
      !program.program.sketch.libraries?.some((library) => /neopixel/i.test(library))
    ) {
      warnings.push({
        path: "program.sketch.libraries",
        message: `WS2812 runtime on "${behavior.moduleId}" should usually include a NeoPixel library.`,
        severity: "warning",
      });
    }
  }

  return {
    ok: errors.length === 0,
    program,
    errors,
    warnings,
  };
}

export function compileCircuitProgram(input: unknown): CircuitProgramCompileResult {
  const validation = validateCircuitProgram(input);
  if (!validation.ok || !validation.program) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const program = validation.program;
  const placement = new Map<string, { row: number; col: number; type: CircuitModuleType }>();
  const components: DiagramComponent[] = [];
  const wires: DiagramWire[] = [];
  let nextRow = 0;
  const ROW_GAP = 2;

  for (const module of program.program.modules) {
    const row = nextRow;
    const col = componentCol(module.type);
    placement.set(module.id, { row, col, type: module.type });
    components.push({
      id: module.id,
      type: module.type,
      at: [row, col],
      rotation: 0,
      name: module.role,
      properties: module.properties ?? {},
    });
    nextRow += componentHeight(module.type) + ROW_GAP;
  }

  const warnings = [...validation.warnings];
  const errors: CircuitProgramIssue[] = [];

  program.program.nets.forEach((net, index) => {
    const arduinoMembers = net.members.filter(isArduinoMember);
    const moduleMembers = net.members.filter(isModuleMember);
    const color = defaultColorForKind(net.kind, index);

    if ((net.kind === "ground" || net.kind === "power") && arduinoMembers.length > 0) {
      const source = arduinoEndpointFromToken(arduinoMembers[0]!.arduinoPin, program.board);
      if (!source) {
        errors.push({
          path: `program.nets.${net.id}.members`,
          message: `Unable to compile Arduino source "${arduinoMembers[0]!.arduinoPin}".`,
          severity: "error",
        });
        return;
      }
      if (moduleMembers.length <= 1) {
        for (const member of moduleMembers) {
          wires.push({
            from: source,
            to: `${member.moduleId}.${member.pin}`,
            color,
          });
        }
        return;
      }

      // Left rail pair polarity: −1 (inner) is the + rail, −2 (outer edge)
      // the − rail — matching isPositiveRailCol and the board silkscreen.
      const railCol = net.kind === "ground" ? -2 : -1;
      wires.push({
        from: source,
        to: `grid.0,${railCol}`,
        color,
      });

      for (const member of moduleMembers) {
        const pos = placement.get(member.moduleId);
        if (!pos) continue;
        const pinPoint = resolveComponentPin(pos.type, pos.row, pos.col, member.pin);
        const branchStart = pinPoint ? `grid.${pinPoint.row},${railCol}` : `grid.0,${railCol}`;
        wires.push({
          from: branchStart,
          to: `${member.moduleId}.${member.pin}`,
          color,
        });
      }
      return;
    }

    if (arduinoMembers.length > 0) {
      const source = arduinoEndpointFromToken(arduinoMembers[0]!.arduinoPin, program.board);
      if (!source) {
        errors.push({
          path: `program.nets.${net.id}.members`,
          message: `Unable to compile Arduino source "${arduinoMembers[0]!.arduinoPin}".`,
          severity: "error",
        });
        return;
      }
      if (moduleMembers.length > 1) {
        warnings.push({
          path: `program.nets.${net.id}`,
          message: "Signal net fans out to multiple module pins; compiler will emit one wire per target.",
          severity: "warning",
        });
      }
      for (const member of moduleMembers) {
        wires.push({
          from: source,
          to: `${member.moduleId}.${member.pin}`,
          color,
        });
      }
      return;
    }

    if (moduleMembers.length >= 2) {
      const [first, ...rest] = moduleMembers;
      for (const member of rest) {
        wires.push({
          from: `${first!.moduleId}.${first!.pin}`,
          to: `${member.moduleId}.${member.pin}`,
          color,
        });
      }
    }
  });

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings,
    };
  }

  return {
    ok: true,
    program,
    diagram: {
      $schema: DIAGRAM_SCHEMA_V1,
      board: program.board,
      sketch: program.program.sketch.code,
      components,
      wires,
      customLibraries: [],
    },
    runtimeContracts: program.profiles.behaviors,
    errors: [],
    warnings,
  };
}
