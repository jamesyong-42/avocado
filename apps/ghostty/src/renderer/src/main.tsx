/**
 * Renderer entry — mounts the React tree.
 *
 * Strict mode is off: terminal engines rely on real mount/unmount
 * semantics; React's dev double-invoke would tear terminals down on
 * every mount (same convention as apps/playground).
 */

import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('[renderer] #root element not found in index.html');
}

createRoot(container).render(<App />);
