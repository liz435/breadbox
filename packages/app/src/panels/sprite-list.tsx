import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScene } from "../store/scene-context";

export default function SpriteList() {
  const { state, send } = useScene();
  const hasSceneObjects = state.tilemap != null || state.sprites.length > 0;

  return (
    <div className="h-full bg-card flex flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        {!hasSceneObjects && (
          <div className="px-3 py-4 text-xs text-muted-foreground">No scene objects</div>
        )}

        {state.tilemap && (
          <>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors hover:bg-accent ${
                !state.selectedId ? "bg-accent" : ""
              }`}
              onClick={() => send({ type: "SELECT", id: null })}
            >
              <div className="w-4 h-4 rounded-sm shrink-0 bg-[#4a7c59] border border-border grid grid-cols-2 grid-rows-2 overflow-hidden">
                <div className="bg-[#4a7c59]" />
                <div className="bg-[#8b6914]" />
                <div className="bg-[#7f8c8d]" />
                <div className="bg-[#2980b9]" />
              </div>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                Tilemap
              </span>
              <span className="text-xs text-muted-foreground">
                {state.tilemap.width}&times;{state.tilemap.height}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  send({ type: "CLEAR_TILEMAP" });
                }}
              >
                &times;
              </Button>
            </div>
            {state.sprites.length > 0 && <Separator />}
          </>
        )}

        {state.sprites.map((sprite, i) => (
          <div key={sprite.id}>
            <div
              className={`flex items-center px-3 py-1.5 cursor-pointer text-sm transition-colors hover:bg-accent ${
                state.selectedId === sprite.id ? "bg-accent" : ""
              }`}
              onClick={() => send({ type: "SELECT", id: sprite.id })}
            >
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {sprite.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  send({ type: "REMOVE", id: sprite.id });
                }}
              >
                &times;
              </Button>
            </div>
            {i < state.sprites.length - 1 && <Separator />}
          </div>
        ))}
      </ScrollArea>

    </div>
  );
}
