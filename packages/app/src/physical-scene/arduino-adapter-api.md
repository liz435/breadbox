# Arduino program driver

`arduino-adapter.ts` is independent of the physical scene schema, React, global
pin stores, and the existing simulation loop. It executes firmware with the
existing low-level `createAVRRunner`; the old JavaScript transpiler is no longer
an available execution path.

```ts
const driver = createArduinoProgramDriver(hexTextOrWordArray, {
  actuators: [
    { id: "arm", kind: "servo", pin: 9 },
    { id: "axis", kind: "stepper", stepPin: 3, directionPin: 4 },
    { id: "wheel", kind: "dc_motor", pwmPin: 5, directionPin: 6 },
  ],
  ultrasonic: [{ id: "range", triggerPin: 7, echoPin: 8 }],
})
driver.start()
const result = driver.advance(1 / 120, {
  contacts: [{ pin: 2, active: true, activeLow: true }],
  ultrasonic: [{ id: "range", distanceMeters: 0.35 }],
})
// Apply result.commands to actuator controllers, advance physics, then supply
// the resulting sensor measurements to the NEXT advance call.
driver.pause()
driver.step(1 / 120) // remains paused
driver.reset() // paused at time zero; clears feedback and pending echoes
driver.dispose() // terminal and idempotent
```

To compile source, call `compileArduinoProgramDriver(source, compiler, options)`.
The injected compiler can wrap the existing `compileSketch` with explicit
`fqbn: "arduino:avr:uno"` and custom libraries. Compilation is asynchronous;
driver creation and execution are synchronous. Compile errors reject. The
caller owns cancellation/stale-result handling while compiling.

`advance` returns requested `timeSeconds`, actual `mcuTimeSeconds`, an ordered
array of commands, and serial bytes emitted during the slice. Start/resume does
not execute setup early. Paused `advance` and zero-duration calls do nothing,
including not latching feedback. Omitted feedback fields retain their values.
Negative/nonfinite durations and slices over `maxSliceSeconds` (default 0.1s)
throw before advancing; time is never silently dropped.

Commands:

- `servo`: measured `pulseWidthUs` and `targetAngleRadians` in [0, π], using
  Arduino Servo's default 544–2400μs endpoints (configurable). Each complete
  valid pulse produces an event; retain the last target between slices.
- `stepper`: `deltaSteps` and accumulated `targetSteps`. STEP/DIR counts every
  rising edge, HIGH direction is positive, optional enable defaults active LOW.
  `stepper-coils` also supports existing four-coil Stepper library sketches:
  `pins` are ordered field phases, one field revolution is four full steps;
  angle is `targetSteps * 2π / stepsPerRevolution`. Intermediate phase changes
  can produce fractional steps. Initial energization establishes the zero field.
- `dc_motor`: signed `drive` in [-1, 1], integrated from every output edge over
  this MCU slice. HIGH direction is positive; absent direction means positive.
  This is drive duty, not rotor speed, torque, voltage, or back EMF.

Limits: only the 16MHz ATmega328P/Uno pin map (0–19) is supported. HEX cannot
identify its target, so the caller must select the correct compiler target;
Mega and RP2040 firmware are unsupported. Instruction timing and peripheral
fidelity inherit avr8js and the existing runner. MCU endpoints may lead by one
atomic instruction, with overshoot carried across slices. Instruction stepping
prioritizes repeatability and sensor timing; realtime performance is not
guaranteed or benchmarked at the plan's full scene budget.

Ultrasonic uses the existing HC-SR04 protocol constants: ≥8μs trigger, 500μs
processing, 58μs/cm echo. Distance is supplied in metres; null or >4m produces
no echo, <2cm saturates. An in-flight echo retains the distance sampled at its
trigger. Contact debounce and geometric queries belong to the coordinator.
No electrical power/topology solver, servo detach inference, H-bridge brake
mode, additional peripheral bus devices, or mechanical inertia is modeled here.
The coordinator must clear retained actuator targets on reset and ensure only
one feedback provider and one clock own a run.
