import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import outputs from "../../amplify_outputs.json";

type PaymentDetails = {
  experienceName?: string | null;
  location?: string | null;
  amountInCents?: number | null;
  currency?: string | null;
};

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("bookingId");
  const sessionId = searchParams.get("session_id");

  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [message, setMessage] = useState("Confirming your payment...");

  useEffect(() => {
    async function loadDetails() {
      if (!bookingId || !sessionId) {
        setMessage("The payment confirmation link is incomplete.");
        return;
      }

      const endpoint = outputs.custom?.API?.stripeRestApi?.endpoint;

      if (!endpoint) {
        setMessage("The payment confirmation service is unavailable.");
        return;
      }

      try {
        const url = new URL(
          `${endpoint.replace(/\/$/, "")}/payment-success-details`,
        );
        url.searchParams.set("bookingId", bookingId);
        url.searchParams.set("session_id", sessionId);

        const response = await fetch(url);
        const result = (await response.json()) as {
          message?: string;
          booking?: PaymentDetails;
        };

        if (!response.ok || !result.booking) {
          throw new Error(result.message || "Payment could not be confirmed.");
        }

        setDetails(result.booking);
        setMessage(result.message || "Payment received.");
      } catch (error: unknown) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Payment could not be confirmed.",
        );
      }
    }

    void loadDetails();
  }, [bookingId, sessionId]);

  return (
    <main className="payment-result-page">
      <section className="payment-result-card">
        <h1>{details ? "Payment Received" : "Payment Confirmation"}</h1>
        <p>{message}</p>

        {details?.experienceName && (
          <p><strong>Experience:</strong> {details.experienceName}</p>
        )}

        {details?.location && (
          <p><strong>Location:</strong> {details.location}</p>
        )}

        {details?.amountInCents != null && (
          <p>
            <strong>Amount Paid:</strong>{" "}
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: details.currency ?? "USD",
            }).format(details.amountInCents / 100)}
          </p>
        )}

        <p>A confirmation message has been sent please check your messages in the dashboard.</p>
        <Link to="/">Return Home</Link>
      </section>
    </main>
  );
}
