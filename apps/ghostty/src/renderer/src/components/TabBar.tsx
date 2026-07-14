/**
 * TabBar — Ghostty-style transparent titlebar.
 *
 * Single tab: a centered window title (Ghostty's macos-titlebar-style =
 * transparent look). Multiple tabs: the titlebar becomes a compact tab
 * strip, like macOS native tabs merging into the titlebar.
 */

import type { JSX } from 'react';

export interface TabBarTab {
  id: string;
  title: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  activeTabId: string | null;
  isMac: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeTabId, isMac, onSelect, onClose, onNew }: TabBarProps): JSX.Element {
  const single = tabs.length <= 1;
  return (
    <div className={`titlebar${isMac ? ' mac' : ''}${single ? ' single' : ''}`}>
      {single ? (
        <div className="titlebar-title">{tabs[0]?.title ?? 'ghostty (avocado)'}</div>
      ) : (
        <div className="tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab${tab.id === activeTabId ? ' active' : ''}`}
              onPointerDown={() => onSelect(tab.id)}
            >
              <span className="tab-title">{tab.title}</span>
              <button
                type="button"
                className="tab-close"
                title="Close tab"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="tab-new" title="New tab (⌘T)" onClick={onNew}>
        +
      </button>
    </div>
  );
}

export default TabBar;
