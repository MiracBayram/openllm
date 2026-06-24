import { render } from "preact";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

window.onerror = function(message, source, lineno, colno, error) {
  document.body.innerHTML = `
    <div style="color: red; padding: 20px; font-family: monospace; z-index: 99999; position: absolute; top: 0; left: 0; background: black; width: 100vw; height: 100vh;">
      <h2>FATAL GLOBAL ERROR</h2>
      <p>${message}</p>
      <p>${source}:${lineno}:${colno}</p>
      <pre>${error?.stack || ''}</pre>
    </div>
  `;
};

window.addEventListener('unhandledrejection', function(event) {
  document.body.innerHTML = `
    <div style="color: red; padding: 20px; font-family: monospace; z-index: 99999; position: absolute; top: 0; left: 0; background: black; width: 100vw; height: 100vh;">
      <h2>FATAL PROMISE ERROR</h2>
      <p>${event.reason}</p>
      <pre>${event.reason?.stack || ''}</pre>
    </div>
  `;
});

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("root") as HTMLElement
);
