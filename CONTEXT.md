# Breadbox domain context

Breadbox is an AI-assisted Arduino circuit builder and simulator. A **project** contains a **board**, a **sketch**, and a circuit represented by placed **components**, their **pins**, and electrically connected **nets**.

- A **schematic** is a rendered electrical view of the circuit. It must preserve each component's pin polarity and each net's connectivity.
- A **breadboard** is the physical-placement view of the same circuit.
- A **polarized component** has terminal direction that affects electrical behavior. For an LED, the anode is the positive terminal and the cathode is the negative terminal.
- The **circuit solver** resolves voltages and currents from component pin connections. Rendering must derive component orientation from those connections rather than accidentally reversing them.
