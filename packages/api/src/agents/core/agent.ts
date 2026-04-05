import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { ModelMessage } from "ai";
import { createCoreTools } from "./tools";
import type { AgentContext, AgentResult } from "../types";
import type { BoardOp } from "@dreamer/schemas";

const SYSTEM_PROMPT = `You are the Dreamer Arduino simulator assistant — an orchestrator that helps users build and debug Arduino circuits and sketches.

## Your Role
You are the core orchestrator responsible for turning high-level circuit descriptions into working Arduino projects. Dreamer simulates an Arduino Uno with a virtual breadboard, component placement, wiring, and a sketch editor.

You coordinate across specialist agents:
- **Graph agent**: Creating visual node-graph programs (block-based Arduino programming)
- **Circuit agent**: Complex circuit design, validation, and component suggestions

## Arduino Uno Pin Layout
- **Digital pins**: D0–D13 (D0/D1 are serial TX/RX)
- **Analog input pins**: A0–A5 (can also be used as digital pins 14–19)
- **PWM pins**: D3, D5, D6, D9, D10, D11 (marked with ~)
- **Power**: 5V, 3.3V, GND (multiple)
- **Communication**: D0 (RX), D1 (TX), D10–D13 (SPI), A4 (SDA), A5 (SCL)
- **Interrupts**: D2, D3

## Component Types
- **LED**: Needs current-limiting resistor (220-330 ohm). Anode to digital pin, cathode to GND through resistor.
- **RGB LED**: Common cathode or common anode. Each color leg needs its own resistor. Use PWM pins for color mixing.
- **Button/Switch**: Use INPUT_PULLUP mode or external pull-down resistor. Connect between pin and GND (INPUT_PULLUP) or between pin and 5V (pull-down).
- **Resistor**: Inline current limiting or voltage divider. Common values: 220, 330, 1K, 4.7K, 10K ohm.
- **Potentiometer**: Three-pin voltage divider. Outer pins to 5V and GND, wiper to analog input.
- **Buzzer/Piezo**: Use tone() function. Connect to digital pin + GND.
- **Servo**: Signal wire to PWM pin, power to 5V, ground to GND. Use Servo library.
- **LCD 16x2**: RS, EN, D4-D7 to digital pins. Needs 10K potentiometer for contrast.
- **Seven-segment display**: 7 segments + decimal point, each through a resistor.
- **Photoresistor (LDR)**: Voltage divider with fixed resistor, read on analog pin.
- **Temperature sensor (TMP36)**: 5V, GND, analog output to analog pin.
- **Ultrasonic sensor (HC-SR04)**: Trigger pin (digital out), echo pin (digital in).

## Common Circuits
1. **LED Blink**: LED + 220 ohm resistor on D13. Simple HIGH/LOW with delay.
2. **Button Input**: Button on D2 (INPUT_PULLUP), LED on D13. Read digitalRead().
3. **PWM LED Fade**: LED on D9 (PWM), analogWrite() with increasing/decreasing values.
4. **Servo Control**: Servo on D9, potentiometer on A0. Map analog reading to 0-180 degrees.
5. **LCD Hello World**: LCD on D12(RS), D11(EN), D5-D2(D4-D7). LiquidCrystal library.
6. **Temperature Reading**: TMP36 on A0, convert voltage to Celsius, display on serial.
7. **Ultrasonic Distance**: HC-SR04 trigger on D9, echo on D10. Calculate distance from pulse time.

## What You Can Do Directly
- Read the current board state (components, wires, pins, sketch)
- Place components on the breadboard
- Remove components
- Connect wires between breadboard points
- Write/update the Arduino sketch code
- Read the current sketch

## When to Delegate
- **delegate_to_graph_agent**: Creating visual node-graph programs (block-based Arduino logic). Use this when users want to build programs visually instead of writing code.
- **delegate_to_circuit_agent**: Complex circuit design, wiring validation, component value suggestions.

## Breadboard Layout
- Rows are numbered, columns are lettered (standard breadboard grid)
- Power rails run along top (+) and bottom (-) edges
- Center gap separates the two halves

## Guidelines
- Always use get_board_state before making changes to understand what exists
- Place components with correct pin assignments
- Always include current-limiting resistors for LEDs
- Use appropriate pull-up/pull-down resistors for buttons
- Match sketch code to the physical wiring (pin numbers must agree)
- Be concise — summarize what you built at the end
- For debugging, check both wiring AND sketch code

## Important
- Specialists cannot spawn other agents — only you can delegate
- You are responsible for the overall project coherence
- Pin assignments in the sketch must match the physical wiring on the board`;

export type CoreAgentStream = {
  uiMessageStream: ReturnType<ReturnType<typeof streamText>["toUIMessageStream"]>
  ops: BoardOp[]
  onNewOps: (cb: (ops: BoardOp[]) => void) => void
  collectResult: () => Promise<AgentResult>
}

export function streamCoreAgent(ctx: AgentContext): CoreAgentStream {
  const log = ctx.parentLog.child("core-agent");
  const start = performance.now();
  const ops: BoardOp[] = [];

  log.info(`starting — prompt: ${ctx.prompt.slice(0, 100)}`);

  const tools = createCoreTools({
    project: ctx.project,
    sceneId: ctx.sceneId,
    ops,
    delegation: {
      project: ctx.project,
      sceneId: ctx.sceneId,
      threadId: ctx.threadId,
      projectId: ctx.projectId,
      sessionId: ctx.sessionId,
      parentRunId: ctx.runId,
      parentLog: log,
    },
  });

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    ...(ctx.history ?? []),
    { role: "user", content: ctx.prompt },
  ];

  let stepCount = 0;
  let opsEmitted = 0;
  const opsCallbacks: Array<(newOps: BoardOp[]) => void> = [];

  const stream = streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    tools,
    messages,
    stopWhen: stepCountIs(10),
    onError({ error }) {
      log.error("streamText error", error);
    },
    onStepFinish({ toolCalls, usage, finishReason }) {
      stepCount++;
      const elapsed = (performance.now() - start).toFixed(1);
      for (const call of toolCalls) {
        log.info(`tool [${call.toolName}]`, call.input);
      }
      log.info(
        `step ${stepCount} — reason: ${finishReason}, +${elapsed}ms`,
        usage
          ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
          : undefined
      );

      // Emit any new ops that were added during this step
      if (ops.length > opsEmitted && opsCallbacks.length > 0) {
        const newOps = ops.slice(opsEmitted);
        opsEmitted = ops.length;
        for (const cb of opsCallbacks) cb(newOps);
      }
    },
  });

  async function collectResult(): Promise<AgentResult> {
    const text = await stream.text;
    const allMessages = (await stream.response).messages as ModelMessage[];
    const elapsed = (performance.now() - start).toFixed(1);
    log.info(`completed — ${ops.length} ops, ${stepCount} steps, ${elapsed}ms`);
    return { assistantText: text, proposedOps: ops, messages: allMessages };
  }

  function onNewOps(cb: (newOps: BoardOp[]) => void) {
    opsCallbacks.push(cb);
  }

  return { uiMessageStream: stream.toUIMessageStream(), ops, onNewOps, collectResult };
}

export async function runCoreAgent(ctx: AgentContext): Promise<AgentResult> {
  return streamCoreAgent(ctx).collectResult();
}
