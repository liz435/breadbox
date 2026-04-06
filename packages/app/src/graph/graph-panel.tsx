import { GraphCanvas } from "./graph-canvas";
import { CodePreview } from "./code-preview";

export function GraphPanel() {
  return (
    <div className="relative w-full h-full">
      <GraphCanvas />
      <CodePreview />
    </div>
  );
}
