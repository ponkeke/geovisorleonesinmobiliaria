import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SessionTransitionProvider } from './components/SessionTransition.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
      <SessionTransitionProvider><App /></SessionTransitionProvider>
  </BrowserRouter>
);
