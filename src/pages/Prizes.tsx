import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/api";
import { getCurrentUser } from "aws-amplify/auth";
import emailjs from "@emailjs/browser";

import prizeHat from "../assets/prize_hat.jpeg";
import prizeSweater from "../assets/prize_sweater.jpeg";
import prizeBag from "../assets/prize_bag.jpeg";
import prizeVacation from "../assets/prize_vacation.jpeg";

const client = generateClient();

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
const PRIZE_REDEMPTION_EMAIL =
  import.meta.env.VITE_PRIZE_REDEMPTION_EMAIL || "alan_craig@msn.com";

type Prize = {
  id: string;
  title: string;
  pointsNeeded: number;
  imageName: string;
  description: string;
  badge?: string;
};

const prizes: Prize[] = [
  {
    id: "hat",
    title: "Coast Life Hat",
    pointsNeeded: 500,
    imageName: prizeHat,
    description:
      "Classic Coast Life cap. Great for beach days, boat days, and everyday wear.",
    badge: "Most Popular",
  },
  {
    id: "sweater",
    title: "Coast Life Sweater",
    pointsNeeded: 1000,
    imageName: prizeSweater,
    description:
      "Soft, zippered sweater with collar & Coast Life branding. Perfect for the Coast or the gym.",
    badge: "Best Value",
  },
  {
    id: "bag",
    title: "Coast Life Bag",
    pointsNeeded: 1500,
    imageName: prizeBag,
    description: "Coast Life branded Carhartt duffle bag.",
    badge: "Premium",
  },
  {
    id: "vacation",
    title: "Coast Life Vacation Experience",
    pointsNeeded: 15000,
    imageName: prizeVacation,
    description:
      "Authentic Coast Life vacation experience: stay and play in the sun and water, up to 5 people per trip.",
    badge: "Premium",
  },
];

const listTodos = /* GraphQL */ `
  query ListTodos {
    listTodos {
      items {
        id
        userId
        content
        rewardPoints
        ownerEmail
        firstName
        lastName
        phoneNumber
        address
        city
        state
        zip
        age
        apparelSize
        apparelGender
        createdAt
        updatedAt
      }
    }
  }
`;

const createTodo = /* GraphQL */ `
  mutation CreateTodo($input: CreateTodoInput!) {
    createTodo(input: $input) {
      id
      content
      rewardPoints
      createdAt
      updatedAt
    }
  }
`;

