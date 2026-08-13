import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import Stripe from "stripe";
import { env } from "$amplify/env/stripe-api";

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
  customerUserId?: string;
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
  name?: string;
  email?: string;
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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function parseRequestBody(body: string | null | undefined): BookingRequest {
  if (!body) return {};
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
  if (!headers) return undefined;
  const wanted = headerName.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function getRawRequestBody(event: ApiGatewayEvent): string {
  const body = event.body ?? "";
  if (!event.isBase64Encoded) return body;
  return Buffer.from(body, "base64").toString("utf8");
}

async function findOwnerProfileForUser(
  userId: string,
): Promise<OwnerProfileRecord | null> {
  const result = await dynamoDb.send(
    new ScanCommand({
      TableName: env.OWNER_PROFILE_TABLE_NAME,
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
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

async function findBookingByPaymentIntentId(
  paymentIntentId: string,
): Promise<BookingRecord | null> {
  const result = await dynamoDb.send(
    new ScanCommand({
      TableName: env.BOOKING_TABLE_NAME,
      FilterExpression: "stripePaymentIntentId = :paymentIntentId",
      ExpressionAttributeValues: {
        ":paymentIntentId": paymentIntentId,
      },
    }),
  );

  return (result.Items?.[0] as BookingRecord | undefined) ?? null;
}

async function getOwnerProfileById(
  ownerProfileId: string | undefined,
): Promise<OwnerProfileRecord | null> {
  if (!ownerProfileId) return null;
  const result = await dynamoDb.send(
    new GetCommand({
      TableName: env.OWNER_PROFILE_TABLE_NAME,
      Key: { id: ownerProfileId },
    }),
  );
  return (result.Item as OwnerProfileRecord | undefined) ?? null;
}

function formatPaymentEmailDateTime(value?: string) {
  if (!value) return { appointmentDate: "Not set", appointmentTime: "Not set" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { appointmentDate: value, appointmentTime: "Not set" };
  }
  return {
    appointmentDate: date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    appointmentTime: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

async function sendPaymentReceivedEmail(
  booking: BookingRecord,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (booking.paymentConfirmationEmailSent) {
    console.log(`Payment confirmation email already sent for Booking ${booking.id}.`);
    return;
  }

  const serviceId = process.env.EMAILJS_SERVICE_ID?.trim();
  const templateId = process.env.EMAILJS_TEMPLATE_ID?.trim();
  const publicKey = process.env.EMAILJS_PUBLIC_KEY?.trim();

  if (!serviceId || !templateId || !publicKey) {
    console.error(
      "Payment was received, but EmailJS is not configured for the Stripe API Lambda.",
    );
    return;
  }

  const customerEmail = booking.customerEmail?.trim();
  if (!customerEmail) {
    console.error(
      `Payment was received for Booking ${booking.id}, but no customer email is available.`,
    );
    return;
  }

  const ownerProfile = await getOwnerProfileById(booking.ownerProfileId);
  const ownerEmail = ownerProfile?.email?.trim();
  const moderatorEmail =
    process.env.COASTLIFE_MODERATOR_EMAIL?.trim() || "alan_craig@msn.com";

  const ccRecipients = [ownerEmail, moderatorEmail]
    .filter((email): email is string => Boolean(email))
    .filter(
      (email, index, all) =>
        all.findIndex(
          (candidate) => candidate.toLowerCase() === email.toLowerCase(),
        ) === index,
    )
    .join(",");

  const { appointmentDate, appointmentTime } =
    formatPaymentEmailDateTime(booking.appointmentDateTime);

  const paidAmountInCents = session.amount_total ?? booking.amountInCents ?? 0;
  const amountPaid = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (session.currency ?? "usd").toUpperCase(),
  }).format(paidAmountInCents / 100);

  const subject = "Your Coast Life Booking Payment Was Received";
  const message = [
    `Hello ${booking.customerName?.trim() || "Customer"},`,
    "",
    "Your payment has been received and your Coast Life booking is confirmed.",
    "",
    `Experience: ${booking.experienceName ?? "Not set"}`,
    `Location: ${booking.location ?? "Not set"}`,
    `Appointment Date: ${appointmentDate}`,
    `Appointment Time: ${appointmentTime}`,
    `Amount Paid: ${amountPaid}`,
    "",
    "You can sign in to Coast Life and open your User Dashboard to view your confirmed booking and messages.",
    "",
    "Thank you for booking with Coast Life.",
  ].join("\n");
console.log("PAYMENT EMAIL CONFIG:", {
  serviceId,
  templateId,
  publicKeyLast4: publicKey?.slice(-4),
  toEmail: customerEmail,
  ccEmail: ccRecipients,
});
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        subject,
        message,
        to_email: customerEmail,
        cc_email: ccRecipients,
        customer_name: booking.customerName?.trim() ?? "",
        customer_email: customerEmail,
        experience_name: booking.experienceName ?? "",
        location: booking.location ?? "",
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        booking_status: "PAID",
        payment_status: "PAID",
        amount_paid: amountPaid,
        owner_name: ownerProfile?.name?.trim() ?? "",
        owner_email: ownerEmail ?? "",
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error(
      `EmailJS payment confirmation failed (${response.status}): ${responseText}`,
    );
    return;
  }

  await dynamoDb.send(
    new UpdateCommand({
      TableName: env.BOOKING_TABLE_NAME,
      Key: { id: booking.id },
      UpdateExpression: "SET paymentConfirmationEmailSent = :sent",
      ExpressionAttributeValues: { ":sent": true },
    }),
  );

  console.log(`Payment confirmation email sent for Booking ${booking.id}.`);
}

async function sendIOSPaymentReceivedEmail(
  booking: BookingRecord,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  if (booking.paymentConfirmationEmailSent) {
    console.log(
      `Payment confirmation email already sent for Booking ${booking.id}.`,
    );
    return;
  }

  const serviceId = process.env.EMAILJS_SERVICE_ID?.trim();
  const templateId = process.env.EMAILJS_TEMPLATE_ID?.trim();
  const publicKey = process.env.EMAILJS_PUBLIC_KEY?.trim();

  if (!serviceId || !templateId || !publicKey) {
    console.error(
      "iOS payment was received, but EmailJS is not configured for the Stripe API Lambda.",
    );
    return;
  }

  const customerEmail = booking.customerEmail?.trim();

  if (!customerEmail) {
    console.error(
      `iOS payment was received for Booking ${booking.id}, but no customer email is available.`,
    );
    return;
  }

  const ownerProfile = await getOwnerProfileById(
    booking.ownerProfileId,
  );

  const ownerEmail = ownerProfile?.email?.trim();
  const moderatorEmail =
    process.env.COASTLIFE_MODERATOR_EMAIL?.trim() ||
    "alan_craig@msn.com";

  const ccRecipients = [ownerEmail, moderatorEmail]
    .filter((email): email is string => Boolean(email))
    .filter(
      (email, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.toLowerCase() === email.toLowerCase(),
        ) === index,
    )
    .join(",");

  const { appointmentDate, appointmentTime } =
    formatPaymentEmailDateTime(
      booking.appointmentDateTime,
    );

  const paidAmountInCents =
    paymentIntent.amount_received > 0
      ? paymentIntent.amount_received
      : paymentIntent.amount;

  const amountPaid = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: paymentIntent.currency.toUpperCase(),
  }).format(paidAmountInCents / 100);

  const subject =
    "Your Coast Life Payment Was Accepted — Booking Confirmed";

  const message = [
    `Hello ${booking.customerName?.trim() || "Customer"},`,
    "",
    "Your payment has been accepted and your Coast Life booking is confirmed.",
    "",
    `Experience: ${booking.experienceName ?? "Not set"}`,
    `Location: ${booking.location ?? "Not set"}`,
    `Appointment Date: ${appointmentDate}`,
    `Appointment Time: ${appointmentTime}`,
    `Amount Paid: ${amountPaid}`,
    "",
    "Your booking is now confirmed.",
    "",
    "You can sign in to Coast Life and open My Bookings to view your confirmed booking.",
    "",
    "Thank you for booking with Coast Life.",
  ].join("\n");

  console.log("IOS PAYMENT EMAIL CONFIG:", {
    serviceId,
    templateId,
    publicKeyLast4: publicKey?.slice(-4),
    customerEmailFromBooking: booking.customerEmail,
    toEmail: customerEmail,
    ownerEmail,
    moderatorEmail,
    ccEmail: ccRecipients,
    bookingId: booking.id,
    paymentIntentId: paymentIntent.id,
  });

  const response = await fetch(
    "https://api.emailjs.com/api/v1.0/email/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          subject,
          message,
          to_email: customerEmail,
          cc_email: ccRecipients,
          customer_name:
            booking.customerName?.trim() ?? "",
          customer_email: customerEmail,
          experience_name:
            booking.experienceName ?? "",
          location: booking.location ?? "",
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          booking_status: "CONFIRMED",
          payment_status: "PAID",
          amount_paid: amountPaid,
          owner_name:
            ownerProfile?.name?.trim() ?? "",
          owner_email: ownerEmail ?? "",
          stripe_payment_intent_id:
            paymentIntent.id,
        },
      }),
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      `EmailJS iOS payment confirmation failed (${response.status}): ${responseText}`,
    );
    return;
  }

  await dynamoDb.send(
    new UpdateCommand({
      TableName: env.BOOKING_TABLE_NAME,
      Key: { id: booking.id },
      UpdateExpression:
        "SET paymentConfirmationEmailSent = :sent",
      ExpressionAttributeValues: {
        ":sent": true,
      },
    }),
  );

  console.log(
    `iOS payment confirmation email sent for Booking ${booking.id}.`,
  );
}

