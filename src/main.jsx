import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import Router from './Router.jsx';
import { migrateImagesToIdb } from './lib/migrateImages.js';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { CurrencyProvider } from './contexts/CurrencyContext.jsx';

/* Move any legacy base64 images out of localStorage. Fire-and-forget:
   the app must render whether or not this succeeds. */
migrateImagesToIdb();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <CurrencyProvider>
        <Router />
      </CurrencyProvider>
    </ThemeProvider>
  </StrictMode>,
);
