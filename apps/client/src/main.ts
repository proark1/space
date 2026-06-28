import './ui/landing.css';
import { mountLandingPage } from './ui/LandingPage';

const el = document.getElementById('app');
if (el) mountLandingPage(el);
