import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
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

      experiences: a.hasMany("Experience", "ownerProfileId"),

      bookings: a.hasMany("Booking", "ownerProfileId"),

      calendarEvents: a.hasMany("ExperienceCalendarEvent", "ownerProfileId"),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.publicApiKey().to(["read"]),
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

      ownerProfile: a.belongsTo("ExperienceOwnerProfile", "ownerProfileId"),

      bookings: a.hasMany("Booking", "experienceId"),

      calendarEvents: a.hasMany("ExperienceCalendarEvent", "experienceId"),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.publicApiKey().to(["read"]),
    ]),

  Booking: a
    .model({
      customerName: a.string().required(),
      customerEmail: a.email().required(),
      customerPhone: a.string(),

      appointmentDateTime: a.datetime().required(),

      experienceId: a.id().required(),

      experience: a.belongsTo("Experience", "experienceId"),

      experienceName: a.string().required(),
      location: a.string(),

      ownerProfileId: a.id().required(),

      ownerProfile: a.belongsTo("ExperienceOwnerProfile", "ownerProfileId"),

      status: a.enum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]),

      emailSent: a.boolean(),

      // Amplify owner authorization field.
      owner: a.string(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.publicApiKey().to(["create"]),
    ]),

  ExperienceCalendarEvent: a
    .model({
      experienceId: a.id().required(),

      experience: a.belongsTo("Experience", "experienceId"),

      experienceName: a.string().required(),

      ownerProfileId: a.id().required(),

      ownerProfile: a.belongsTo("ExperienceOwnerProfile", "ownerProfileId"),

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

      // Amplify owner authorization field.
      owner: a.string(),
    })
    .secondaryIndexes((index) => [
      index("experienceId").sortKeys(["startDateTime"]),
      index("ownerProfileId").sortKeys(["startDateTime"]),
    ])
    .authorization((allow) => [
      allow.ownerDefinedIn("owner"),
      allow.publicApiKey().to(["create", "read"]),
    ]),
});

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
