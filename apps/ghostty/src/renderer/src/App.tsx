/**
 * App — Ghostty-parity multi-terminal UI on avocado's headless primitives.
 *
 * Everything terminal-behavioral (engine lifecycle, PTY I/O, auto-fit,
 * click-to-focus) comes from `TerminalSurface`; this file owns only the
 * Ghostty-shaped chrome: tabs, splits, keybindings, and dimming.
 *
 * Keybindings (⌘ on macOS, Ctrl elsewhere), matching Ghostty defaults:
 *   mod+T            new tab
 *   mod+W            close focused split (last split closes the tab/window)
 *   mod+D            split right          mod+Shift+D   split down
 *   mod+]  /  mod+[  focus next / previous split
 *   mod+Shift+] / [  next / previous tab
 *   mod+1..8, mod+9  select tab N / last tab
 */

import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { AvocadoProvider, TerminalSurface, type TerminalCoreActions } from '@vibecook/avocado-sdk/react';

import {
  leaf,
  neighborPane,
  panesOf,
  removePane,
  setSplitRatio,
  splitPane,
  type SplitDirection,
  type SplitTree,
} from './split-tree';
import { SplitView } from './components/SplitView';
import { TabBar } from './components/TabBar';

interface PaneState {
  id: string;
  sessionId: string;
  terminalId: string;
}

interface TabState {
  id: string;
  tree: SplitTree;
  panes: Record<string, PaneState>;
  focusedPaneId: string;
}

const backend = window.ghostty;
const isMac = window.ghosttyInfo.platform === 'darwin';
const shellName = window.ghosttyInfo.shellName;

const SPAWN_COLS = 80;
const SPAWN_ROWS = 24;

async function spawnPane(): Promise<PaneState> {
  const created = await backend.pty.create({ cwd: '', cols: SPAWN_COLS, rows: SPAWN_ROWS });
  if (!created.success || !created.sessionId) {
    throw new Error(created.error ?? 'failed to spawn shell');
  }
  const term = await backend.terminal.createVirtual(created.sessionId, {
    cols: SPAWN_COLS,
    rows: SPAWN_ROWS,
    mode: 'active',
  });
  if (!term.success || !term.terminalId) {
    backend.pty.destroy(created.sessionId).catch(() => {});
    throw new Error(term.error ?? 'failed to create terminal');
  }
  return { id: crypto.randomUUID(), sessionId: created.sessionId, terminalId: term.terminalId };
}

function releasePane(pane: PaneState, killSession: boolean): void {
  backend.terminal.destroy(pane.terminalId).catch(() => {});
  if (killSession) {
    backend.pty.destroy(pane.sessionId).catch(() => {});
  }
}

