import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import Stripe from "stripe";
import { env } from "$amplify/env/stripe-api";

type StripeApiEnvironment = typeof env & {
  EMAILJS_SERVICE_ID: string;
  EMAILJS_TEMPLATE_ID: string;
  EMAILJS_PUBLIC_KEY: string;
};

const functionEnv = env as StripeApiEnvironment;

type ApiGatewayEvent = {
  httpMethod?: string;
  path?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined> | null;
  queryStringParameters?: Record<string, string | undefined> | null;
  requestContext?: {
    authorizer?: {
      claims?: Record<string, string>;
    };
  };
};

type ApiGatewayResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type BookingRequest = {
  bookingId?: string;
};

type BookingRecord = {
  id: string;
  customerName?: string;
  customerEmail?: string;
  appointmentDateTime?: string;
  experienceId?: string;
  experienceName?: string;
  location?: string;
  ownerProfileId?: string;
  status?: string;
  amountInCents?: number;
  paymentStatus?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  paymentExpiresAt?: string;
  paidAt?: string;
  paymentConfirmationEmailSent?: boolean;
};

type OwnerProfileRecord = {
  id: string;
  userId?: string;
};

const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const stripe = new Stripe(env.STRIPE_SECRET_KEY);

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
): ApiGatewayResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "http://localhost:5173",
    },
    body: JSON.stringify(body),
  };
}

function parseRequestBody(body: string | null | undefined): BookingRequest {
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body) as BookingRequest;
  } catch {
    throw new Error("The request body must be valid JSON.");
  }
}

function getHeader(
  headers: Record<string, string | undefined> | null | undefined,
  headerName: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  const wanted = headerName.toLowerCase();

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === wanted) {
      return value;
    }
  }

  return undefined;
}

function getRawRequestBody(event: ApiGatewayEvent): string {
  const body = event.body ?? "";

  if (!event.isBase64Encoded) {
    return body;
  }

  return Buffer.from(body, "base64").toString("utf8");
}

async function findOwnerProfileForUser(
  userId: string,
): Promise<OwnerProfileRecord | null> {
  const result = await dynamoDb.send(
    new ScanCommand({
      TableName: env.OWNER_PROFILE_TABLE_NAME,
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ProjectionExpression: "id, userId",
    }),
  );

  return (result.Items?.[0] as OwnerProfileRecord | undefined) ?? null;
}

async function getBooking(bookingId: string): Promise<BookingRecord | null> {
  const result = await dynamoDb.send(
    new GetCommand({
      TableName: env.BOOKING_TABLE_NAME,
      Key: { id: bookingId },
    }),
  );

  return (result.Item as BookingRecord | undefined) ?? null;
}

async function validateBookingForOwner(event: ApiGatewayEvent): Promise<
  | {
      response: ApiGatewayResponse;
      ownerProfile?: never;
      booking?: never;
    }
  | {
      response?: never;
      ownerProfile: OwnerProfileRecord;
      booking: BookingRecord;
    }
> {
  const signedInUserId = event.requestContext?.authorizer?.claims?.sub;

  if (!signedInUserId) {
    return {
      response: jsonResponse(401, {
        success: false,
        message: "The signed-in user could not be identified.",
      }),
    };
  }

  let request: BookingRequest;

  try {
    request = parseRequestBody(event.body);
  } catch (error: unknown) {
    return {
      response: jsonResponse(400, {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "The request body is invalid.",
      }),
    };
  }

  const bookingId = request.bookingId?.trim();

  if (!bookingId) {
    return {
      response: jsonResponse(400, {
        success: false,
        message: "bookingId is required.",
      }),
    };
  }

  const [ownerProfile, booking] = await Promise.all([
    findOwnerProfileForUser(signedInUserId),
    getBooking(bookingId),
  ]);

  if (!ownerProfile) {
    return {
      response: jsonResponse(403, {
        success: false,
        message: "No owner profile matches the signed-in user.",
      }),
    };
  }

  if (!booking) {
    return {
      response: jsonResponse(404, {
        success: false,
        message: "The booking could not be found.",
      }),
    };
  }

  if (booking.ownerProfileId !== ownerProfile.id) {
    return {
      response: jsonResponse(403, {
        success: false,
        message: "This booking does not belong to the signed-in owner.",
      }),
    };
  }

  if (booking.status !== "ACCEPTED") {
    return {
      response: jsonResponse(409, {
        success: false,
        message: "The owner must approve the booking before payment can begin.",
        currentStatus: booking.status ?? null,
      }),
    };
  }

  if (booking.paymentStatus === "PAID") {
    return {
      response: jsonResponse(409, {
        success: false,
        message: "This booking has already been paid.",
      }),
    };
  }

  if (booking.paymentStatus !== "AWAITING_PAYMENT") {
    return {
      response: jsonResponse(409, {
        success: false,
        message: "This booking is not awaiting payment.",
        currentPaymentStatus: booking.paymentStatus ?? null,
      }),
    };
  }

  if (
    !Number.isInteger(booking.amountInCents) ||
    (booking.amountInCents ?? 0) <= 0
  ) {
    return {
      response: jsonResponse(409, {
        success: false,
        message: "The booking does not have a valid payment amount.",
      }),
    };
  }

  if (!booking.customerEmail) {
    return {
      response: jsonResponse(409, {
        success: false,
        message: "The booking does not have a customer email address.",
      }),
    };
  }

  return { ownerProfile, booking };
}

