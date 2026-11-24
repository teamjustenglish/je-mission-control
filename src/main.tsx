import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installErrorCatcher } from "./lib/recentErrors";

installErrorCatcher();

createRoot(document.getElementById("root")!).render(<App />);
