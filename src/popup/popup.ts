import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './popup.tsx';
import './popup.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(Popup));
}