function safeBookingResponse(booking: BookingRecord) {
  return {
    id: booking.id,
    customerName: booking.customerName ?? null,
    customerEmail: booking.customerEmail ?? null,
    appointmentDateTime: booking.appointmentDateTime ?? null,
    experienceId: booking.experienceId ?? null,
    experienceName: booking.experienceName ?? null,
    location: booking.location ?? null,
    ownerProfileId: booking.ownerProfileId ?? null,
    status: booking.status ?? null,
    amountInCents: booking.amountInCents ?? null,
    paymentStatus: booking.paymentStatus ?? null,
  };
}

async function handleBookingPaymentDetails(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const validation = await validateBookingForOwner(event);

  if (validation.response) {
    return validation.response;
  }

  return jsonResponse(200, {
    success: true,
    message: "The booking is eligible for Stripe payment.",
    booking: safeBookingResponse(validation.booking),
  });
}

async function handleCreateCheckoutSession(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const validation = await validateBookingForOwner(event);

  if (validation.response) {
    return validation.response;
  }

  const booking = validation.booking;

  if (booking.stripeCheckoutSessionId) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(
        booking.stripeCheckoutSessionId,
      );

      if (existingSession.status === "open" && existingSession.url) {
        return jsonResponse(200, {
          success: true,
          message: "The existing Stripe Checkout link is still active.",
          checkoutUrl: existingSession.url,
          sessionId: existingSession.id,
          expiresAt: existingSession.expires_at
            ? new Date(existingSession.expires_at * 1000).toISOString()
            : null,
          reused: true,
        });
      }
    } catch (error: unknown) {
      console.warn(
        "The previous Stripe Checkout Session could not be reused.",
        error,
      );
    }
  }

  const appUrl = env.APP_URL.replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: booking.customerEmail,
    client_reference_id: booking.id,
    metadata: {
      bookingId: booking.id,
      experienceId: booking.experienceId ?? "",
      ownerProfileId: booking.ownerProfileId ?? "",
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: booking.amountInCents,
          product_data: {
            name: booking.experienceName ?? "Coast Life Experience",
            description: booking.appointmentDateTime
              ? `Booking for ${new Date(
                  booking.appointmentDateTime,
                ).toLocaleString("en-US")}`
              : "Coast Life booking",
          },
        },
      },
    ],
    success_url: `${appUrl}/booking/payment-success?bookingId=${encodeURIComponent(
      booking.id,
    )}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/?payment=cancelled&bookingId=${encodeURIComponent(
      booking.id,
    )}`,
  });

  if (!session.url) {
    return jsonResponse(502, {
      success: false,
      message: "Stripe did not return a Checkout payment URL.",
    });
  }

  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;

  try {
    await dynamoDb.send(
      new UpdateCommand({
        TableName: env.BOOKING_TABLE_NAME,
        Key: { id: booking.id },
        UpdateExpression:
          "SET stripeCheckoutSessionId = :sessionId, paymentExpiresAt = :expiresAt",
        ExpressionAttributeValues: {
          ":sessionId": session.id,
          ":expiresAt": expiresAt,
        },
      }),
    );
  } catch (error: unknown) {
    console.error(
      "Stripe Session was created but could not be saved to the Booking.",
      error,
    );

    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (expireError: unknown) {
      console.error(
        "The untracked Stripe Session could not be expired.",
        expireError,
      );
    }

    return jsonResponse(500, {
      success: false,
      message:
        "The Stripe Session was created, but the Booking could not be updated.",
    });
  }

  return jsonResponse(200, {
    success: true,
    message: "Stripe Checkout payment link created.",
    checkoutUrl: session.url,
    sessionId: session.id,
    expiresAt,
    reused: false,
  });
}

