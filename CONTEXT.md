# Breadbox domain context

Breadbox is an AI-assisted Arduino circuit builder, simulator, and physical
testbench. A **project** contains a **board**, a **sketch**, and a circuit made
of placed **components**, their **pins**, and electrically connected **nets**.

## Domain boundaries

- The board's components, pins, wires, and resolved nets are the electrical
  source of truth. Shared board-domain logic owns topology and board mutations;
  UI, API, and CLI layers adapt to it.
- A **schematic** is a rendered electrical view of the board. It must preserve
  every component pin, polarity, and net connection.
- A **breadboard** is the 2D physical-placement view of the same circuit.
- The **3D breadboard** is a calibrated view of the same board placement and
  wiring. It must not invent a second electrical circuit or silently use a
  different part placement.
- **Physical Test** is an optional mechanical scene used to exercise supported
  moving parts, collisions, and sensor interactions. It is not the electrical
  source of truth.
- A **sketch** is executable firmware source associated with the project. Its
  pin usage should be checked against the board topology and target profile,
  but code text is not a replacement for the board's connections.

## Electrical language

- A **polarized component** has terminal direction that affects electrical
  behavior. For an LED, the anode is the positive terminal and the cathode is
  the negative terminal.
- A **net** is an electrically connected set of pins and board contacts. Net
  identity must remain stable enough for schematic, ERC, SPICE, and simulation
  consumers to agree on the same circuit.
- The **circuit solver** resolves voltages and currents from component pin
  connections. Rendering must derive component orientation from those
  connections rather than accidentally reversing them.
