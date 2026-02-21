# Dreamer — Project Instructions

## Package Manager
Always use **bun** — never npm/npx/yarn.
- `bun install`, `bun add`, `bun run dev`, `bunx`

## Bun Documentation Reference
Bun docs index: https://bun.sh/docs/llms.txt

Key pages for this project:
- React setup: https://bun.com/docs/guides/ecosystem/react.md
- Vite integration: https://bun.com/docs/guides/ecosystem/vite.md
- Fullstack dev server (Bun.serve): https://bun.com/docs/bundler/fullstack.md
- Tailwind with Bun.serve: `bun add tailwindcss bun-plugin-tailwind` + bunfig.toml plugin
- Test runner: https://bun.com/docs/test/index.md
- TypeScript: https://bun.com/docs/typescript.md
- Environment variables: https://bun.com/docs/runtime/environment-variables.md
- Bundler: https://bun.com/docs/bundler/index.md
- Plugins: https://bun.com/docs/bundler/plugins.md
- Hot reloading: https://bun.com/docs/bundler/hot-reloading.md
- Docker deployment: https://bun.com/docs/guides/ecosystem/docker.md

## Base UI Documentation Reference
Base UI docs index: https://base-ui.com/llms.txt

- Package: `@base-ui/react` (unstyled, composable, accessible)
- Quick start: https://base-ui.com/react/overview/quick-start
- Styling guide: https://base-ui.com/react/handbook/styling
- Animation guide: https://base-ui.com/react/handbook/animation
- Composition guide: https://base-ui.com/react/handbook/composition
- Forms guide: https://base-ui.com/react/handbook/forms
- TypeScript guide: https://base-ui.com/react/handbook/typescript
- 45+ components: Accordion, Alert Dialog, Autocomplete, Avatar, Button, Checkbox, Collapsible, Combobox, Context Menu, Dialog, Drawer, Field, Fieldset, Form, Input, Menu, Menubar, Meter, Navigation Menu, Number Field, Popover, Preview Card, Progress, Radio, Scroll Area, Select, Separator, Slider, Switch, Tabs, Toast, Toggle, Tooltip, etc.
- Utilities: CSP Provider, Direction Provider, mergeProps, useRender

## Elysia Documentation Reference
Elysia docs: https://elysiajs.com/introduction.html

- **What**: Lightweight, type-safe HTTP framework for Bun
- Used as the API server for the sprite agent

## Vercel AI SDK Documentation Reference
AI SDK docs: https://ai-sdk.dev/docs

- **What**: TypeScript toolkit for building AI-powered apps
- Core: `streamText`, `tool`, `convertToModelMessages` from `ai`
- React: `useChat`, `DefaultChatTransport` from `@ai-sdk/react`
- Anthropic provider: `anthropic()` from `@ai-sdk/anthropic`

## Tech Stack
- **Runtime**: Bun
- **Monorepo**: Bun workspaces (`packages/app`, `packages/api`)
- **Framework**: React 19
- **UI Components**: Base UI (`@base-ui/react`) — unstyled, style with Tailwind
- **Bundler**: Vite (with @vitejs/plugin-react)
- **CSS**: Tailwind CSS v4 (@tailwindcss/vite plugin)
- **Language**: TypeScript (strict mode)
- **API Server**: Elysia — runs on port 4111
- **AI Agent**: Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) — `streamText` + `tool()` harness
- **AI Frontend**: Vercel AI SDK React (`@ai-sdk/react`) — `useChat()` + `DefaultChatTransport`

## Configuration

- **Path Aliases**: `@/*` maps to `src/*` (configured in app tsconfig + vite)

## Architecture
```
dreamer/
  package.json              ← workspace root
  tsconfig.base.json        ← shared TS config
  packages/
    app/                    ← React frontend (Vite, port 3000)
      src/
        chat/               ← ChatPanel + apply-command bridge
        canvas/             ← PixiJS canvas + sprite rendering
        store/              ← scene state (XState)
        ...
    api/                    ← Elysia backend (port 4111)
      src/
        index.ts            ← Elysia server
        agent/
          sprite-agent.ts   ← system prompt + streamText()
          tools.ts          ← 5 scene tools using AI SDK tool()
```

- **Frontend** (Vite, port 3000): React app with canvas sprite editor + chat panel
- **API server** (Elysia, port 4111): Sprite Agent with tools for scene manipulation
- Frontend sends messages via `useChat()` → Elysia's `POST /api/chat` endpoint
- Agent tool results are structured commands dispatched to the scene reducer

