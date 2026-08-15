import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { approveOwnerRequestFunction } from "../functions/approve-owner-request/resource";

const schema = a
  .schema({
    UserProfile: a
      .model({
        userId: a.string().required(),
        firstName: a.string(),
        lastName: a.string(),
        ownerEmail: a.email(),
        phoneNumber: a.string(),
        address: a.string(),
        city: a.string(),
        state: a.string(),
        zip: a.string(),
        age: a.integer(),
        apparelGender: a.string(),
        apparelSize: a.string(),
        rewardPoints: a.integer().default(0),
        content: a.string(),
        validatedResponse: a.string(),
      })
      .authorization((allow) => [allow.owner()]),

    ExperienceOwnerProfile: a
      .model({
        userId: a.string().required(),
        name: a.string().required(),
        email: a.email().required(),
        phone: a.string(),

        // Explicit owner field so the approval Lambda can assign
        // ownership to the approved applicant.
        owner: a.string(),

        experiences: a.hasMany("Experience", "ownerProfileId"),
        bookings: a.hasMany("Booking", "ownerProfileId"),
        calendarEvents: a.hasMany(
          "ExperienceCalendarEvent",
          "ownerProfileId",
        ),
      })
      .authorization((allow) => [
        allow.owner(),
        allow.publicApiKey().to(["read"]),
      ]),

    OwnerAccessRequest: a
      .model({
        applicantUserId: a.string().required(),
        applicantName: a.string().required(),
        applicantEmail: a.email().required(),
        applicantPhone: a.string(),
        experienceLocation: a.string().required(),
        estimatedPrice: a.float(),
        // Fixed Coast Life moderator email for now.
        // A backend function can later resolve this email to the Cognito user ID.
        moderatorEmail: a.email().required(),
        moderatorUserId: a.string(),

        businessName: a.string(),
        experienceTypes: a.string().array(),
        description: a.string(),
        experienceImageUrl: a.string(),
        status: a.enum([
          "PENDING",
          "APPROVED",
          "REJECTED",
        ]),

        moderatorNotes: a.string(),
        reviewedByUserId: a.string(),
        reviewedAt: a.datetime(),

        messages: a.hasMany(
          "OwnerAccessMessage",
          "ownerAccessRequestId",
        ),
      })
      .secondaryIndexes((index) => [
        index("applicantUserId"),
        index("moderatorUserId"),
        index("status"),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("applicantUserId"),
        allow.ownerDefinedIn("moderatorUserId"),
      ]),

    OwnerAccessMessage: a
      .model({
        ownerAccessRequestId: a.id().required(),

        ownerAccessRequest: a.belongsTo(
          "OwnerAccessRequest",
          "ownerAccessRequestId",
        ),

        applicantUserId: a.string().required(),

        // Keep the moderator email on each message so the intended
        // Coast Life moderator is always explicit.
        moderatorEmail: a.email().required(),
        moderatorUserId: a.string(),

        senderUserId: a.string().required(),

        senderRole: a.enum([
          "APPLICANT",
          "MODERATOR",
          "SYSTEM",
        ]),

        senderName: a.string(),
        message: a.string().required(),

        messageType: a.enum([
          "CHAT",
          "REQUEST_SUBMITTED",
          "REQUEST_APPROVED",
          "REQUEST_REJECTED",
        ]),

        readByApplicantAt: a.datetime(),
        readByModeratorAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index("ownerAccessRequestId"),
        index("applicantUserId"),
        index("moderatorUserId"),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("applicantUserId"),
        allow.ownerDefinedIn("moderatorUserId"),
      ]),

    Experience: a
      .model({
        name: a.string().required(),
        description: a.string(),
        location: a.string().required(),
        estimatedPrice: a.float(),
        imageUrl: a.string(),
        experienceType: a.string(),
        ownerProfileId: a.id().required(),
        ownerAccessRequestId: a.id(),
        ownerEmail: a.email(),

        // Explicit owner field so the approval Lambda can assign
        // ownership to the approved applicant.
        owner: a.string(),

        ownerProfile: a.belongsTo(
          "ExperienceOwnerProfile",
          "ownerProfileId",
        ),
        bookings: a.hasMany("Booking", "experienceId"),
        calendarEvents: a.hasMany(
          "ExperienceCalendarEvent",
          "experienceId",
        ),
      })
      .authorization((allow) => [
        allow.owner(),
        allow.publicApiKey().to(["read"]),
      ]),

    Booking: a
      .model({
        messages: a.hasMany("BookingMessage", "bookingId"),
        customerName: a.string().required(),
        customerEmail: a.email().required(),
        customerPhone: a.string(),
        customerUserId: a.string(),
        appointmentDateTime: a.datetime().required(),
        experienceId: a.id().required(),
        experience: a.belongsTo("Experience", "experienceId"),
        experienceName: a.string().required(),
        location: a.string(),
        ownerProfileId: a.id().required(),
        ownerProfile: a.belongsTo(
          "ExperienceOwnerProfile",
          "ownerProfileId",
        ),
        status: a.enum([
          "PENDING",
          "ACCEPTED",
          "REJECTED",
          "CANCELLED",
        ]),
        emailSent: a.boolean(),
        amountInCents: a.integer(),
        paymentStatus: a.string(),
        stripeCheckoutSessionId: a.string(),
        stripePaymentIntentId: a.string(),
        paymentExpiresAt: a.datetime(),
        paidAt: a.datetime(),
        refundedAt: a.datetime(),

        // Optional flag used by the Stripe webhook to prevent normal retries
        // from sending the payment confirmation email again.
        paymentConfirmationEmailSent: a.boolean(),

        owner: a.string(),
      })
      .authorization((allow) => [
        allow.ownerDefinedIn("owner"),
        allow.authenticated().to(["read", "update"]),
        allow.publicApiKey().to(["create"]),
      ]),

    BookingMessage: a
      .model({
        bookingId: a.id().required(),
        booking: a.belongsTo("Booking", "bookingId"),

        // Cognito user IDs for the two participants.
        customerUserId: a.string().required(),
        ownerUserId: a.string().required(),

        // Retained so messages can be associated with the owner's profile.
        ownerProfileId: a.id().required(),

        senderUserId: a.string(),
        senderRole: a.enum(["CUSTOMER", "OWNER", "SYSTEM"]),
        senderName: a.string(),

        message: a.string().required(),

        messageType: a.enum([
          "CHAT",
          "BOOKING_RECEIVED",
          "BOOKING_APPROVED",
          "BOOKING_REJECTED",
          "AWAITING_PAYMENT",
          "PAYMENT_RECEIVED",
          "BOOKING_CONFIRMED",
          "BOOKING_CANCELLED",
          "BOOKING_DATE_CHANGED",
          "PAYMENT_REFUNDED",
        ]),

        readByCustomerAt: a.datetime(),
        readByOwnerAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index("bookingId"),
        index("customerUserId"),
        index("ownerUserId"),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("customerUserId"),
        allow.ownerDefinedIn("ownerUserId"),
      ]),

    ExperienceCalendarEvent: a
      .model({
        experienceId: a.id().required(),
        experience: a.belongsTo("Experience", "experienceId"),
        experienceName: a.string().required(),
        ownerProfileId: a.id().required(),
        ownerProfile: a.belongsTo(
          "ExperienceOwnerProfile",
          "ownerProfileId",
        ),
        bookingId: a.id(),
        startDateTime: a.datetime().required(),
        endDateTime: a.datetime(),
        status: a.enum([
          "PENDING",
          "ACCEPTED",
          "REJECTED",
          "CANCELLED",
          "BLOCKED",
        ]),
        title: a.string(),
        notes: a.string(),
        owner: a.string(),
      })
      .secondaryIndexes((index) => [
        index("experienceId").sortKeys(["startDateTime"]),
        index("ownerProfileId").sortKeys(["startDateTime"]),
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn("owner"),
        allow.authenticated().to(["read", "update"]),
        allow.publicApiKey().to(["create", "read"]),
      ]),

    // ADDITIVE ONLY: existing models above are unchanged.
    // The moderator calls this mutation; the Lambda verifies the moderator again.
    approveOwnerRequest: a
      .mutation()
      .arguments({
        requestId: a.id().required(),
      })
      .returns(a.string().required())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(approveOwnerRequestFunction)),
  })
  // Grants only this backend function access to the Data API.
  // Existing frontend model authorization rules remain unchanged.
  .authorization((allow) => [
    allow.resource(approveOwnerRequestFunction),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});