function formatWebhookAppointment(appointmentDateTime: string | undefined): {
  appointmentDate: string;
  appointmentTime: string;
} {
  if (!appointmentDateTime) {
    return {
      appointmentDate: "Not set",
      appointmentTime: "Not set",
    };
  }

  const appointment = new Date(appointmentDateTime);

  if (Number.isNaN(appointment.getTime())) {
    return {
      appointmentDate: appointmentDateTime,
      appointmentTime: "Not set",
    };
  }

  return {
    appointmentDate: appointment.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    appointmentTime: appointment.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

async function sendPaymentConfirmationEmail(
  booking: BookingRecord,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const recipientEmail =
    booking.customerEmail?.trim() ??
    session.customer_details?.email?.trim() ??
    session.customer_email?.trim();

  if (!recipientEmail) {
    throw new Error(
      `Booking ${booking.id} does not have a customer email address.`,
    );
  }

  const { appointmentDate, appointmentTime } = formatWebhookAppointment(
    booking.appointmentDateTime,
  );

  const amountPaidInCents = session.amount_total ?? booking.amountInCents ?? 0;

  const amountPaid = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountPaidInCents / 100);

  const subject = "Payment Received — Your Coast Life Booking Is Confirmed";

  const message = [
    `Hello ${booking.customerName?.trim() || "Customer"},`,
    "",
    "We received your payment.",
    "Your Coast Life booking is now confirmed.",
    "",
    `Experience: ${booking.experienceName || "Not set"}`,
    `Location: ${booking.location || "Not set"}`,
    `Appointment Date: ${appointmentDate}`,
    `Appointment Time: ${appointmentTime}`,
    `Amount Paid: ${amountPaid}`,
    "",
    "Thank you. We look forward to seeing you.",
  ].join("\n");

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: functionEnv.EMAILJS_SERVICE_ID,
      template_id: functionEnv.EMAILJS_TEMPLATE_ID,
      user_id: functionEnv.EMAILJS_PUBLIC_KEY,
      template_params: {
        subject,
        message,

        to_email: recipientEmail,
        cc_email: "alan_craig@msn.com",

        customer_name: booking.customerName?.trim() ?? "",
        customer_email: recipientEmail,

        experience_name: booking.experienceName ?? "",
        location: booking.location ?? "",

        appointment_date: appointmentDate,
        appointment_time: appointmentTime,

        booking_status: "CONFIRMED",
        payment_status: "PAID",
        amount_paid: amountPaid,
        stripe_checkout_session_id: session.id,
      },
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      `EmailJS payment confirmation failed. Status: ${response.status}. ${responseText}`,
    );
  }

  console.log(`Payment confirmation email sent for Booking ${booking.id}.`);
}

