import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/nunito';
import './index.css';
import App from './App';
import { ThemeProvider } from './kit/theme';
import { AppProvider } from './lib/useApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </ThemeProvider>
  </React.StrictMode>
);
