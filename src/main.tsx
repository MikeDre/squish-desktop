import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import { Droplet } from "./components/Droplet";

function resolveLabel(): string {
  try {
    // `.label` is a synchronous property on the current webview window.
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

const Root = resolveLabel() === "droplet" ? Droplet : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
