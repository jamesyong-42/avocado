# ghostty (avocado)

A minimal multi-terminal Electron app that looks and behaves like
[Ghostty](https://ghostty.org) — built entirely on
`@vibecook/avocado-sdk`'s **headless** React primitives to prove the layering:
the SDK owns terminal behavior, the app owns every pixel of chrome.

- **Engine**: restty (libghostty-vt) with avocado's Ghostty-parity defaults —
  Ghostty Default Style Dark theme, JetBrains Mono + Nerd Fonts, 2px window
  padding, native alpha blending.
- **Chrome**: transparent-style titlebar, macOS-tab-like tab strip, splits
  with draggable 1px dividers, unfocused-split dimming (≈ Ghostty's
  `unfocused-split-opacity = 0.7`).
- **Behavior from the SDK**: `TerminalSurface` handles engine lifecycle,
  PTY I/O, auto-fit on resize, and click-to-focus; the main process reuses
  `PTYSessionManager` + `TerminalService` with node-pty.

## Keybindings (⌘ on macOS, Ctrl elsewhere)

| Binding | Action |
| --- | --- |
| mod+T | new tab |
| mod+W | close focused split (last split closes tab / window) |
| mod+D / mod+Shift+D | split right / split down |
| mod+] / mod+[ | focus next / previous split |
| mod+Shift+] / mod+Shift+[ | next / previous tab |
| mod+1…8, mod+9 | select tab N / last tab |

Shells exiting (`exit`, ctrl+d) close their split, like Ghostty.

## Run

```sh
pnpm install          # once, from the repo root (rebuilds node-pty for Electron)
pnpm run ghostty      # from the repo root, or `pnpm dev` here
```
