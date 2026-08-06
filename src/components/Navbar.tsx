import { Link } from "react-router-dom";
import "./navbar.css";
function Navbar() {
  return (
    <div>
      <header>
        <div className="logo">
          <img src="/images/logo2.png" alt="logo2" />
        </div>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/booking">Book Experiences</Link>
          <Link to="/owner">Owner Dashboard</Link>
          <Link to="/user"> Rewards User Dashboard</Link>
          <Link to="/freeMerchandise">Free Merchandise</Link>
        </nav>
      </header>
    </div>
  );
}

export default Navbar;
