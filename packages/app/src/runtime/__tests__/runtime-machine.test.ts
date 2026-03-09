import { describe, test, expect } from "bun:test";
import { createActor } from "xstate";
import { runtimeMachine } from "../runtime-machine";

describe("runtimeMachine", () => {
  test("starts in stopped state", () => {
    const actor = createActor(runtimeMachine).start();
    expect(actor.getSnapshot().value).toBe("stopped");
    actor.stop();
  });

  test("transitions to playing on PLAY", () => {
    const actor = createActor(runtimeMachine).start();
    actor.send({ type: "PLAY" });
    expect(actor.getSnapshot().value).toBe("playing");
    actor.stop();
  });

  test("transitions to paused on PAUSE", () => {
    const actor = createActor(runtimeMachine).start();
    actor.send({ type: "PLAY" });
    actor.send({ type: "PAUSE" });
    expect(actor.getSnapshot().value).toBe("paused");
    actor.stop();
  });

  test("resumes from paused to playing", () => {
    const actor = createActor(runtimeMachine).start();
    actor.send({ type: "PLAY" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().value).toBe("playing");
    actor.stop();
  });

  test("stops from playing", () => {
    const actor = createActor(runtimeMachine).start();
    actor.send({ type: "PLAY" });
    actor.send({ type: "STOP" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("stopped");
    expect(snap.context.elapsedMs).toBe(0);
    expect(snap.context.frameCount).toBe(0);
    actor.stop();
  });

  test("stops from paused", () => {
    const actor = createActor(runtimeMachine).start();
    actor.send({ type: "PLAY" });
    actor.send({ type: "PAUSE" });
    actor.send({ type: "STOP" });
    expect(actor.getSnapshot().value).toBe("stopped");
    actor.stop();
  });

  test("TICK updates context while playing", () => {
    const actor = createActor(runtimeMachine).start();
    actor.send({ type: "PLAY" });
    actor.send({ type: "TICK", dt: 16, now: 1000 });
    const snap = actor.getSnapshot();
    expect(snap.context.elapsedMs).toBe(16);
    expect(snap.context.frameCount).toBe(1);
    actor.stop();
  });

  test("ignores PLAY when already playing", () => {
    const actor = createActor(runtimeMachine).start();
    actor.send({ type: "PLAY" });
    actor.send({ type: "TICK", dt: 16, now: 1000 });
    // Second PLAY ignored (no transition from playing to playing)
    actor.send({ type: "PLAY" });
    expect(actor.getSnapshot().value).toBe("playing");
    actor.stop();
  });
});
