import { Routes, Route } from "react-router-dom";

import Layout from "./pages/Layout";

import AppointmentCalendar from "./pages/AppointmentCalendar";
import Login from "./pages/Login.tsx";
import OwnerDashboard from "./pages/OwnerDashboard";
import UserDashboard from "./pages/UserDashboard";
import OfferExperiences from "./pages/OfferExperiences.tsx";
import Prizes from "./pages/Prizes.tsx";
import Home from "./pages/Home.tsx";
import Partner from "./pages/Partner.tsx";
import Contact from "./pages/Contact.tsx";
import FreeMerch from "./pages/FreeMerch.tsx";

import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancelled from "./pages/PaymentCancelled";
function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="Booking" element={<AppointmentCalendar />} />
        <Route path="owner" element={<OwnerDashboard />} />
        <Route path="contact" element={<Contact />} />
        <Route path="freeMerchandise" element={<FreeMerch />} />
        <Route path="user" element={<UserDashboard />} />
        <Route path="prizes" element={<Prizes />} />
        <Route path="partner" element={<Partner />} />
      <Route path="offer-experiences"element={<OfferExperiences />}/>
       <Route path="/booking/payment-success"element={<PaymentSuccess />}/>
       <Route path="/booking/payment-cancelled"element={<PaymentCancelled />}/> 
      </Route>
    </Routes>
  );
}

export default App;