## Dev Commands
```bash
bun run dev        # Start both frontend + API concurrently
bun run dev:app    # Start frontend dev server only (port 3000)
bun run dev:api    # Start Elysia API server only (port 4111)
bun run build      # Production build (frontend)
bun run typecheck  # TypeScript type checking (both packages)
```

## Environment Variables
Copy `.env.example` to `.env` and set:
- `ANTHROPIC_API_KEY` — required for the sprite agent (uses claude-sonnet-4-6)

---

## Git Workflow

- **Never push directly to main.** Always create a feature branch and open a PR.
- Do not amend commits — make additional commits instead.
- Before pushing, run type checking:

```bash
bun run typecheck       # TypeScript type checking (both packages)
```

---

## TypeScript Standards

- `strict: true` is assumed
- Avoid `any` and unsafe casts (`as`)
- Prefer `unknown` at boundaries

### Schemas First, Types Second

**Hierarchy:** zod schemas → types → interfaces (rarely)

#### 1. Schemas (Preferred) — For Data Crossing Boundaries

Use zod schemas for any data from external sources (API responses, agent tool results, localStorage, etc.):

```ts
import { z } from 'zod'

export const spriteSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
})

export type Sprite = z.infer<typeof spriteSchema>
```

#### 2. Types — For Client-Only Data

Use plain types for internal data (component props, UI state, function signatures):

```ts
type CanvasProps = {
  width: number
  height: number
  onSelect?: (id: string) => void
}

type DragState = {
  isDragging: boolean
  startPosition: { x: number; y: number }
}
```

#### 3. Interfaces — Avoid Unless Necessary

Only use interfaces when you specifically need declaration merging (rare).

### Discriminated Unions

Use discriminated unions when a value can be one of several shapes:

```ts
type SceneAction =
  | { type: 'ADD'; sprite: Sprite }
  | { type: 'REMOVE'; id: string }
  | { type: 'SELECT'; id: string | null }
  | { type: 'UPDATE'; id: string; changes: Partial<Sprite> }

function sceneReducer(state: SceneState, action: SceneAction) {
  switch (action.type) {
    case 'ADD':
      // TS knows action.sprite exists
      return { ...state, sprites: [...state.sprites, action.sprite] }
    case 'REMOVE':
      // TS knows action.id exists
      return { ...state, sprites: state.sprites.filter(s => s.id !== action.id) }
  }
}
```

---

## Component Design

### Philosophy: Composition Over Configuration

- "Just use children": prefer `children` over bespoke content props
- Don't create mega-components with dozens of optional props

```tsx
// GOOD: composable
<Card>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Body>{children}</Card.Body>
</Card>

// AVOID: prop explosion
<Card title="Title" subtitle="Subtitle" leftActionText="..." />
```

### Use Base UI Primitives — Don't Reinvent

For common UI patterns, use **Base UI** (`@base-ui/react`) instead of building from scratch. Base UI handles focus management, keyboard navigation, screen reader support, and edge cases.

```tsx
// GOOD: Base UI handles accessibility, focus, keyboard
import { Dialog } from '@base-ui/react/dialog'

<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Backdrop />
    <Dialog.Popup>
      <Dialog.Title>Title</Dialog.Title>
      {children}
    </Dialog.Popup>
  </Dialog.Portal>
</Dialog.Root>

// BAD: Rolling your own modal
const [isOpen, setIsOpen] = useState(false)
// Now you need: focus trap, escape key, click outside, scroll lock...
```

### Component Responsibilities

**Components should:** Render UI, wire up handlers, call hooks.

**Components should NOT:** Contain business logic, perform data fetching directly, manage unrelated state.

Business logic belongs in: hooks, services, domain modules.

### Prop Design

- Keep props minimal and orthogonal
- Use `onX` for handlers (`onClick`, `onSelect`)
- Use `isX` / `hasX` for booleans (`isActive`, `hasError`)
- Prefer unions for mutually exclusive states

---

## Hooks

### Custom Hook Rules

- Name with `use` prefix: `useScene`, `useCanvasDrag`
- Only call hooks at the top level — not in loops, conditions, or nested functions
- Return objects for multiple values: `{ data, isLoading, error }`

### Avoid `useEffect` When Possible

`useEffect` is for side effects (subscriptions, timers, DOM manipulation), not derived state or event responses.

```tsx
// BAD: useEffect for derived state
const [fullName, setFullName] = useState('')
useEffect(() => {
  setFullName(`${firstName} ${lastName}`)
}, [firstName, lastName])

// GOOD: compute inline or useMemo
const fullName = `${firstName} ${lastName}`
```

### Cleanup Side Effects

Always clean up subscriptions, timers, and event listeners:

