# ── Dreamer hosted-mode Docker image ──────────────────────────────────────
# build-trigger: 2026-05-25 api redeploy after lockfile fix
#
# Target: Railway (or any container host). Builds a self-contained image
# with:
#   - Bun runtime
#   - arduino-cli + AVR core pre-installed to ~/.dreamer/bin/
#   - ~25 curated third-party Arduino libraries pre-baked
#   - The Dreamer API + built web UI, served on port 4111
#
# The DREAMER_HOSTED=1 env below tells the API to:
#   - Return 403 from /api/libraries/install and /api/libraries/uninstall
#   - Skip auto-install on missing-header compile errors
#   - Advertise `hosted: true` via /api/capabilities so the UI hides
#     install buttons and shows a "Hosted" pill in the toolbar
#
# Users who need libraries outside the pre-baked set should run the CLI
# binary locally. The hosted deploy is a "try it" funnel, not a full
# dev environment.

# ── Stage 1: build the web UI bundle + manifest ────────────────────────
FROM oven/bun:1.3.11 AS build
WORKDIR /app

COPY package.json bun.lockb tsconfig.base.json ./
COPY packages packages
COPY scripts scripts

# No --frozen-lockfile: bun.lockb drifts from package.json in normal use
# (nobody re-runs `bun install` on every dep tweak), so the strict flag
# breaks production builds when the lockfile is stale.
RUN bun install

# Produce packages/app/dist/ via Vite; then we can serve it statically
# from the API process. (The generate-asset-manifest.ts step is CLI-binary
# specific — not needed here since the API server in hosted mode serves
# the bundle via a plain static route.)
RUN bun run --cwd packages/app build

# ── Stage 2: runtime ──────────────────────────────────────────────────
FROM oven/bun:1.3.11 AS runtime

# Minimal system deps: curl for arduino-cli's installer, ca-certificates
# for HTTPS library index fetches, ffmpeg for /motion segment clipping and
# keyframe extraction.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install arduino-cli to the Dreamer-managed location. The API's toolchain
# resolver looks there first, falls back to PATH.
ENV DREAMER_MACHINE_HOME=/root/.dreamer
RUN mkdir -p ${DREAMER_MACHINE_HOME}/bin ${DREAMER_MACHINE_HOME}/cache \
  && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
     | BINDIR=${DREAMER_MACHINE_HOME}/bin sh

# Install arduino cores. Each stamp file matches the naming scheme that
# packages/api/src/toolchain.ts checks (`arduino-cli-core-<family>.stamp`,
# with ":" replaced by "-") so the API doesn't re-install on first compile.
#
# Register the Earle Philhower rp2040:rp2040 community core's board-manager
# URL up front so `core install rp2040:rp2040` succeeds without the user
# having to pass `--additional-urls` on every call.
RUN ${DREAMER_MACHINE_HOME}/bin/arduino-cli config init --overwrite \
  && ${DREAMER_MACHINE_HOME}/bin/arduino-cli config add \
       board_manager.additional_urls \
       https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json \
  && ${DREAMER_MACHINE_HOME}/bin/arduino-cli core update-index \
  && ${DREAMER_MACHINE_HOME}/bin/arduino-cli core install arduino:avr \
  && echo "pre-baked" > ${DREAMER_MACHINE_HOME}/cache/arduino-cli-core-arduino-avr.stamp

# Install the Raspberry Pi Pico core (~500MB — toolchain + picotool + gcc-
# arm-none-eabi). Separate RUN so the AVR install above stays a stable
# cache layer when the Pico core is bumped.
RUN ${DREAMER_MACHINE_HOME}/bin/arduino-cli core install rp2040:rp2040 \
  && echo "pre-baked" > ${DREAMER_MACHINE_HOME}/cache/arduino-cli-core-rp2040-rp2040.stamp

# ── Pre-bake the curated library set ──────────────────────────────────
# Grouped into batches so Docker layer caching stays useful if we later
# bump individual libraries. Each batch fetches from the Arduino index
# once; total install ~2-4 min, adds ~150-250MB to the image.
#
# If you need to update this list: add or remove names here and rebuild.
# To see the currently-installed libraries in a running container:
#   docker exec <container> /root/.dreamer/bin/arduino-cli lib list

# Core sensors + displays (most common beginner libs)
RUN ${DREAMER_MACHINE_HOME}/bin/arduino-cli lib install \
  "Servo" \
  "Adafruit NeoPixel" \
  "DHT sensor library" \
  "Adafruit SSD1306" \
  "Adafruit GFX Library" \
  "Adafruit Unified Sensor"

# Data + comms
RUN ${DREAMER_MACHINE_HOME}/bin/arduino-cli lib install \
  "ArduinoJson" \
  "PubSubClient" \
  "OneWire" \
  "DallasTemperature"

# Displays, input, timing
RUN ${DREAMER_MACHINE_HOME}/bin/arduino-cli lib install \
  "LiquidCrystal I2C" \
  "IRremote" \
  "Keypad" \
  "RTClib" \
  "FastLED"

# Distance + motion
RUN ${DREAMER_MACHINE_HOME}/bin/arduino-cli lib install \
  "NewPing" \
  "Ultrasonic" \
  "AccelStepper" \
  "TinyGPSPlus"

# Copy built artifacts + source from the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/packages ./packages

# Where project data (runs, threads, projects, config) is stored. Railway
# mounts persistent volumes here if the user wants state to survive deploys.
ENV DREAMER_HOME=/data
RUN mkdir -p /data

# Persist the machine-home so dreamerMachineHome() at runtime resolves to the
# SAME path the build stage wrote the pre-baked arduino-cli stamp files to
# (/root/.dreamer/cache/arduino-cli-core-*.stamp). Without this the runtime
# falls back to `homedir()/.dreamer` — which coincidentally works for a
# root container but silently re-downloads the ~500MB rp2040 core on any
# image where the effective user changes.
#
# For cross-deploy cost containment, attach a persistent volume to
# /root/.dreamer in the hosting platform (Railway, Fly, etc.). The volume
# keeps the cores + stamps across deploys; without one, a cache-busted
# image layer will trigger a full re-download on first compile.
ENV DREAMER_MACHINE_HOME=/root/.dreamer

# Hosted-mode flags read by the API + injected UI capabilities.
ENV DREAMER_HOSTED=1
ENV DREAMER_AUTO_INSTALL=0
ENV DREAMER_LOG_FILE=0
ENV NODE_ENV=production

EXPOSE 4111

# Start the Elysia server. It mounts capabilitiesRoutes which advertises
# hosted:true to the frontend.
CMD ["bun", "run", "packages/api/src/index.ts"]
