import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Fade out the boot splash from index.html once React has painted.
requestAnimationFrame(() => {
  const el = document.getElementById("splash");
  if (!el) return;
  window.setTimeout(() => { el.style.opacity = "0"; window.setTimeout(() => el.remove(), 500); }, 250);
});
