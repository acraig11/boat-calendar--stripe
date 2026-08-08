import { useEffect } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useLocation, useNavigate } from "react-router-dom";

function LoginContent({
  signOut,
  user,
}: {
  signOut?: () => void;
  user?: {
    signInDetails?: {
      loginId?: string;
    };
  };
}) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) {
      return;
    }

    const state = location.state as
      | {
          returnTo?: string;
        }
      | null;

    const returnTo = state?.returnTo || "/";

    navigate(returnTo, {
      replace: true,
    });
  }, [user, location.state, navigate]);

  return (
    <div style={{ padding: "2rem" }}>
      Welcome {user?.signInDetails?.loginId}

      <button onClick={signOut}>
        Sign Out
      </button>
    </div>
  );
}

export default function Login() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <LoginContent
          signOut={signOut}
          user={user}
        />
      )}
    </Authenticator>
  );
}