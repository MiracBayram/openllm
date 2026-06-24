import { render } from 'preact';
import { GhostHud } from './GhostHud';
import './App.css'; // Get the same CSS variables

render(<GhostHud />, document.getElementById('root') as HTMLElement);