```tsx
useEffect(() => {
  const controller = new AbortController()
  fetchData({ signal: controller.signal })
  return () => controller.abort()
}, [])
```

### When to Use `useRef`

Use refs for values that shouldn't trigger re-renders:

1. **DOM element access** — focus, scroll, measurements
2. **Mutable values that don't trigger renders** — flags, timers, previous values
3. **Stable callback references** — store latest callback without re-renders

```tsx
// DOM ref
const inputRef = useRef<HTMLInputElement>(null)
const handleFocus = () => inputRef.current?.focus()

// Animation frame cleanup
const rafIdRef = useRef<number>(0)
useEffect(() => {
  const animate = () => {
    rafIdRef.current = requestAnimationFrame(animate)
  }
  rafIdRef.current = requestAnimationFrame(animate)
  return () => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
  }
}, [])
```

**When NOT to use `useRef`:**
- Values that should trigger re-renders → use `useState`
- Derived/computed values → compute inline or use `useMemo`

**Best practices:**
- Always check `ref.current` for null (use `ref.current?.method()`)
- Initialize DOM refs with `null`: `useRef<HTMLElement>(null)`
- Don't read/write `ref.current` during render — only in effects, handlers, or callbacks

### Stable References

Use `useCallback` for functions passed to memoized children. Use `useMemo` for expensive calculations or object/array references.

---

## Performance

### Memoization

- **`React.memo`**: Wrap components that re-render frequently with unchanged props
- **`useMemo`**: Cache expensive calculations
- **`useCallback`**: Stabilize functions passed to memoized components

```tsx
const ExpensiveList = React.memo(({ items }: Props) => (
  <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
))

const handleClick = useCallback((id: string) => {
  setSelected(id)
}, [])
```

### List Keys

Use stable, unique identifiers — not array indices:

```tsx
// GOOD
{items.map(item => <Item key={item.id} {...item} />)}

// BAD
{items.map((item, index) => <Item key={index} {...item} />)}
```

---

## Styling

- All styling uses **Tailwind CSS v4** utilities
- Base UI components are unstyled — style them with Tailwind classes
- Prefer responsive/proportional sizing over fixed pixel values where possible

### Use `cn()` for Conditional Class Names

Import from `@/utils/classnames`:

```tsx
import { cn } from '@/utils/classnames'

<div
  className={cn(
    'rounded-lg border p-4',
    isActive && 'border-blue-500',
    className
  )}
/>
```

- Keep base styles static
- Conditional styles go through `cn`

---

## Code Quality

### Naming Conventions

- **Files & directories**: Always use **kebab-case** (`chat-panel.tsx`, `sprite-list.tsx`, `image-loader.ts`)
  - Git is case-insensitive by default on macOS/Windows (`git config core.ignorecase true`). Renaming `ChatPanel.tsx` → `chatPanel.tsx` produces no diff, leading to broken imports on Linux CI/containers that _are_ case-sensitive. kebab-case eliminates this entire class of bugs because there's no ambiguity — every character is lowercase.
  - This applies to all files: components, hooks, utilities, tests, configs.
- **Components (exports)**: PascalCase (`UserProfile`, `Canvas`)
- **Hooks**: camelCase with `use` prefix (`useScene`, `useCanvasDrag`)
- **Functions/Variables**: camelCase (`handleClick`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE or camelCase (`API_URL`, `defaultConfig`)

### Import Order

Organize imports consistently:

```tsx
// 1. React
import { useState, useCallback } from 'react'

// 2. Third-party libraries
import { useChat } from '@ai-sdk/react'

// 3. Internal modules (absolute imports)
import { useScene } from '@/store/scene'
import { applyAgentCommand } from '@/chat/apply-command'

// 4. Types
import type { Sprite } from '@/types'
```

### Error Handling

- Use Error Boundaries for component tree errors
- Handle async errors with try/catch
- Provide user-friendly error messages

---

## Do Not

- Do not fetch data in `useEffect` — use dedicated hooks or libraries
- Do not use `useEffect` for derived state — use `useMemo` or compute inline
- Do not create prop-heavy mega-components
- Do not write components with hundreds of lines — break them up
- Do not create components inside render functions
- Do not swallow errors silently
- Do not use `any` or unsafe type casts
- Do not use array indices as list keys
- Do not put business logic in components — extract to hooks or utilities
- Do not reinvent Base UI primitives (dialogs, tooltips, menus, etc.)
- Do not leave subscriptions, timers, or listeners uncleaned
- Do not use assignments in expressions — use block statements instead
- Do not use non-null assertions (`!`) — use proper null checks
- Do not use default exports — always use named exports
- Do not use interactive `<div>` elements — use semantic elements like `<button>`
