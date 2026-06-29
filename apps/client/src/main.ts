import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/landing.css';
import { AdminPage } from './ui/AdminPage';
import { LandingPage } from './ui/LandingPage';
import { useNet } from './ui/store';

const el = document.getElementById('app');
const isAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

window.addEventListener('keydown', (event) => {
  if (event.key === '`' || event.key === '~') useNet.getState().toggleDebug();
});

document.title = isAdmin ? 'SIGNAL LOST — Asset Admin' : 'SIGNAL LOST — Co-op Horror Panic Simulator';
if (el) createRoot(el).render(createElement(isAdmin ? AdminPage : LandingPage));
