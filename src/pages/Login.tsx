import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

export default function Login() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div style={{ padding: "2rem" }}>
          <h1>Boat Owner Dashboard</h1>

          <p>Welcome {user?.signInDetails?.loginId}</p>

          <button onClick={signOut}>Sign Out</button>
        </div>
      )}
    </Authenticator>
  );
}
