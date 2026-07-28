import { Routes, Route } from "react-router-dom";

import Layout from "./pages/Layout";

import AppointmentCalendar from "./pages/AppointmentCalendar";
import Login from "./pages/Login.tsx";
import OwnerDashboard from "./pages/OwnerDashboard";
import UserDashboard from "./pages/UserDashboard";
import AddBoat from "./pages/AddBoat.tsx";
import Prizes from "./pages/Prizes.tsx";
function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<AppointmentCalendar />} />
        <Route path="login" element={<Login />} />
        <Route path="owner" element={<OwnerDashboard />} />
        <Route path="add-boat" element={<AddBoat />} />
        <Route path="user" element={<UserDashboard />} />
        <Route path="prizes" element={<Prizes />} />
      </Route>
    </Routes>
  );
}

export default App;
