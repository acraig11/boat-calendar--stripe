import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateClient } from "aws-amplify/api";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

const client = generateClient();

const keywordsURL =
  "https://raw.githubusercontent.com/acraig11/coast-life-user-content/main/required_keywords.txt";
const validationPointsURL =
  "https://raw.githubusercontent.com/acraig11/coast-life-user-content/main/validation_points.txt";

const fallbackKeywords = ["like", "love", "favorite", "feel"];
const minWordsRequired = 7;
const fallbackPointsPerValidation = 10;

const createUserProfile = /* GraphQL */ `
  mutation CreateUserProfile($input: CreateUserProfileInput!) {
    createUserProfile(input: $input) {
      id
      content
      rewardPoints
      validatedResponse
      createdAt
      updatedAt
    }
  }
`;

const listUserProfiles = /* GraphQL */ `
  query ListUserProfiles {
    listUserProfiles {
      items {
        id
        rewardPoints
      }
    }
  }
`;

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

function FreeMerch() {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [requiredKeywords, setRequiredKeywords] =
    useState<string[]>(fallbackKeywords);
  const [totalPoints, setTotalPoints] = useState(0);
  const [pointsPerValidation, setPointsPerValidation] = useState(
    fallbackPointsPerValidation,
  );

  async function checkLogin() {
    try {
      const session = await fetchAuthSession();
      setIsLoggedIn(!!session.tokens);
    } catch {
      setIsLoggedIn(false);
    }
  }

  function parseKeywords(raw: string): string[] {
    const normalized = raw.replaceAll('"', "").replaceAll("\r", "\n");

    const pieces = normalized.includes(",")
      ? normalized.split(",")
      : normalized.split("\n");

    const cleaned = pieces
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return Array.from(new Set(cleaned));
  }

  async function refreshKeywords() {
    try {
      const response = await fetch(keywordsURL);
      const text = await response.text();

      const parsed = parseKeywords(text);
      setRequiredKeywords(parsed.length > 0 ? parsed : fallbackKeywords);
    } catch {
      setRequiredKeywords(fallbackKeywords);
    }
  }

  async function loadValidationPoints(): Promise<number> {
    const cacheBustedURL = `${validationPointsURL}?t=${Date.now()}`;

    try {
      const response = await fetch(cacheBustedURL, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = (await response.text()).trim();
      const parsed = Number(raw);

      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(
          `validation_points.txt must contain only a whole number. Received: "${raw}"`,
        );
      }

      console.log("Validation points loaded from GitHub:", parsed);
      setPointsPerValidation(parsed);
      return parsed;
    } catch (error) {
      console.error("Failed to load validation points:", error);
      throw error;
    }
  }

  async function loadPoints() {
    try {
      const result: any = await client.graphql({
        query: listUserProfiles,
      });

      const items = result.data.listUserProfiles.items ?? [];

      const total = items.reduce(
        (sum: number, item: any) => sum + (item.rewardPoints ?? 0),
        0,
      );

      setTotalPoints(total);
    } catch (error) {
      console.error("Failed to load points:", error);
    }
  }

  function wordCount(text: string) {
    return text.split(/[^A-Za-z0-9]+/).filter(Boolean).length;
  }

  function containsRequiredKeyword(text: string) {
    const lower = text.toLowerCase();
    return requiredKeywords.some((keyword) => lower.includes(keyword));
  }

  async function addRewardPoints(validatedText: string, pointsToAward: number) {
    const currentUser = await getCurrentUser();

    const result: any = await client.graphql({
      query: createUserProfile,
      variables: {
        input: {
          userId: currentUser.userId,
          content: "Rewards",
          rewardPoints: pointsToAward,
          validatedResponse: validatedText,
        },
      },
    });

    if (result.errors?.length) {
      throw new Error(
        result.errors
          .map((error: { message: string }) => error.message)
          .join(", "),
      );
    }
  }

  async function send() {
    const text = input.trim();
    if (!text) return;

    const words = wordCount(text);

    if (words < minWordsRequired) {
      setErrorText(`Please enter at least ${minWordsRequired} words.`);
      return;
    }

    if (!containsRequiredKeyword(text)) {
      setErrorText(
        `Please include at least one of these words: ${requiredKeywords.join(
          ", ",
        )}.`,
      );
      return;
    }

    try {
      setIsSending(true);
      setErrorText(null);

      const currentValidationPoints = await loadValidationPoints();
      await addRewardPoints(text, currentValidationPoints);
      await loadPoints();

      setMessages((old) => [
        ...old,
        {
          id: crypto.randomUUID(),
          role: "user",
          text,
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Thanks for your input! Your message has been received, and your points have been added to your total.",
        },
      ]);

      setInput("");
    } catch (error) {
      console.error("Reward save error:", error);
      setErrorText(
        "Your message was valid, but the current validation points could not be loaded or saved.",
      );
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    checkLogin();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      void refreshKeywords();
      void loadValidationPoints().catch(() => {
        setErrorText("Could not load validation points from GitHub.");
      });
      void loadPoints();
    }
  }, [isLoggedIn]);

  if (isLoggedIn === null) {
    return (
      <main style={{ padding: "20px", textAlign: "center" }}>Loading...</main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#f8fafc",
          padding: "20px",
        }}
      >
        <div
          style={{
            background: "white",
            padding: "32px",
            borderRadius: "20px",
            boxShadow: "0 8px 20px rgba(0,0,0,.12)",
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <h1 style={{ marginTop: 0 }}>🎁 Coast Life Rewards</h1>

          <p style={{ color: "#6b7280", fontSize: "17px" }}>
            Please log in to view your rewards and earn merchandise points.
          </p>

          <button
            onClick={() => navigate("/login")}
            style={{
              marginTop: "18px",
              width: "100%",
              padding: "14px",
              border: "none",
              borderRadius: "12px",
              background: "#14b8a6",
              color: "white",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Go To Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: "20px",
        maxWidth: "900px",
        margin: "0 auto",
        background: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #0f766e, #14b8a6)",
          color: "white",
          padding: "24px",
          borderRadius: "20px",
          marginBottom: "24px",
          boxShadow: "0 8px 20px rgba(0,0,0,.15)",
        }}
      >
        <h1 style={{ margin: 0 }}>🎁 Coast Life Rewards</h1>

        <p
          style={{
            marginTop: "10px",
            opacity: 0.9,
            fontSize: "18px",
          }}
        >
          Share your thoughts and earn merchandise points.
        </p>

        <div
          style={{
            marginTop: "18px",
            fontSize: "26px",
            fontWeight: 700,
          }}
        >
          +{pointsPerValidation} Points Per Submission
        </div>

        <div
          style={{
            marginTop: "20px",
            display: "inline-block",
            background: "rgba(255,255,255,.18)",
            padding: "14px 22px",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,.2)",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "1px",
              opacity: 0.85,
            }}
          >
            Current Balance
          </div>

          <div
            style={{
              fontSize: "34px",
              fontWeight: 800,
              lineHeight: 1,
              marginTop: "4px",
            }}
          >
            {totalPoints}
          </div>

          <div
            style={{
              fontSize: "14px",
              opacity: 0.9,
              marginTop: "4px",
            }}
          >
            Reward Points
          </div>
        </div>
      </div>

      <div
        onClick={() => navigate("/prizes")}
        style={{
          background: "#fff",
          borderRadius: "16px",
          padding: "18px",
          marginBottom: "24px",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>🏆 Redeem Prizes</h3>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
            View available merchandise rewards
          </p>
        </div>

        <div style={{ fontSize: "24px" }}>→</div>
      </div>

      {messages.length > 0 && (
        <section style={{ marginBottom: "20px" }}>
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: "flex",
                justifyContent:
                  message.role === "user" ? "flex-end" : "flex-start",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: "12px 16px",
                  borderRadius: "18px",
                  background: message.role === "user" ? "#14b8a6" : "#f3f4f6",
                  color: message.role === "user" ? "white" : "#111827",
                  boxShadow: "0 2px 6px rgba(0,0,0,.06)",
                }}
              >
                {message.text}
              </div>
            </div>
          ))}
        </section>
      )}

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "18px",
          boxShadow: "0 4px 12px rgba(0,0,0,.08)",
          marginTop: "20px",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Tell Us What You Think</h3>

        <p style={{ color: "#6b7280" }}>
          Minimum {minWordsRequired} words. Include one of:{" "}
          {requiredKeywords.join(", ")}.
        </p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          placeholder="Tell us what you like about Coast Life..."
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #d1d5db",
            fontSize: "16px",
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
          }}
        />

        <div
          style={{
            textAlign: "right",
            marginTop: "8px",
            color: "#6b7280",
            fontSize: "14px",
          }}
        >
          {wordCount(input)} / {minWordsRequired} words
        </div>

        {errorText && (
          <p
            style={{
              color: "#b91c1c",
              background: "#fee2e2",
              padding: "10px 12px",
              borderRadius: "10px",
            }}
          >
            {errorText}
          </p>
        )}

        <button
          onClick={send}
          disabled={isSending}
          style={{
            marginTop: "16px",
            width: "100%",
            padding: "14px",
            border: "none",
            borderRadius: "12px",
            background: isSending ? "#94a3b8" : "#14b8a6",
            color: "white",
            fontSize: "16px",
            fontWeight: 600,
            cursor: isSending ? "not-allowed" : "pointer",
          }}
        >
          {isSending ? "Submitting..." : `Earn ${pointsPerValidation} Points`}
        </button>
      </div>
    </main>
  );
}

export default FreeMerch;