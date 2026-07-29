import { Outlet } from "react-router-dom";
import "./Layout.css";
import Navbar from "../components/Navbar";
export default function Layout() {
  return (
    <div>
      <Navbar />
      <main>
        <Outlet />
      </main>

      <footer>
        <p>@2026 Coast LifeLLC</p>
      </footer>
    </div>
  );
}
