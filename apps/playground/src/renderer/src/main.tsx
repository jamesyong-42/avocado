/**
 * Renderer entry point for the avocado playground.
 *
 * Mounts the React tree into `#root`. Strict mode is disabled because
 * xterm.js relies on real mount/unmount semantics — React 19's double
 * effect invocation in dev would tear down and reattach the terminal on
 * every render.
 */

import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('[renderer] #root element not found in index.html');
}

const root = createRoot(container);
root.render(<App />);
