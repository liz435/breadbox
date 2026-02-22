import { useCharacterChat } from "./use-character-chat"
import { CharacterChatPanel } from "./character-chat-panel"

export function CharacterPage() {
  const chat = useCharacterChat()

  return (
    <div className="h-screen w-screen bg-background text-foreground flex justify-center">
      <div className="w-full max-w-2xl">
        <CharacterChatPanel chat={chat} />
      </div>
    </div>
  )
}