async function markBookingPaid(
  session: Stripe.Checkout.Session,
): Promise<BookingRecord | null> {
  const bookingId =
    session.metadata?.bookingId ?? session.client_reference_id ?? undefined;

  if (!bookingId) {
    throw new Error(
      `Stripe Session ${session.id} does not contain a bookingId.`,
    );
  }

  if (session.payment_status !== "paid") {
    console.log(
      `Ignoring Session ${session.id} because payment_status is ${session.payment_status}.`,
    );
    return null;
  }

  const booking = await getBooking(bookingId);

  if (!booking) {
    throw new Error(`Booking ${bookingId} could not be found.`);
  }

  if (
    booking.stripeCheckoutSessionId &&
    booking.stripeCheckoutSessionId !== session.id
  ) {
    throw new Error(
      `Stripe Session ${session.id} does not match the Session saved on Booking ${bookingId}.`,
    );
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const paidAt = booking.paidAt ?? new Date().toISOString();

  await dynamoDb.send(
    new UpdateCommand({
      TableName: env.BOOKING_TABLE_NAME,
      Key: { id: bookingId },
      UpdateExpression:
        "SET paymentStatus = :paid, stripePaymentIntentId = :paymentIntentId, paidAt = :paidAt REMOVE paymentExpiresAt",
      ConditionExpression:
        "stripeCheckoutSessionId = :checkoutSessionId AND (#paymentStatus = :awaitingPayment OR #paymentStatus = :paid)",
      ExpressionAttributeNames: {
        "#paymentStatus": "paymentStatus",
      },
      ExpressionAttributeValues: {
        ":paid": "PAID",
        ":awaitingPayment": "AWAITING_PAYMENT",
        ":checkoutSessionId": session.id,
        ":paymentIntentId": paymentIntentId,
        ":paidAt": paidAt,
      },
    }),
  );

  console.log(`Booking ${bookingId} marked PAID from Session ${session.id}.`);

  return {
    ...booking,
    paymentStatus: "PAID",
    stripePaymentIntentId: paymentIntentId ?? undefined,
    paidAt,
  };
}

async function sendConfirmationEmailIfNeeded(
  booking: BookingRecord,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (booking.paymentConfirmationEmailSent) {
    console.log(
      `Payment confirmation email was already sent for Booking ${booking.id}.`,
    );
    return;
  }

  await sendPaymentConfirmationEmail(booking, session);

  await dynamoDb.send(
    new UpdateCommand({
      TableName: env.BOOKING_TABLE_NAME,
      Key: { id: booking.id },
      UpdateExpression: "SET paymentConfirmationEmailSent = :emailSent",
      ConditionExpression:
        "stripeCheckoutSessionId = :checkoutSessionId AND paymentStatus = :paid",
      ExpressionAttributeValues: {
        ":emailSent": true,
        ":checkoutSessionId": session.id,
        ":paid": "PAID",
      },
    }),
  );
}

async function handlePaymentSuccessDetails(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const bookingId = event.queryStringParameters?.bookingId?.trim() ?? "";
  const sessionId = event.queryStringParameters?.session_id?.trim() ?? "";

  if (!bookingId || !sessionId) {
    return jsonResponse(400, {
      success: false,
      message: "bookingId and session_id are required.",
    });
  }

  const booking = await getBooking(bookingId);

  if (!booking) {
    return jsonResponse(404, {
      success: false,
      message: "The booking could not be found.",
    });
  }

  if (booking.stripeCheckoutSessionId !== sessionId) {
    return jsonResponse(403, {
      success: false,
      message: "The Checkout Session does not match this booking.",
    });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const sessionBookingId =
    session.metadata?.bookingId ?? session.client_reference_id ?? "";

  if (sessionBookingId !== bookingId) {
    return jsonResponse(403, {
      success: false,
      message: "Stripe did not associate this Session with the booking.",
    });
  }

  if (session.payment_status !== "paid" && booking.paymentStatus !== "PAID") {
    return jsonResponse(409, {
      success: false,
      message: "Payment confirmation is still processing.",
    });
  }

  return jsonResponse(200, {
    success: true,
    message: "Payment received. Your booking is confirmed.",
    booking: {
      id: booking.id,
      experienceName: booking.experienceName ?? null,
      location: booking.location ?? null,
      amountInCents: session.amount_total ?? booking.amountInCents ?? null,
      currency: session.currency?.toUpperCase() ?? "USD",
      paymentStatus: "PAID",
    },
  });
}

async function handleStripeWebhook(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const signature = getHeader(event.headers, "stripe-signature");

  if (!signature) {
    return jsonResponse(400, {
      success: false,
      message: "The Stripe-Signature header is missing.",
    });
  }

  const payload = getRawRequestBody(event);

  let stripeEvent: Stripe.Event;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error: unknown) {
    console.error("Stripe webhook signature verification failed:", error);

    return jsonResponse(400, {
      success: false,
      message: "Stripe webhook signature verification failed.",
    });
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;

        const paidBooking = await markBookingPaid(session);

        if (paidBooking) {
          await sendConfirmationEmailIfNeeded(paidBooking, session);
        }

        break;
      }

      default:
        console.log(`Ignoring Stripe event ${stripeEvent.type}.`);
    }
  } catch (error: unknown) {
    console.error(
      `Stripe webhook processing failed for event ${stripeEvent.id}:`,
      error,
    );

    // A non-2xx response causes Stripe to retry the event.
    return jsonResponse(500, {
      success: false,
      message: "The Stripe webhook could not update the Booking.",
    });
  }

  return jsonResponse(200, {
    received: true,
  });
}

export const handler = async (
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> => {
  console.log("Stripe REST API invoked.", {
    method: event.httpMethod,
    path: event.path,
  });

  try {
    if (
      event.httpMethod === "GET" &&
      event.path?.endsWith("/payment-success-details")
    ) {
      return await handlePaymentSuccessDetails(event);
    }

    if (
      event.httpMethod === "POST" &&
      event.path?.endsWith("/stripe-webhook")
    ) {
      return await handleStripeWebhook(event);
    }

    if (
      event.httpMethod === "POST" &&
      event.path?.endsWith("/create-checkout-session")
    ) {
      return await handleCreateCheckoutSession(event);
    }

    if (
      event.httpMethod === "POST" &&
      event.path?.endsWith("/booking-payment-details")
    ) {
      return await handleBookingPaymentDetails(event);
    }

    if (event.httpMethod === "GET" && event.path?.endsWith("/stripe-test")) {
      const userEmail =
        event.requestContext?.authorizer?.claims?.email ?? "signed-in owner";

      return jsonResponse(200, {
        success: true,
        message: "The authenticated Stripe REST API is working.",
        userEmail,
      });
    }

    return jsonResponse(404, {
      success: false,
      message: "The requested Stripe API route was not found.",
    });
  } catch (error: unknown) {
    console.error("Stripe REST API error:", error);

    return jsonResponse(500, {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "The Stripe REST API request failed.",
    });
  }
};
