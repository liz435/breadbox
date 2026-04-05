import React from "react";
import { BreadboardCanvas } from "./breadboard-canvas";
import { ComponentPalette } from "./component-palette";

function BreadboardPanelInner() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="w-[120px] flex-shrink-0 border-r border-neutral-700">
        <ComponentPalette />
      </div>
      <div className="flex-1">
        <BreadboardCanvas />
      </div>
    </div>
  );
}

export const BreadboardPanel = React.memo(BreadboardPanelInner);
