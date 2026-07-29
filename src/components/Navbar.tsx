import { Link } from "react-router-dom";
function Navbar() {
  return (
    <div>
      <header>
        <div className="logo">
          <img src="/images/logo2.png" alt="logo2" />
        </div>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/booking">Booking</Link>
          <Link to="/login">Login</Link>{" "}
          <Link to="/owner">Owner Dashboard</Link>
          <Link to="/user">User Dashboard</Link>
          <Link to="/prizes">Prizes</Link>
          <Link to="/partner">Partner</Link>
        </nav>
      </header>
    </div>
  );
}

export default Navbar;
