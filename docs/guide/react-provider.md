# AvocadoProvider

Wrap your React tree with `<AvocadoProvider>` and pass a backend shim that exposes the host process's session manager over IPC (or any other mechanism).

```tsx
import { AvocadoProvider } from '@vibecook/avocado-sdk/react';

export function App() {
  return (
    <AvocadoProvider backend={electronBackend}>
      {/* … */}
    </AvocadoProvider>
  );
}
```

The backend type lives in `@vibecook/avocado-sdk/types` as `TerminalBackend` — it's intentionally abstract so you can hook up Electron IPC, WebSocket, or anything else.
