export type TranspilerCapabilities = {
  supports1DArrayInit: boolean
  supports2DArrayInit: boolean
  supportsMultiline2DArrayInit: boolean
  supportsPointers: boolean
  supportsPassByReference: boolean
  supportsTemplates: boolean
  supportsNamespaces: boolean
  notes: string[]
  supportedExamples: string[]
  unsupportedExamples: string[]
}

export const TRANSPILE_CAPABILITIES: TranspilerCapabilities = {
  supports1DArrayInit: true,
  supports2DArrayInit: true,
  supportsMultiline2DArrayInit: true,
  supportsPointers: false,
  supportsPassByReference: false,
  supportsTemplates: false,
  supportsNamespaces: false,
  notes: [
    "Typed arrays are transpiled to JavaScript arrays.",
    "2D arrays require explicit brace initializers for each row.",
    "Pointer/reference semantics are intentionally unsupported.",
  ],
  supportedExamples: [
    "int arr[3] = {1, 2, 3};",
    "const int digits[10][7] = {{1,1,1,1,1,1,0},{0,1,1,0,0,0,0}};",
    "const bool grid[2][3] = {\n  {true, false, true},\n  {false, true, false}\n};",
  ],
  unsupportedExamples: [
    "int* ptr = &value;",
    "int &ref = value;",
    "template<typename T> T id(T x) { return x; }",
    "namespace foo { int x = 1; }",
  ],
}