async function validateBookingForOwner(event: ApiGatewayEvent): Promise<
  | { response: ApiGatewayResponse; ownerProfile?: never; booking?: never }
  | { response?: never; ownerProfile: OwnerProfileRecord; booking: BookingRecord }
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
        message: error instanceof Error ? error.message : "The request body is invalid.",
      }),
    };
  }

  const bookingId = request.bookingId?.trim();
  if (!bookingId) {
    return {
      response: jsonResponse(400, { success: false, message: "bookingId is required." }),
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
      response: jsonResponse(404, { success: false, message: "The booking could not be found." }),
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
      response: jsonResponse(409, { success: false, message: "This booking has already been paid." }),
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

  if (!Number.isInteger(booking.amountInCents) || (booking.amountInCents ?? 0) <= 0) {
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

async function validateBookingForCustomer(event: ApiGatewayEvent): Promise<
  | { response: ApiGatewayResponse; booking?: never }
  | { response?: never; booking: BookingRecord }
> {
  const signedInUserId = event.requestContext?.authorizer?.claims?.sub;
  if (!signedInUserId) {
    return {
      response: jsonResponse(401, {
        success: false,
        message: "The signed-in customer could not be identified.",
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
        message: error instanceof Error ? error.message : "The request body is invalid.",
      }),
    };
  }

  const bookingId = request.bookingId?.trim();
  if (!bookingId) {
    return {
      response: jsonResponse(400, { success: false, message: "bookingId is required." }),
    };
  }

  const booking = await getBooking(bookingId);
  if (!booking) {
    return {
      response: jsonResponse(404, { success: false, message: "The booking could not be found." }),
    };
  }

  if (!booking.customerUserId) {
    return {
      response: jsonResponse(403, {
        success: false,
        message: "This older booking is not linked to a customer account.",
      }),
    };
  }

  if (booking.customerUserId !== signedInUserId) {
    return {
      response: jsonResponse(403, {
        success: false,
        message: "This booking does not belong to the signed-in customer.",
      }),
    };
  }

  if (booking.status !== "ACCEPTED") {
    return {
      response: jsonResponse(409, {
        success: false,
        message: "The booking must be accepted before payment can begin.",
        currentStatus: booking.status ?? null,
      }),
    };
  }

  if (booking.paymentStatus === "PAID") {
    return {
      response: jsonResponse(409, { success: false, message: "This booking has already been paid." }),
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

  if (!Number.isInteger(booking.amountInCents) || (booking.amountInCents ?? 0) <= 0) {
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

  return { booking };
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
  if (validation.response) return validation.response;
  return jsonResponse(200, {
    success: true,
    message: "The booking is eligible for Stripe payment.",
    booking: safeBookingResponse(validation.booking),
  });
}

async function createOrReuseCheckoutSession(
  booking: BookingRecord,
): Promise<ApiGatewayResponse> {
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
      console.warn("The previous Stripe Checkout Session could not be reused.", error);
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
      customerUserId: booking.customerUserId ?? "",
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
              ? `Booking for ${new Date(booking.appointmentDateTime).toLocaleString("en-US")}`
              : "Coast Life booking",
          },
        },
      },
    ],
    success_url:
      `${appUrl}/booking/payment-success?bookingId=${encodeURIComponent(
        booking.id,
      )}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:
      `${appUrl}/?payment=cancelled&bookingId=${encodeURIComponent(booking.id)}`,
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
    console.error("Stripe Session was created but could not be saved to the Booking.", error);
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (expireError: unknown) {
      console.error("The untracked Stripe Session could not be expired.", expireError);
    }
    return jsonResponse(500, {
      success: false,
      message: "The Stripe Session was created, but the Booking could not be updated.",
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

async function handleCreateCheckoutSession(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const validation = await validateBookingForOwner(event);
  if (validation.response) return validation.response;
  return createOrReuseCheckoutSession(validation.booking);
}

async function handleCustomerCreateCheckoutSession(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const validation = await validateBookingForCustomer(event);
  if (validation.response) return validation.response;
  return createOrReuseCheckoutSession(validation.booking);
}

async function handleIOSCreatePaymentIntent(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const validation = await validateBookingForCustomer(event);
  if (validation.response) return validation.response;

  const booking = validation.booking;

  if (booking.stripePaymentIntentId) {
    try {
      const existingIntent = await stripe.paymentIntents.retrieve(
        booking.stripePaymentIntentId,
      );

      if (
        existingIntent.status !== "succeeded" &&
        existingIntent.status !== "canceled" &&
        existingIntent.client_secret
      ) {
        return jsonResponse(200, {
          success: true,
          message: "Existing Stripe PaymentIntent reused.",
          clientSecret: existingIntent.client_secret,
          paymentIntentId: existingIntent.id,
          amountInCents: booking.amountInCents ?? null,
          currency: existingIntent.currency.toUpperCase(),
          reused: true,
        });
      }
    } catch (error: unknown) {
      console.warn("Existing PaymentIntent could not be reused.", error);
    }
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: booking.amountInCents!,
    currency: "usd",
    automatic_payment_methods: { enabled: true },
    metadata: {
      bookingId: booking.id,
      experienceId: booking.experienceId ?? "",
      ownerProfileId: booking.ownerProfileId ?? "",
      customerUserId: booking.customerUserId ?? "",
    },
    description: booking.experienceName
      ? `Coast Life - ${booking.experienceName}`
      : "Coast Life Experience",
  });

  if (!paymentIntent.client_secret) {
    return jsonResponse(502, {
      success: false,
      message: "Stripe did not return a PaymentIntent client secret.",
    });
  }

  try {
    await dynamoDb.send(
      new UpdateCommand({
        TableName: env.BOOKING_TABLE_NAME,
        Key: { id: booking.id },
        UpdateExpression: "SET stripePaymentIntentId = :paymentIntentId",
        ExpressionAttributeValues: {
          ":paymentIntentId": paymentIntent.id,
        },
      }),
    );
  } catch (error: unknown) {
    console.error(
      "PaymentIntent was created but could not be saved to the Booking.",
      error,
    );
    try {
      await stripe.paymentIntents.cancel(paymentIntent.id);
    } catch (cancelError: unknown) {
      console.error("Untracked PaymentIntent could not be cancelled.", cancelError);
    }
    return jsonResponse(500, {
      success: false,
      message:
        "The Stripe PaymentIntent was created, but the Booking could not be updated.",
    });
  }

  console.log("iOS PaymentIntent created.", {
    bookingId: booking.id,
    amountInCents: booking.amountInCents,
    paymentIntentId: paymentIntent.id,
  });

  return jsonResponse(200, {
    success: true,
    message: "Stripe PaymentIntent created.",
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amountInCents: booking.amountInCents ?? null,
    currency: "USD",
    reused: false,
  });
}

async function handleIOSConfirmPayment(
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> {
  const signedInUserId = event.requestContext?.authorizer?.claims?.sub;
  if (!signedInUserId) {
    return jsonResponse(401, {
      success: false,
      message: "The signed-in customer could not be identified.",
    });
  }

  let request: BookingRequest;
  try {
    request = parseRequestBody(event.body);
  } catch (error: unknown) {
    return jsonResponse(400, {
      success: false,
      message:
        error instanceof Error ? error.message : "The request body is invalid.",
    });
  }

  const bookingId = request.bookingId?.trim();
  if (!bookingId) {
    return jsonResponse(400, {
      success: false,
      message: "bookingId is required.",
    });
  }

  const booking = await getBooking(bookingId);
  if (!booking) {
    return jsonResponse(404, {
      success: false,
      message: "The booking could not be found.",
    });
  }

  if (!booking.customerUserId || booking.customerUserId !== signedInUserId) {
    return jsonResponse(403, {
      success: false,
      message: "This booking does not belong to the signed-in customer.",
    });
  }

  if (booking.status !== "ACCEPTED") {
    return jsonResponse(409, {
      success: false,
      message: "The booking must be accepted before payment can be confirmed.",
      currentStatus: booking.status ?? null,
    });
  }

  const paymentIntentId = booking.stripePaymentIntentId?.trim();
  if (!paymentIntentId) {
    return jsonResponse(409, {
      success: false,
      message: "This booking does not have a Stripe PaymentIntent to confirm.",
    });
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.metadata?.bookingId !== booking.id) {
    return jsonResponse(409, {
      success: false,
      message: "The Stripe PaymentIntent is not associated with this booking.",
    });
  }

  if (
    booking.amountInCents != null &&
    paymentIntent.amount !== booking.amountInCents
  ) {
    return jsonResponse(409, {
      success: false,
      message: "The Stripe PaymentIntent amount does not match the booking amount.",
    });
  }

  if (paymentIntent.currency.toLowerCase() !== "usd") {
    return jsonResponse(409, {
      success: false,
      message: "The Stripe PaymentIntent currency does not match the booking currency.",
    });
  }

  if (paymentIntent.status !== "succeeded") {
    return jsonResponse(409, {
      success: false,
      message: "Stripe has not confirmed this payment as successful yet.",
      paymentIntentId: paymentIntent.id,
      stripeStatus: paymentIntent.status,
    });
  }

  console.log("iOS confirm payment: Stripe verified succeeded PaymentIntent.", {
    bookingId: booking.id,
    paymentIntentId: paymentIntent.id,
    stripeStatus: paymentIntent.status,
  });

  const paidBooking = await markBookingPaidFromPaymentIntent(paymentIntent);
  if (!paidBooking) {
    return jsonResponse(409, {
      success: false,
      message: "Stripe payment could not be confirmed for this booking.",
    });
  }

  // Send the customer payment/booking confirmation email.
  // This helper is idempotent because it checks paymentConfirmationEmailSent.
  await sendIOSPaymentReceivedEmail(
    paidBooking,
    paymentIntent,
  );

  return jsonResponse(200, {
    success: true,
    message: "Payment verified with Stripe and the booking was marked PAID.",
    booking: {
      id: paidBooking.id,
      paymentStatus: paidBooking.paymentStatus ?? "PAID",
      stripePaymentIntentId: paidBooking.stripePaymentIntentId ?? paymentIntent.id,
      paidAt: paidBooking.paidAt ?? null,
    },
  });
}

async function markBookingPaid(
  session: Stripe.Checkout.Session,
): Promise<BookingRecord | null> {
  const bookingId =
    session.metadata?.bookingId ?? session.client_reference_id ?? undefined;

  if (!bookingId) {
    throw new Error(`Stripe Session ${session.id} does not contain a bookingId.`);
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

async function markBookingPaidFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): Promise<BookingRecord | null> {
  if (paymentIntent.status !== "succeeded") {
    console.log(
      `Ignoring PaymentIntent ${paymentIntent.id} because status is ${paymentIntent.status}.`,
    );
    return null;
  }

  const metadataBookingId =
    paymentIntent.metadata?.bookingId?.trim() || undefined;

  let booking: BookingRecord | null = null;

  if (metadataBookingId) {
    booking = await getBooking(metadataBookingId);

    console.log("iOS webhook lookup by metadata bookingId.", {
      paymentIntentId: paymentIntent.id,
      bookingId: metadataBookingId,
      found: Boolean(booking),
    });
  }

  // Fallback to the PaymentIntent ID already saved on Booking.
  if (!booking) {
    booking = await findBookingByPaymentIntentId(paymentIntent.id);

    console.log("iOS webhook fallback lookup by PaymentIntent ID.", {
      paymentIntentId: paymentIntent.id,
      bookingId: booking?.id ?? null,
      found: Boolean(booking),
    });
  }

  if (!booking) {
    throw new Error(
      `No Booking could be found for PaymentIntent ${paymentIntent.id}.`,
    );
  }

  const bookingId = booking.id;

  if (
    booking.stripePaymentIntentId &&
    booking.stripePaymentIntentId !== paymentIntent.id
  ) {
    throw new Error(
      `PaymentIntent ${paymentIntent.id} does not match the PaymentIntent saved on Booking ${bookingId}.`,
    );
  }

  if (
    booking.paymentStatus !== "AWAITING_PAYMENT" &&
    booking.paymentStatus !== "PAID"
  ) {
    throw new Error(
      `Booking ${bookingId} cannot be marked paid because paymentStatus is ${booking.paymentStatus ?? "null"}.`,
    );
  }

  const paidAt = booking.paidAt ?? new Date().toISOString();

  console.log("iOS webhook: updating Booking to PAID.", {
    bookingId,
    paymentIntentId: paymentIntent.id,
    currentPaymentStatus: booking.paymentStatus ?? null,
  });

  await dynamoDb.send(
    new UpdateCommand({
      TableName: env.BOOKING_TABLE_NAME,
      Key: { id: bookingId },
      UpdateExpression:
        "SET paymentStatus = :paid, stripePaymentIntentId = :paymentIntentId, paidAt = :paidAt REMOVE paymentExpiresAt",
      ConditionExpression:
        "#paymentStatus = :awaitingPayment OR #paymentStatus = :paid",
      ExpressionAttributeNames: {
        "#paymentStatus": "paymentStatus",
      },
      ExpressionAttributeValues: {
        ":paid": "PAID",
        ":awaitingPayment": "AWAITING_PAYMENT",
        ":paymentIntentId": paymentIntent.id,
        ":paidAt": paidAt,
      },
    }),
  );

  const updatedBooking = await getBooking(bookingId);

  console.log("iOS webhook: Booking after update.", {
    bookingId,
    paymentStatus: updatedBooking?.paymentStatus ?? null,
    stripePaymentIntentId:
      updatedBooking?.stripePaymentIntentId ?? null,
    paidAt: updatedBooking?.paidAt ?? null,
  });

  return (
    updatedBooking ?? {
      ...booking,
      paymentStatus: "PAID",
      stripePaymentIntentId: paymentIntent.id,
      paidAt,
    }
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
          await sendPaymentReceivedEmail(paidBooking, session);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent =
          stripeEvent.data.object as Stripe.PaymentIntent;

        console.log("======================================");
        console.log("IOS PAYMENT_INTENT.SUCCEEDED WEBHOOK");
        console.log("Event ID:", stripeEvent.id);
        console.log("PaymentIntent ID:", paymentIntent.id);
        console.log("Status:", paymentIntent.status);
        console.log("Metadata:", paymentIntent.metadata);
        console.log("======================================");

        const paidBooking =
          await markBookingPaidFromPaymentIntent(paymentIntent);

        if (paidBooking) {
          console.log(
            `iOS payment completed for Booking ${paidBooking.id}.`,
          );

          // Webhook backup: send the same confirmation email if the
          // ios-confirm-payment route has not already sent it.
          await sendIOSPaymentReceivedEmail(
            paidBooking,
            paymentIntent,
          );
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
    return jsonResponse(500, {
      success: false,
      message: "The Stripe webhook could not update the Booking.",
    });
  }

  return jsonResponse(200, { received: true });
}

export const handler = async (
  event: ApiGatewayEvent,
): Promise<ApiGatewayResponse> => {
  console.log("Stripe REST API invoked.", {
    method: event.httpMethod,
    path: event.path,
  });

  console.log("LAMBDA RUNTIME IDENTITY:", {
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
    logStream: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
    serviceId: process.env.EMAILJS_SERVICE_ID,
    templateId: process.env.EMAILJS_TEMPLATE_ID,
    publicKeyLast4: process.env.EMAILJS_PUBLIC_KEY?.slice(-4),
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
      event.path?.endsWith("/ios-create-payment-intent")
    ) {
      return await handleIOSCreatePaymentIntent(event);
    }

    if (
      event.httpMethod === "POST" &&
      event.path?.endsWith("/ios-confirm-payment")
    ) {
      return await handleIOSConfirmPayment(event);
    }

    if (
      event.httpMethod === "POST" &&
      event.path?.endsWith("/customer-create-checkout-session")
    ) {
      return await handleCustomerCreateCheckoutSession(event);
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

    if (
      event.httpMethod === "GET" &&
      event.path?.endsWith("/stripe-test")
    ) {
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