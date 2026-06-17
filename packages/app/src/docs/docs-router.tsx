import React from "react"
import { useRouter } from "@/router"
import { OverviewPage } from "@/docs/pages/overview"
import { CoreFeaturesPage } from "@/docs/pages/core-features"
import { ArduinoUnoPage } from "@/docs/pages/arduino-uno"
import { SimulatorPage } from "@/docs/pages/simulator"
import { SketchPage } from "@/docs/pages/sketch"
import { GraphPage } from "@/docs/pages/graph"
import { AiAgentPage } from "@/docs/pages/ai-agent"
import { ExtendingPage } from "@/docs/pages/extending"
import { LedPage } from "@/docs/pages/components/led"
import { RgbLedPage } from "@/docs/pages/components/rgb-led"
import { ResistorPage } from "@/docs/pages/components/resistor"
import { CapacitorPage } from "@/docs/pages/components/capacitor"
import { ButtonPage } from "@/docs/pages/components/button"
import { BuzzerPage } from "@/docs/pages/components/buzzer"
import { ServoPage } from "@/docs/pages/components/servo"
import { PotentiometerPage } from "@/docs/pages/components/potentiometer"
import { PhotoresistorPage } from "@/docs/pages/components/photoresistor"
import { TemperatureSensorPage } from "@/docs/pages/components/temperature-sensor"
import { UltrasonicSensorPage } from "@/docs/pages/components/ultrasonic-sensor"
import { Lcd16x2Page } from "@/docs/pages/components/lcd-16x2"
import { SevenSegmentPage } from "@/docs/pages/components/seven-segment"
import { NeoPixelPage } from "@/docs/pages/components/neopixel"
import { PirSensorPage } from "@/docs/pages/components/pir-sensor"
import { RelayPage } from "@/docs/pages/components/relay"
import { DcMotorPage } from "@/docs/pages/components/dc-motor"
import { DhtSensorPage } from "@/docs/pages/components/dht-sensor"
import { IrReceiverPage } from "@/docs/pages/components/ir-receiver"
import { ShiftRegisterPage } from "@/docs/pages/components/shift-register"
import { OledDisplayPage } from "@/docs/pages/components/oled-display"
import { AgentEvalPage } from "@/docs/pages/agent-eval"
import { DocsLayout, PageTitle } from "@/docs/docs-layout"

const ROUTES: Record<string, () => React.JSX.Element> = {
  "/documentation": OverviewPage,
  "/documentation/core-features": CoreFeaturesPage,
  "/documentation/arduino-uno": ArduinoUnoPage,
  "/documentation/simulator": SimulatorPage,
  "/documentation/sketch": SketchPage,
  "/documentation/graph": GraphPage,
  "/documentation/ai-agent": AiAgentPage,
  "/documentation/extending": ExtendingPage,
  "/documentation/components/led": LedPage,
  "/documentation/components/rgb-led": RgbLedPage,
  "/documentation/components/resistor": ResistorPage,
  "/documentation/components/capacitor": CapacitorPage,
  "/documentation/components/button": ButtonPage,
  "/documentation/components/buzzer": BuzzerPage,
  "/documentation/components/servo": ServoPage,
  "/documentation/components/potentiometer": PotentiometerPage,
  "/documentation/components/photoresistor": PhotoresistorPage,
  "/documentation/components/temperature-sensor": TemperatureSensorPage,
  "/documentation/components/ultrasonic-sensor": UltrasonicSensorPage,
  "/documentation/components/lcd-16x2": Lcd16x2Page,
  "/documentation/components/seven-segment": SevenSegmentPage,
  "/documentation/components/neopixel": NeoPixelPage,
  "/documentation/components/pir-sensor": PirSensorPage,
  "/documentation/components/relay": RelayPage,
  "/documentation/components/dc-motor": DcMotorPage,
  "/documentation/components/dht-sensor": DhtSensorPage,
  "/documentation/components/ir-receiver": IrReceiverPage,
  "/documentation/components/shift-register": ShiftRegisterPage,
  "/documentation/components/oled-display": OledDisplayPage,
  "/documentation/agent-eval": AgentEvalPage,
}

function NotFoundPage() {
  return (
    <DocsLayout>
      <PageTitle title="Page not found" subtitle="This documentation page does not exist." />
    </DocsLayout>
  )
}

export function DocsRouter() {
  const { path } = useRouter()
  const Page = ROUTES[path] ?? NotFoundPage
  return <Page />
}
