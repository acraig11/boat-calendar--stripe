import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut } from "aws-amplify/auth";

function Navbar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkLogin();
  }, []);

  async function checkLogin() {
    try {
      await getCurrentUser();
      setLoggedIn(true);
    } catch {
      setLoggedIn(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
      setLoggedIn(false);
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  return (
    <header>
      <div className="logo">
        <img src="/images/logo2.png" alt="Coast Life" />
      </div>

      <nav className="nav">
        <Link to="/">Home</Link>
        <Link to="/contact">Contact</Link>
        <Link to="/booking">Booking</Link>
        <Link to="/owner">Owner Dashboard</Link>
        <Link to="/user">User Dashboard</Link>
        <Link to="/freeMerchandise">Free Merchandise</Link>

        {loggedIn ? (
          <Link
            to="/"
            onClick={async (event) => {
              event.preventDefault();
              await handleLogout();
            }}
          >
            Logout
          </Link>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </nav>
    </header>
  );
}

export default Navbar;