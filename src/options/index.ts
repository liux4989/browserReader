import React from 'react';
import { createRoot } from 'react-dom/client';
import Options from './options';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(Options));
}