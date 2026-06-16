import { useCallback } from "react";
import type { Port } from "@dreamer/schemas";
import { cn } from "@/utils/classnames";
import { getPortColor } from "./port-colors";
import { graphInteractionActor } from "./graph-interaction-machine";

type GraphPortProps = {
  port: Port;
  nodeId: string;
  onConnectionStart?: (nodeId: string, portId: string) => void;
};

export function GraphPort({ port, nodeId, onConnectionStart }: GraphPortProps) {
  const color = getPortColor(port.dataType);
  const isInput = port.direction === "in";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      graphInteractionActor.send({
        type: "START_CONNECT",
        portNodeId: nodeId,
        portId: port.id,
      });
      onConnectionStart?.(nodeId, port.id);
    },
    [nodeId, port.id, onConnectionStart]
  );

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-0.5",
        isInput ? "flex-row" : "flex-row-reverse"
      )}
    >
      <button
        data-port-id={port.id}
        data-port-node-id={nodeId}
        data-port-direction={port.direction}
        data-port-data-type={port.dataType}
        className="w-3 h-3 rounded-full border-2 shrink-0 hover:scale-125 transition-transform cursor-crosshair"
        style={{
          borderColor: color,
          backgroundColor: "transparent",
        }}
        onMouseDown={handleMouseDown}
      />
      <span className="text-[10px] text-muted-foreground select-none truncate">
        {port.name}
      </span>
    </div>
  );
}
