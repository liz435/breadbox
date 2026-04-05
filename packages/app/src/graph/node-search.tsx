import { useState, useCallback, useEffect, useRef } from "react";
import type { GraphNodeType } from "@dreamer/schemas";
import { getNodeColor } from "./port-colors";
import { cn } from "@/utils/classnames";

type NodeSearchProps = {
  onSelect: (type: GraphNodeType) => void;
  onClose: () => void;
};

const ALL_NODE_TYPES: { type: GraphNodeType; label: string; keywords: string }[] = [
  { type: "setup", label: "Setup", keywords: "init begin start once" },
  { type: "loop", label: "Loop", keywords: "repeat tick update cycle" },
  { type: "digital_write", label: "Digital Write", keywords: "pin output high low led" },
  { type: "digital_read", label: "Digital Read", keywords: "pin input button sensor" },
  { type: "pin_mode", label: "Pin Mode", keywords: "input output pullup configure" },
  { type: "analog_write", label: "Analog Write", keywords: "pwm led fade output" },
  { type: "analog_read", label: "Analog Read", keywords: "sensor adc input potentiometer" },
  { type: "delay", label: "Delay", keywords: "wait pause milliseconds time" },
  { type: "millis", label: "Millis", keywords: "time milliseconds clock uptime" },
  { type: "micros", label: "Micros", keywords: "time microseconds clock precision" },
  { type: "serial_begin", label: "Serial Begin", keywords: "uart baud rate communication" },
  { type: "serial_print", label: "Serial Print", keywords: "uart debug log output message" },
  { type: "serial_read", label: "Serial Read", keywords: "uart input receive data" },
  { type: "if_else", label: "If / Else", keywords: "condition branch logic control" },
  { type: "comparison", label: "Comparison", keywords: "equal greater less than compare" },
  { type: "logic_gate", label: "Logic Gate", keywords: "and or not boolean" },
  { type: "math", label: "Math", keywords: "add subtract multiply divide number" },
  { type: "map_value", label: "Map Value", keywords: "scale range remap convert" },
  { type: "constrain", label: "Constrain", keywords: "clamp limit bound range" },
  { type: "variable", label: "Variable", keywords: "store data state memory" },
  { type: "constant", label: "Constant", keywords: "value literal fixed number" },
  { type: "servo_write", label: "Servo Write", keywords: "motor angle position actuator" },
  { type: "tone", label: "Tone", keywords: "buzzer sound frequency speaker" },
  { type: "lcd_print", label: "LCD Print", keywords: "display screen text i2c" },
  { type: "code_block", label: "Code Block", keywords: "custom cpp arduino sketch" },
];

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  // Simple character-by-character fuzzy
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function NodeSearch({ onSelect, onClose }: NodeSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? ALL_NODE_TYPES.filter(
        (n) =>
          fuzzyMatch(query, n.label) ||
          fuzzyMatch(query, n.type) ||
          fuzzyMatch(query, n.keywords)
      )
    : ALL_NODE_TYPES;

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].type);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, onSelect, onClose]
  );

  // Stop wheel events from reaching the canvas pan/zoom handler
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.stopPropagation();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  return (
    <div ref={rootRef} className="w-64 bg-neutral-800 border border-neutral-600 rounded-lg shadow-2xl overflow-hidden">
      <div className="p-2">
        <input
          ref={inputRef}
          className="w-full bg-neutral-900 text-sm text-neutral-200 px-3 py-1.5 rounded border border-neutral-700 outline-none focus:border-neutral-500 placeholder:text-neutral-500"
          placeholder="Search nodes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div ref={listRef} className="max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-neutral-500">
            No matching nodes
          </div>
        ) : (
          filtered.map((item, idx) => (
            <button
              key={item.type}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors",
                idx === selectedIndex
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-300 hover:bg-neutral-700/50"
              )}
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => onSelect(item.type)}
            >
              <span
                className="w-2.5 h-2.5 rounded flex-shrink-0"
                style={{ backgroundColor: getNodeColor(item.type) }}
              />
              {item.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
