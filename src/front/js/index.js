// src/front/js/index.js
import React from 'react';
import ReactDOM from 'react-dom';
import Layout from './layout';

// Styles
import '../styles/theme.css';
import '../styles/index.css';
import '../styles/variables.css';

// Check if using React 18 or older
const container = document.getElementById('root') || document.getElementById('app');

if (container) {
  // Try React 18 first
  if (ReactDOM.createRoot) {
    const root = ReactDOM.createRoot(container);
    root.render(<Layout />);
  } else {
    // Fallback for React 17
    ReactDOM.render(<Layout />, container);
  }
} else {
  console.error('No root element found! Looking for #root or #app');
}