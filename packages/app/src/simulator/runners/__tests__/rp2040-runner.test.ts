import { describe, expect, test } from "bun:test";
import { PinStateStore } from "../../pin-state-store";
import { bindRp2040ExternalPinSink } from "../rp2040-runner";

describe("bindRp2040ExternalPinSink", () => {
  test("forwards writeExternal digital values into RP2040 GPIO inputs", () => {
    const store = new PinStateStore();
    const inputLevels: boolean[] = [];
    const chip = {
      gpio: [
        {
          setInputValue(value: boolean) {
            inputLevels.push(value);
          },
        },
      ],
    };

    bindRp2040ExternalPinSink(store, chip);
    store.writeFromSketch(0, { mode: "INPUT" });
    store.writeExternal(0, { digitalValue: 1 });
    store.writeExternal(0, { digitalValue: 0 });

    expect(inputLevels).toEqual([true, false]);
  });

  test("does not forward external writes when pin is OUTPUT", () => {
    const store = new PinStateStore();
    const inputLevels: boolean[] = [];
    const chip = {
      gpio: [
        {
          setInputValue(value: boolean) {
            inputLevels.push(value);
          },
        },
      ],
    };

    bindRp2040ExternalPinSink(store, chip);
    store.writeFromSketch(0, { mode: "OUTPUT", digitalValue: 0 });
    store.writeExternal(0, { digitalValue: 1 });

    expect(inputLevels).toHaveLength(0);
  });
});
