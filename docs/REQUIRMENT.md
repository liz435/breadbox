1. The breadboard display should be realistic:

   a. **Structure & Layout**
      A breadboard is a rectangular prototyping board with holes arranged 
      in a grid. Follow these three structural rules exactly:
      
      - **Main area rows**: Holes are grouped in rows of 5. Every hole in 
        the same row of 5 is internally connected — anything plugged into 
        that row shares a connection.
      - **Center gap**: The board is split down the middle, dividing each 
        row into two independent halves of 5. Components straddling the gap 
        (like ICs) have each pin wired independently.
      - **Power rails**: Two long rails run along the top and bottom edges — 
        one positive (+), one negative (−). Every hole in each rail is 
        connected along the full length of the board, providing a shared 
        power and ground bus for the entire circuit.

   b. **Visual Appearance**
      The breadboard must look realistic and clean:

      - **Board color**: Off-white or light beige (#F5F0E8) base color with 
        a subtle plastic texture.
      - **Holes**: Small dark circles (#1A1A1A), evenly spaced in a precise 
        grid. Each hole has a subtle inner shadow to give depth — like a 
        real hole punched into plastic.
      - **Row numbers**: Print row numbers (1, 2, 3...) along both left and 
        right edges in small, gray sans-serif font.
      - **Column letters**: Print column letters (a, b, c, d, e — gap — 
        f, g, h, i, j) along the top and bottom edges.
      - **Center gap**: A clearly visible channel running down the middle, 
        slightly recessed and darker than the board surface (#D4CFC7).
      - **Power rails**: Marked with a red line along the + rail and a 
        blue or black line along the − rail. Label each end with + and − 
        symbols. Rails are slightly separated from the main grid by a thin 
        dividing line.
      - **Tie points**: Subtle rectangular grouping indicators showing 
        which 5 holes are connected — very faint, like embossed markings 
        on real breadboards.

   c. **Component Placement**
      - Each component has legs/pins — every leg must plug into exactly 
        one hole on the breadboard.
      - Components snap into holes visually — the leg sits inside the 
        hole with a small colored ring around the hole to show occupancy.
      - Each leg occupies one hole and one hole only — no two legs of the 
        same component share the same hole.
      - Legs on different rows are isolated unless connected by a wire.

   d. **Component Visual Style**
      Each component type has a distinct, realistic appearance:

      - **Resistors**: Beige/tan cylindrical body with colored bands 
        indicating resistance value. Two legs extend from each end.
      - **LEDs**: Small dome-shaped top, colored to match emission color 
        (red, green, blue, yellow). Flat edge on the base indicates cathode 
        (negative). Glows visually when activated — add a soft color bloom 
        around the dome.
      - **Wires**: Colored jumper wires with a slight curve or arc between 
        two holes. Wire color should be meaningful — red for power, black 
        for ground, other colors for signal. Wire ends have small metal tips 
        that sit inside the holes.
      - **Capacitors**: Cylindrical with a stripe on the negative side. 
        Electrolytic capacitors are taller, ceramic capacitors are small 
        and disc-shaped.
      - **Chips (ICs)**: Rectangular black body straddling the center gap. 
        Legs extend evenly from both sides. A notch or dot marks pin 1.

   e. **Electricity Flow Visualization**
      - When a valid closed circuit is detected, animate current flow 
        along the path — a moving dashed line or glowing pulse traveling 
        from + to −.
      - Flow color: bright yellow or white pulse traveling along wires 
        and through connected rows.
      - Active components glow or animate — LEDs emit light bloom, 
        motors spin, buzzers show vibration rings.
      - Inactive or broken circuits show no animation — components remain 
        dim and static.
      - If polarity is reversed, show a subtle red warning glow on the 
        incorrectly connected component.

   f. **Components & Electrical Behavior**
      - Components only activate when connected with correct polarity.
      - Electricity flow must follow real circuit rules — current flows 
        from positive to negative through a valid closed path only.
      - If polarity is reversed or the circuit path is incomplete, 
        the component does not activate.
      - Connection is determined by internal row logic — two legs are 
        connected only if they share the same internal row or are linked 
        via a wire or power rail.
        