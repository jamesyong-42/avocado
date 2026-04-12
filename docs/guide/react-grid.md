# TerminalGrid

Renders all virtual terminals as a responsive grid with active-terminal switching.

```tsx
import { TerminalGrid } from '@vibecook/avocado-sdk/react';

<TerminalGrid />
```

Under the hood it uses `useTerminalGrid()` to subscribe to session + terminal state and `<TerminalCard>` to render each cell.
