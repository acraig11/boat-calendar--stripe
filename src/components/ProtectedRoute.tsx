import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser } from "aws-amplify/auth";

type ProtectedRouteProps = {
  children: ReactNode;
};

export default function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const location = useLocation();

  const [authState, setAuthState] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >("checking");

  useEffect(() => {
    let active = true;

    async function checkAuthentication() {
      try {
        const currentUser = await getCurrentUser();

        console.log("ProtectedRoute authenticated user:", {
          userId: currentUser.userId,
          email: currentUser.signInDetails?.loginId,
        });

        if (active) {
          setAuthState("authenticated");
        }
      } catch (error) {
        console.log("ProtectedRoute: no signed-in user.", error);

        if (active) {
          setAuthState("unauthenticated");
        }
      }
    }

    void checkAuthentication();

    return () => {
      active = false;
    };
  }, []);

  if (authState === "checking") {
    return <p>Checking sign-in status...</p>;
  }

  if (authState === "unauthenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          returnTo: location.pathname,
        }}
      />
    );
  }

  return <>{children}</>;
}