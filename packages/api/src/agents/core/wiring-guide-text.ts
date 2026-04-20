export const WIRING_GUIDE_TEXT = `## Wire Colors (always follow this convention)
- Power (5V): red — "#ef4444"
- Ground (GND): black — "#1e293b"
- Signal / data: any other color (e.g. yellow "#eab308", blue "#3b82f6", green "#22c55e")
- Use a distinct color per signal line when multiple signals are present.

## Wiring Rules
- ALL connections come from WIRES, not pin assignments. Set all component pins to null.
- Same-row cols 0-4 are connected (left bus). Same-row cols 5-9 are connected (right bus). No wire needed within a bus.
- Use ONE direct wire per Arduino pin. If a net fans out (multiple loads), land one wire on a breadboard row/rail and branch from there.
- LED: always add 220Ω resistor. Use ledResistorPairs in propose_circuit — auto-wires cathode→resistor→GND.
- **Series resistors** (7-segment, etc.): Use throughComponent in propose_circuit wires. Example: {arduinoPin:2, toComponent:0, toPin:"a", throughComponent:1, throughEntryPin:"b", throughExitPin:"a"}. The tool auto-places the resistor on the same row as the target pin.
- 3-pin components (servo/pot/sensor): each pin on a SEPARATE ROW or they short via bus. Wire signal→(row,x), 5V→(row+1,x), GND→(row+2,x).
- Button: straddles center gap. Pin "a" at col 3, pin "b" at col 6. Wire signal to one side, GND/5V to the other.
- High-current loads (servo, motor, relay) should use external power_supply with common ground.
- For shared GND or shared power, prefer rail distribution: Arduino GND/5V → rail once, then rail → each component.
- Resistor: always at cols 3 (pin a) and 6 (pin b), bridging the center gap. Placement col is ignored.

## Footprints
LED: 2 rows vertical (anode y, cathode y+1) | Resistor: horizontal at cols 3,6 (a=col3, b=col6) | Button: cols 3,6 rows y,y+1 (a=col3, b=col6) | Servo/Pot: 3 rows | 7-seg: 9 rows (a-g,dp,gnd) | Capacitor: 2 rows

## Pin Names
LED: anode,cathode | RGB: red,green,blue,common | Button: a,b | Resistor: a,b | Capacitor: positive,negative | Pot: vcc,signal,gnd | Buzzer: positive,negative | Servo: signal,vcc,gnd | NeoPixel: din,vcc,gnd | PIR/DHT/IR: signal | Relay/Motor: signal | ShiftReg: data,clock,latch | OLED: gnd,vcc,scl,sda | LCD: vss,vdd,vo,rs,rw,en,d4,d5,d6,d7,a,k | 7seg: a,b,c,d,e,f,g,dp,gnd

## Arduino Pins
Board target: arduino_uno
Signal pin IDs: 0-69 (board-dependent)
Analog pins: A0=14, A1=15, A2=16, A3=17, A4=18, A5=19
PWM pins: D3,D5,D6,D9,D10,D11
Special wire pin IDs: 5V=-1, 3V3=-2, GND=-3/-4/-6, VIN=-5, AREF=-7`;
