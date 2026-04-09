// Node.js serial port worker — spawned as a child process by serialport-bridge.ts
// Communicates over stdin/stdout with newline-delimited JSON.
//
// Protocol:
//   Parent → Worker: { id, type, ...args }
//   Worker → Parent: { id?, type, ...result }
//
// Message types:
//   list                         → list_result { ports }
//   open { path, baudRate }      → opened { path }
//   write { path, data }         → written
//   close { path }               → (no reply, fires "closed" event async)
//   Data events: { type:"data", path, data }
//   Error events: { type:"error", path?, error }
//   Closed events: { type:"closed", path }

/* eslint-disable @typescript-eslint/no-var-requires */
const { SerialPort } = require("serialport")

/** @type {Map<string, InstanceType<typeof SerialPort>>} */
const openPorts = new Map()

let inputBuffer = ""

process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk
  const lines = inputBuffer.split("\n")
  inputBuffer = lines.pop() ?? ""
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      handleMessage(JSON.parse(trimmed))
    } catch (e) {
      send({ type: "error", error: `parse error: ${e instanceof Error ? e.message : e}` })
    }
  }
})

async function handleMessage(msg) {
  const { id, type } = msg
  try {
    if (type === "list") {
      const ports = await SerialPort.list()
      send({ id, type: "list_result", ports })

    } else if (type === "open") {
      if (openPorts.has(msg.path)) {
        send({ id, type: "opened", path: msg.path })
        return
      }
      const port = new SerialPort({ path: msg.path, baudRate: msg.baudRate ?? 9600 })
      openPorts.set(msg.path, port)

      port.on("data", (data) => {
        send({ type: "data", path: msg.path, data: data.toString("utf8") })
      })
      port.on("error", (err) => {
        send({ type: "error", path: msg.path, error: err.message })
      })
      port.on("close", () => {
        openPorts.delete(msg.path)
        send({ type: "closed", path: msg.path })
      })

      // Wait for the port to open
      await new Promise((resolve, reject) => {
        port.once("open", resolve)
        port.once("error", reject)
      })

      send({ id, type: "opened", path: msg.path })

    } else if (type === "write") {
      const port = openPorts.get(msg.path)
      if (!port) {
        send({ id, type: "error", error: `port ${msg.path} is not open` })
        return
      }
      port.write(msg.data, (err) => {
        if (err) send({ id, type: "error", error: err.message })
        else send({ id, type: "written" })
      })

    } else if (type === "close") {
      const port = openPorts.get(msg.path)
      if (port) {
        port.close((err) => {
          if (err) send({ type: "error", path: msg.path, error: err.message })
          // "closed" event fires from the close listener above
        })
        openPorts.delete(msg.path)
      }
      send({ id, type: "closed", path: msg.path })

    } else {
      send({ id, type: "error", error: `unknown message type: ${type}` })
    }
  } catch (err) {
    send({ id, type: "error", error: err instanceof Error ? err.message : String(err) })
  }
}

function send(msg) {
  try {
    process.stdout.write(JSON.stringify(msg) + "\n")
  } catch {
    // stdout closed — exit cleanly
    process.exit(0)
  }
}

process.on("uncaughtException", (err) => {
  send({ type: "error", error: `uncaught: ${err.message}` })
})

process.on("unhandledRejection", (reason) => {
  send({ type: "error", error: `unhandled rejection: ${reason}` })
})
