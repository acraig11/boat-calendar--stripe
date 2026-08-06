import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>();

type Destination = "/owner" | "/user" | null;

export default function DashboardRedirect() {
  const [destination, setDestination] =
    useState<Destination>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function determineDashboard() {
      try {
        const currentUser = await getCurrentUser();

        console.log(
          "DashboardRedirect - signed in user:",
          currentUser.userId,
        );

        const ownerResult =
          await client.models.ExperienceOwnerProfile.list({
            filter: {
              userId: {
                eq: currentUser.userId,
              },
            },
          });

        if (ownerResult.errors?.length) {
          throw new Error(
            ownerResult.errors
              .map((error) => error.message)
              .join(", "),
          );
        }

        const isOwner = ownerResult.data.length > 0;

        console.log("DashboardRedirect - isOwner:", isOwner);

        if (!isMounted) {
          return;
        }

        setDestination(isOwner ? "/owner" : "/user");
      } catch (error) {
        console.error("Dashboard redirect failed:", error);

        if (!isMounted) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "Unable to determine account type.",
        );
      }
    }

    void determineDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  if (error) {
    return (
      <main
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "60vh",
          padding: "2rem",
        }}
      >
        <div>
          <h2>Unable to load your dashboard</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!destination) {
    return (
      <main
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "60vh",
        }}
      >
        <h2>Loading your dashboard...</h2>
      </main>
    );
  }

  return <Navigate to={destination} replace />;
}