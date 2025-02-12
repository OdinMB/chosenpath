import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { StoryProvider } from "./providers/StoryProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StoryProvider>
      <App />
    </StoryProvider>
  </React.StrictMode>
);
