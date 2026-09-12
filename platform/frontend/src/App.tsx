import { Navigate, Route, Routes } from "react-router-dom";
import { applyTheme, currentTheme } from "./components/Chrome";
import Gallery from "./gallery/Gallery";

applyTheme(currentTheme());

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/gallery" replace />} />
      <Route path="/gallery" element={<Gallery />} />
    </Routes>
  );
}
