import { Platform } from 'react-native';

// Web-only polish: no tap flashes, no rubber-banding, no browser focus rings on inputs.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('daybook-web')) {
  const style = document.createElement('style');
  style.id = 'daybook-web';
  style.textContent = [
    'html, body { overscroll-behavior: none; }',
    '* { -webkit-tap-highlight-color: transparent; }',
    'input, textarea { outline: none; caret-color: currentColor; }',
    'input::placeholder, textarea::placeholder { opacity: 1; }',
    '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; } }',
  ].join('\n');
  document.head.appendChild(style);
}