export function App(): JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paneActionsRef = useRef(new Map<string, TerminalCoreActions>());
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;

  const fail = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
  }, []);

  // ─── Tab / pane operations ────────────────────────────────────────────

  const newTab = useCallback(async () => {
    try {
      const pane = await spawnPane();
      const tabId = crypto.randomUUID();
      setTabs((prev) => [
        ...prev,
        { id: tabId, tree: leaf(pane.id), panes: { [pane.id]: pane }, focusedPaneId: pane.id },
      ]);
      setActiveTabId(tabId);
    } catch (err) {
      fail(err);
    }
  }, [fail]);

  const splitFocused = useCallback(
    async (dir: SplitDirection) => {
      const tabId = activeTabIdRef.current;
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;
      const targetPaneId = tab.focusedPaneId;
      try {
        const pane = await spawnPane();
        setTabs((prev) =>
          prev.map((t) =>
            t.id !== tabId
              ? t
              : {
                  ...t,
                  tree: splitPane(t.tree, targetPaneId, pane.id, dir, crypto.randomUUID()),
                  panes: { ...t.panes, [pane.id]: pane },
                  focusedPaneId: pane.id,
                }
          )
        );
      } catch (err) {
        fail(err);
      }
    },
    [fail]
  );

  const removePaneById = useCallback((paneId: string, opts: { killSession: boolean }) => {
    const prev = tabsRef.current;
    const tab = prev.find((t) => paneId in t.panes);
    if (!tab) return;

    const pane = tab.panes[paneId];
    if (pane) releasePane(pane, opts.killSession);
    paneActionsRef.current.delete(paneId);

    const nextTree = removePane(tab.tree, paneId);
    if (!nextTree) {
      const rest = prev.filter((t) => t.id !== tab.id);
      setTabs(rest);
      if (rest.length === 0) {
        window.close();
        return;
      }
      if (activeTabIdRef.current === tab.id) {
        const index = prev.findIndex((t) => t.id === tab.id);
        const fallback = rest[Math.min(Math.max(index - 1, 0), rest.length - 1)];
        setActiveTabId(fallback ? fallback.id : rest[rest.length - 1]!.id);
      }
      return;
    }

    const panes = { ...tab.panes };
    delete panes[paneId];
    const focusedPaneId =
      tab.focusedPaneId === paneId ? (panesOf(nextTree)[0] ?? tab.focusedPaneId) : tab.focusedPaneId;
    setTabs(
      prev.map((t) => (t.id === tab.id ? { ...t, tree: nextTree, panes, focusedPaneId } : t))
    );
  }, []);

  const closeTab = useCallback((tabId: string) => {
    const prev = tabsRef.current;
    const tab = prev.find((t) => t.id === tabId);
    if (!tab) return;
    for (const pane of Object.values(tab.panes)) {
      releasePane(pane, true);
      paneActionsRef.current.delete(pane.id);
    }
    const rest = prev.filter((t) => t.id !== tabId);
    setTabs(rest);
    if (rest.length === 0) {
      window.close();
      return;
    }
    if (activeTabIdRef.current === tabId) {
      const index = prev.findIndex((t) => t.id === tabId);
      const fallback = rest[Math.min(Math.max(index - 1, 0), rest.length - 1)];
      setActiveTabId(fallback ? fallback.id : rest[rest.length - 1]!.id);
    }
  }, []);

  const focusPane = useCallback((tabId: string, paneId: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId && t.focusedPaneId !== paneId ? { ...t, focusedPaneId: paneId } : t
      )
    );
  }, []);

  const cyclePane = useCallback(
    (offset: 1 | -1) => {
      const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
      if (!tab) return;
      const next = neighborPane(tab.tree, tab.focusedPaneId, offset);
      if (next) focusPane(tab.id, next);
    },
    [focusPane]
  );

  const cycleTab = useCallback((offset: 1 | -1) => {
    const prev = tabsRef.current;
    if (prev.length < 2) return;
    const index = prev.findIndex((t) => t.id === activeTabIdRef.current);
    const next = prev[(index + offset + prev.length) % prev.length];
    if (next) setActiveTabId(next.id);
  }, []);

  const selectTabIndex = useCallback((digit: number) => {
    const prev = tabsRef.current;
    if (prev.length === 0) return;
    // Ghostty: mod+9 is always the last tab.
    const tab = digit === 9 ? prev[prev.length - 1] : prev[digit - 1];
    if (tab) setActiveTabId(tab.id);
  }, []);

  const changeRatio = useCallback((tabId: string, splitId: string, ratio: number) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, tree: setSplitRatio(t.tree, splitId, ratio) } : t))
    );
  }, []);

  // ─── Lifecycle: first tab, shell-exit cleanup, keyboard focus ────────

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void newTab();
  }, [newTab]);

  useEffect(() => {
    // Shell exited (`exit`, ctrl+d): close its split, like Ghostty.
    return backend.pty.onExit((sessionId) => {
      for (const tab of tabsRef.current) {
        const pane = Object.values(tab.panes).find((p) => p.sessionId === sessionId);
        if (pane) {
          removePaneById(pane.id, { killSession: false });
          return;
        }
      }
    });
  }, [removePaneById]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const focusedPaneId = activeTab?.focusedPaneId ?? null;
  useEffect(() => {
    if (!focusedPaneId) return;
    paneActionsRef.current.get(focusedPaneId)?.focus();
  }, [activeTabId, focusedPaneId]);

  // ─── Keybindings ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey) return;
      const go = (fn: () => void): void => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      };
      const key = e.key.toLowerCase();
      if (key === 't' && !e.shiftKey) return go(() => void newTab());
      if (key === 'w' && !e.shiftKey)
        return go(() => {
          const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
          if (tab) removePaneById(tab.focusedPaneId, { killSession: true });
        });
      if (key === 'd') return go(() => void splitFocused(e.shiftKey ? 'column' : 'row'));
      if ((key === ']' || key === '}') && e.shiftKey) return go(() => cycleTab(1));
      if ((key === '[' || key === '{') && e.shiftKey) return go(() => cycleTab(-1));
      if (key === ']') return go(() => cyclePane(1));
      if (key === '[') return go(() => cyclePane(-1));
      if (!e.shiftKey && /^[1-9]$/.test(e.key)) return go(() => selectTabIndex(Number(e.key)));
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [newTab, removePaneById, splitFocused, cyclePane, cycleTab, selectTabIndex]);

  // ─── Rendering ────────────────────────────────────────────────────────

  const renderPane = (tab: TabState, paneId: string): ReactNode => {
    const pane = tab.panes[paneId];
    if (!pane) return <div className="term-pane" />;
    const focused = tab.focusedPaneId === paneId;
    const dimmed = !focused && Object.keys(tab.panes).length > 1;
    return (
      <div className={`term-pane${focused ? ' focused' : ''}`}>
        <TerminalSurface
          sessionId={pane.sessionId}
          terminalId={pane.terminalId}
          engine="restty"
          isActive
          autoResize
          className="term-surface"
          onFocus={() => focusPane(tab.id, paneId)}
          actionsRef={(actions) => {
            if (actions) paneActionsRef.current.set(paneId, actions);
          }}
        />
        {dimmed && <div className="pane-dim" />}
      </div>
    );
  };

  return (
    <AvocadoProvider backend={backend}>
      <div className="app">
        <TabBar
          tabs={tabs.map((t) => ({ id: t.id, title: shellName }))}
          activeTabId={activeTabId}
          isMac={isMac}
          onSelect={setActiveTabId}
          onClose={closeTab}
          onNew={() => void newTab()}
        />
        <div className="surface-area">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab-content${tab.id === activeTabId ? '' : ' hidden'}`}
            >
              <SplitView
                tree={tab.tree}
                renderPane={(paneId) => renderPane(tab, paneId)}
                onRatioChange={(splitId, ratio) => changeRatio(tab.id, splitId, ratio)}
              />
            </div>
          ))}
        </div>
        {error && (
          <div className="error-toast" onClick={() => setError(null)} title="Dismiss">
            {error}
          </div>
        )}
      </div>
    </AvocadoProvider>
  );
}

export default App;
