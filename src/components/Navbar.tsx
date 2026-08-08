import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import "./navbar.css";
const client = generateClient<Schema>();

const MODERATOR_USER_ID =
  "14588428-20f1-706f-f6d7-308f21156444";

function Navbar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    void checkLogin();

    const stopListening = Hub.listen("auth", ({ payload }) => {
      console.log("Navbar auth event:", payload.event);

      switch (payload.event) {
        case "signedIn":
          void checkLogin();
          break;

        case "signedOut":
          setLoggedIn(false);
          setIsOwner(false);
          setIsCheckingAuth(false);
          break;
      }
    });

    return () => stopListening();
  }, []);

  async function checkLogin() {
    try {
      setIsCheckingAuth(true);

      const currentUser = await getCurrentUser();

      setLoggedIn(true);

      if (currentUser.userId === MODERATOR_USER_ID) {
        setIsOwner(true);
        return;
      }

      const [ownerProfileResult, ownerRequestResult] =
        await Promise.all([
          client.models.ExperienceOwnerProfile.list({
            filter: {
              userId: { eq: currentUser.userId },
            },
          }),
          client.models.OwnerAccessRequest.list({
            filter: {
              applicantUserId: { eq: currentUser.userId },
            },
          }),
        ]);

      const latestRequest =
        [...ownerRequestResult.data].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() -
            new Date(a.updatedAt).getTime(),
        )[0] ?? null;

      setIsOwner(
        ownerProfileResult.data.length > 0 ||
          latestRequest?.status === "APPROVED",
      );
    } catch {
      setLoggedIn(false);
      setIsOwner(false);
    } finally {
      setIsCheckingAuth(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
      setLoggedIn(false);
      setIsOwner(false);
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
        <Link className="nav-link" to="/">
          Home
        </Link>

        <Link className="nav-link" to="/contact">
          Contact
        </Link>

        <Link className="nav-link" to="/booking">
          Experiences
        </Link>

        <Link className="nav-link" to="/freeMerchandise">
          Free Merchandise
        </Link>

        {!isCheckingAuth && loggedIn && (
          <Link className="nav-link" to="/user">
            User Dashboard
          </Link>
        )}

        {!isCheckingAuth && loggedIn && isOwner && (
          <Link className="nav-link" to="/owner">
            Experience-Owner Dashboard
          </Link>
        )}

        {!isCheckingAuth &&
          (loggedIn ? (
            <Link
              className="nav-link"
              to="/"
              onClick={async (event) => {
                event.preventDefault();
                await handleLogout();
              }}
            >
              Logout
            </Link>
          ) : (
            <Link className="nav-link" to="/login">
              Login
            </Link>
          ))}
      </nav>
    </header>
  );
}

export default Navbar;