function Prizes() {
  const [availablePoints, setAvailablePoints] = useState(0);
  const [status, setStatus] = useState("Loading points...");
  const [profile, setProfile] = useState<any | null>(null);

  const [isRedeeming, setIsRedeeming] = useState(false);

  async function loadPoints() {
    try {
      const currentUser = await getCurrentUser();
      const result: any = await client.graphql({ query: listTodos });
      const allRecords = result.data.listTodos.items ?? [];

      const signedInEmail =
        currentUser.signInDetails?.loginId?.trim().toLowerCase() ?? "";

      // Reward records should belong to the signed-in user.
      const userRecords = allRecords.filter(
        (record: any) => record.userId === currentUser.userId,
      );

      const points = userRecords.reduce(
        (sum: number, record: any) => sum + Number(record.rewardPoints ?? 0),
        0,
      );

      const hasProfileFields = (record: any) =>
        Boolean(
          record.firstName ||
          record.lastName ||
          record.ownerEmail ||
          record.phoneNumber ||
          record.address ||
          record.city ||
          record.state ||
          record.zip ||
          record.apparelSize ||
          record.apparelGender,
        );

      // First try userId. Older profile records may not have userId,
      // so fall back to matching the signed-in email.
      const profileRecords = allRecords.filter((record: any) => {
        if (!hasProfileFields(record)) {
          return false;
        }

        const recordEmail = String(record.ownerEmail ?? "")
          .trim()
          .toLowerCase();

        return (
          record.userId === currentUser.userId ||
          (signedInEmail !== "" && recordEmail === signedInEmail)
        );
      });

      const latestProfile =
        [...profileRecords].sort(
          (a: any, b: any) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0] ?? null;

      setAvailablePoints(points);
      setProfile(latestProfile);

      setStatus(
        latestProfile
          ? "Points and profile loaded."
          : "Points loaded, but no matching profile record was found.",
      );

      console.log("Signed-in user:", {
        userId: currentUser.userId,
        email: signedInEmail,
      });
      console.log("Matching profile:", latestProfile);
    } catch (error) {
      console.error("Error loading points:", error);
      setStatus("Could not load points.");
    }
  }

  async function sendRedemptionEmail(prize: Prize) {
    if (!profile) {
      throw new Error("Profile not found.");
    }

    const currentUser = await getCurrentUser();
    const remainingPoints = availablePoints - prize.pointsNeeded;
    const fullName =
      `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
    console.log("emaildata", {
      prize_title: prize.title,
      points_redeemed: prize.pointsNeeded,
      current_points: availablePoints,
      remaining_points: remainingPoints,
      customer_name: fullName,
      customer_email: profile.ownerEmail,
      customer_phone: profile.phoneNumber,
      customer_address: profile.address,
      customer_city: profile.city,
      customer_state: profile.state,
      customer_zip: profile.zip,
      customer_age: profile.age,
      apparel_size: profile.apparelSize,
      apparel_gender: profile.apparelGender,
    });
    const message = `
Prize Redemption Request

Prize: ${prize.title}
Points Redeemed: ${prize.pointsNeeded}
Current Points: ${availablePoints}
Remaining Points: ${remainingPoints}

Name: ${fullName || "Not set"}
Email: ${profile.ownerEmail ?? "Not set"}
Phone: ${profile.phoneNumber ?? "Not set"}
Address: ${profile.address ?? "Not set"}
City: ${profile.city ?? "Not set"}
State: ${profile.state ?? "Not set"}
ZIP: ${profile.zip ?? "Not set"}
Age: ${profile.age ?? "Not set"}
Apparel Size: ${profile.apparelSize ?? "Not set"}
Apparel Gender: ${profile.apparelGender ?? "Not set"}
`.trim();
    console.log("Constructed email message:", message);
    const result = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email: PRIZE_REDEMPTION_EMAIL,
        subject: "Redeem Prize Request",
        message,
        customer_name: fullName || "Not set",
        customer_email: profile.ownerEmail ?? "Not set",
      },
      EMAILJS_PUBLIC_KEY,
    );

    if (result.status !== 200) {
      throw new Error(
        `EmailJS failed. Status: ${result.status}, Text: ${result.text}`,
      );
    }
    // Email succeeded, now deduct points

    await client.graphql({
      query: createTodo,
      variables: {
        input: {
          userId: currentUser.userId,
          content: `Redeemed: ${prize.title} (${prize.pointsNeeded} pts)`,
          rewardPoints: -prize.pointsNeeded,
        },
      },
    });

    await loadPoints();

    alert(`${prize.title} redeemed successfully.`);
  }

  async function handleRedeem(prize: Prize) {
    if (availablePoints < prize.pointsNeeded) {
      alert("Not enough points to redeem this prize.");
      return;
    }

    if (!profile) {
      alert("Profile not found. Please create/update your profile first.");
      return;
    }

    try {
      setIsRedeeming(true);
      setStatus(`Sending redemption email for ${prize.title}...`);

      await sendRedemptionEmail(prize);

      setStatus("Redemption email sent. Please confirm to deduct points.");
    } catch (error: unknown) {
      console.error("Prize redemption error:", error);

      const errorStatus =
        typeof error === "object" && error !== null && "status" in error
          ? String(error.status)
          : "Unknown";

      const errorText =
        typeof error === "object" && error !== null && "text" in error
          ? String(error.text)
          : error instanceof Error
            ? error.message
            : "Unknown error";

      console.error("Error status:", errorStatus);
      console.error("Error text:", errorText);

      alert(`Could not send redemption email: ${errorText}`);
      setStatus("Could not send redemption email.");
    } finally {
      setIsRedeeming(false);
    }
  }

  useEffect(() => {
    loadPoints();
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <h1 style={styles.title}>Prizes</h1>
        <p style={styles.subtitle}>Redeem your points for Coast Life gear.</p>

        <div style={styles.pointsBox}>
          <strong>Available Points:</strong> {availablePoints}
        </div>

        <p style={styles.status}>{status}</p>
      </section>

      <section style={styles.list}>
        {prizes.map((prize) => (
          <PrizeCard
            key={prize.id}
            prize={prize}
            availablePoints={availablePoints}
            isRedeeming={isRedeeming}
            onRedeem={handleRedeem}
          />
        ))}
      </section>
    </main>
  );
}

function PrizeCard({
  prize,
  availablePoints,
  isRedeeming,
  onRedeem,
}: {
  prize: Prize;
  availablePoints: number;
  isRedeeming: boolean;
  onRedeem: (prize: Prize) => void;
}) {
  const canRedeem = availablePoints >= prize.pointsNeeded && !isRedeeming;

  return (
    <article style={styles.card}>
      <img src={prize.imageName} alt={prize.title} style={styles.image} />

      <div style={styles.cardBody}>
        <div style={styles.cardTop}>
          <h2 style={styles.prizeTitle}>{prize.title}</h2>
          <span style={styles.points}>{prize.pointsNeeded} pts</span>
        </div>

        <p style={styles.description}>{prize.description}</p>

        {prize.badge && <p style={styles.badge}>{prize.badge}</p>}

        <button
          type="button"
          onClick={() => onRedeem(prize)}
          disabled={!canRedeem}
          style={{
            ...styles.redeemButton,
            opacity: canRedeem ? 1 : 0.45,
            cursor: canRedeem ? "pointer" : "not-allowed",
          }}
        >
          {isRedeeming
            ? "Processing..."
            : canRedeem
              ? "Redeem"
              : "Not Enough Points"}
        </button>
      </div>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "20px 16px",
    background: "#f2f2f7",
  },
  header: {
    marginBottom: "14px",
  },
  title: {
    fontSize: "34px",
    fontWeight: 800,
    margin: 0,
  },
  subtitle: {
    color: "#666",
    marginTop: "6px",
    fontSize: "15px",
  },
  pointsBox: {
    marginTop: "12px",
    padding: "12px",
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid rgba(0,0,0,0.06)",
    fontSize: "18px",
  },
  status: {
    color: "#666",
    fontSize: "13px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    paddingBottom: "20px",
  },
  card: {
    display: "flex",
    gap: "12px",
    padding: "12px",
    background: "#fff",
    borderRadius: "18px",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  image: {
    width: "92px",
    height: "92px",
    objectFit: "cover",
    borderRadius: "14px",
    border: "1px solid rgba(0,0,0,0.06)",
    background: "#ddd",
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
  },
  prizeTitle: {
    fontSize: "17px",
    fontWeight: 700,
    margin: 0,
    flex: 1,
  },
  points: {
    fontSize: "14px",
    fontWeight: 700,
    padding: "5px 10px",
    borderRadius: "999px",
    background: "rgba(0,0,0,0.06)",
    whiteSpace: "nowrap",
  },
  description: {
    fontSize: "13px",
    color: "#666",
    lineHeight: 1.35,
    margin: "6px 0 0",
  },
  badge: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#666",
    margin: "8px 0 0",
  },
  redeemButton: {
    marginTop: "10px",
    padding: "8px 12px",
    borderRadius: "10px",
    border: "none",
    fontWeight: 700,
    background: "#e5e5ea",
  },
  confirmBox: {
    marginTop: "20px",
    padding: "16px",
    background: "#fff",
    borderRadius: "16px",
    border: "1px solid rgba(0,0,0,0.1)",
  },
  confirmButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "none",
    fontWeight: 700,
    marginRight: "8px",
  },
  cancelButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    fontWeight: 700,
  },
};

export default Prizes;
