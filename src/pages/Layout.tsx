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
        <p>Boat Booking</p>
      </footer>
    </div>
  );
}
