import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Masquer le loader une fois React monté
const loader = document.getElementById('app-loader');
if (loader) loader.remove();

// Afficher les icônes une fois la font Material Symbols chargée
document.fonts.ready.then(() => {
  document.documentElement.classList.add('fonts-loaded');
});
