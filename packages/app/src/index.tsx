import { createRoot } from "react-dom/client";
import App from "./app";
import { Router, useRouter } from "./router";
import { CharacterPage } from "./character/character-page";

function Root() {
  const { path } = useRouter();

  if (path === "/character") {
    return <CharacterPage />;
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <Router>
    <Root />
  </Router>,
);
