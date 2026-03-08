import type { GraphNode, GraphNodeType } from "@dreamer/schemas";
import { SpriteContent } from "./sprite-content";
import { ShaderContent } from "./shader-content";
import { CodeContent } from "./code-content";
import { AudioContent } from "./audio-content";
import { VideoContent } from "./video-content";
import { TextContent } from "./text-content";
import { MaterialContent } from "./material-content";
import { MathContent } from "./math-content";
import { GroupContent } from "./group-content";
import { OnStartContent } from "./on-start-content";
import { OnUpdateContent } from "./on-update-content";
import { OnInputContent } from "./on-input-content";

type NodeContentProps = {
  node: GraphNode;
  onDataChange?: (nodeId: string, patch: Record<string, unknown>) => void;
};

export function NodeContent({ node, onDataChange }: NodeContentProps) {
  switch (node.type as GraphNodeType) {
    case "sprite":
      return <SpriteContent node={node} />;
    case "shader":
      return <ShaderContent node={node} onDataChange={onDataChange} />;
    case "code":
      return <CodeContent node={node} onDataChange={onDataChange} />;
    case "audio":
      return <AudioContent node={node} />;
    case "video":
      return <VideoContent node={node} />;
    case "text":
      return <TextContent node={node} onDataChange={onDataChange} />;
    case "material":
      return <MaterialContent node={node} />;
    case "math":
      return <MathContent node={node} onDataChange={onDataChange} />;
    case "group":
      return <GroupContent node={node} />;
    case "on_start":
      return <OnStartContent node={node} />;
    case "on_update":
      return <OnUpdateContent node={node} />;
    case "on_input":
      return <OnInputContent node={node} />;
  }
}
