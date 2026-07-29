import { Outlet } from "react-router-dom";
import "./Layout.css";
import Navbar from "../components/Navbar";
import ChatWidget from "../components/ChatWidget";
export default function Layout() {
  return (
    <div>
      <Navbar />
      <main>
        <Outlet />
        <ChatWidget />
      </main>

      <footer>
        <p>@2026 Coast LifeLLC</p>
      </footer>
    </div>
  );
}
