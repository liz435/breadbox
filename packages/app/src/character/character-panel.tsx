import { useCharacterChat } from "./use-character-chat"
import { CharacterChatPanel } from "./character-chat-panel"

export function CharacterPanel() {
  const chat = useCharacterChat()

  return (
    <div className="h-full w-full bg-background text-foreground">
      <CharacterChatPanel chat={chat} />
    </div>
  )
}
