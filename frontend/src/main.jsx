import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initAuth } from './lib/pb.js';
import './styles.css';

initAuth().finally(() => {
  createRoot(document.getElementById('root')).render(<App />);
});
