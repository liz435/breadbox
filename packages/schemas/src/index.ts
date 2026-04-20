export {
  nonEmptyStringSchema,
  timestampSchema,
  vec2Schema,
  sceneSettingsSchema,
  projectSchema,
  type Project,
  sceneSchema,
  type Scene,
  entitySchema,
  type Entity,
  transformComponentSchema,
  type TransformComponent,
  spriteComponentSchema,
  type SpriteComponent,
  tilemapComponentSchema,
  type TilemapComponent,
  physicsBodyKindSchema,
  physicsBodyComponentSchema,
  type PhysicsBodyComponent,
  scriptComponentSchema,
  type ScriptComponent,
  cameraComponentSchema,
  type CameraComponent,
  componentsSchema,
  type Components,
  assetTypeSchema,
  assetSchema,
  type Asset,
  projectGraphSchema,
  type ProjectGraph,
  projectFileSchema,
  type ProjectFile,
} from "./project";

export {
  opBaseSchema,
  sceneOpSchema,
  type SceneOp,
  applyOpsRequestSchema,
  type ApplyOpsRequest,
} from "./ops";

export {
  portDataTypeSchema,
  type PortDataType,
  portDirectionSchema,
  type PortDirection,
  portSchema,
  type Port,
  graphNodeTypeSchema,
  type GraphNodeType,
  graphNodeSchema,
  type GraphNode,
  edgeSchema,
  type Edge,
  graphStateSchema,
  type GraphState,
  arePortsCompatible,
  getDefaultPorts,
} from "./graph";

export {
  graphOpSchema,
  type GraphOp,
} from "./graph-ops";

// ── Arduino schemas ────────────────────────────────────────────────────────

export {
  boardTargetSchema,
  type BoardTarget,
  type BoardTargetInfo,
  type RunnerKind,
  BOARD_TARGETS,
  DEFAULT_BOARD_TARGET,
} from "./board-targets";

export {
  getBoardAnalogPins,
  getArduinoPinFromAnalogIndex,
  parseArduinoPinToken,
  isArduinoSignalPin,
  formatArduinoPin,
} from "./board-pins";

export {
  boardComponentTypeSchema,
  type BoardComponentType,
  componentTypeSchema,
  type ComponentType,
  BOARD_COMPONENT_TYPES,
  isBoardComponentType,
  pinModeSchema,
  type PinMode,
  interruptModeSchema,
  type InterruptMode,
  pinStateSchema,
  type PinState,
  servoStateSchema,
  type ServoState,
  lcdStateSchema,
  type LcdState,
  oledStateSchema,
  type OledState,
  libraryStateSchema,
  type LibraryState,
  persistedLibraryStateSchema,
  type PersistedLibraryState,
  boardComponentSchema,
  type BoardComponent,
  wireSchema,
  type Wire,
  boardStateSchema,
  type BoardState,
  customLibrarySchema,
  type CustomLibrary,
  obstacleSchema,
  type Obstacle,
  environmentSchema,
  type Environment,
  MAX_ARDUINO_PIN,
  DEFAULT_SKETCH_CODE,
  createDefaultPinStates,
  createDefaultBoardState,
} from "./arduino";

export {
  arduinoNodeTypeSchema,
  type ArduinoNodeType,
  arduinoPortDataTypeSchema,
  type ArduinoPortDataType,
} from "./arduino-graph";

export {
  boardOpBaseSchema,
  boardOpSchema,
  type BoardOp,
  applyBoardOpsRequestSchema,
  type ApplyBoardOpsRequest,
} from "./board-ops";

export {
  voltageRangeSchema,
  type VoltageRange,
  boardElectricalProfileSchema,
  type BoardElectricalProfile,
  componentElectricalProfileSchema,
  type ComponentElectricalProfile,
  pinLoadSchema,
  type PinLoad,
  railLoadSchema,
  type RailLoad,
  powerIssueSeveritySchema,
  type PowerIssueSeverity,
  powerIssueSchema,
  type PowerIssue,
  powerRecommendationSchema,
  type PowerRecommendation,
  powerBudgetReportSchema,
  type PowerBudgetReport,
} from "./electrical";

export {
  type PinPoint,
  type ComponentPinMap,
  getComponentPinNames,
  resolveComponentPins,
  resolveComponentPin,
} from "./component-pins";

// ── Diagram DSL (interchange format) ───────────────────────────────────────

export {
  DIAGRAM_SCHEMA_V1,
  diagramSchema,
  diagramToolInputSchema,
  withDiagramSchemaVersion,
  diagramComponentSchema,
  diagramWireSchema,
  diagramObstacleSchema,
  diagramEnvironmentSchema,
  diagramCustomLibrarySchema,
  type DreamerDiagram,
  type DreamerDiagramInput,
  type DiagramToolInput,
  type DiagramComponent,
  type DiagramWire,
  type DiagramObstacle,
  type DiagramEnvironment,
  type DiagramCustomLibrary,
} from "./design";

export {
  diagramToBoardState,
  boardStateToDiagram,
  type DiagramParseResult,
  type DiagramError,
} from "./diagram-adapter";

export {
  validateDiagram,
  type DiagramValidation,
  type DiagramIssue,
  type DiagramIssueSeverity,
  type DiagramIssueCategory,
  type DiagramIssueCode,
} from "./diagram-validator";

export {
  encodeDiagramForUrl,
  decodeDiagramFromUrl,
  type DecodeResult,
} from "./diagram-url";
