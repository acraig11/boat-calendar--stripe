import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  Todo: a
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

  BoatOwnerProfile: a
    .model({
      userId: a.string().required(),

      name: a.string().required(),
      email: a.email().required(),
      phone: a.string(),

      boats: a.hasMany("Boat", "ownerProfileId"),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.publicApiKey().to(["read"]),
    ]),

  Boat: a
    .model({
      name: a.string().required(),
      description: a.string(),
      location: a.string().required(),
      estimatedPrice: a.float(),
      imageUrl: a.string(),

      ownerProfileId: a.id().required(),
      experienceType: a.string(),
      ownerProfile: a.belongsTo("BoatOwnerProfile", "ownerProfileId"),

      bookings: a.hasMany("Booking", "boatId"),
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

      boatId: a.id().required(),
      boat: a.belongsTo("Boat", "boatId"),

      boatName: a.string().required(),
      boatOwnerId: a.string().required(),

      location: a.string(),

      status: a.enum(["PENDING", "CONFIRMED", "CANCELLED"]),

      emailSent: a.boolean(),
    })
    .authorization((allow) => [
      allow.ownerDefinedIn("boatOwnerId"),
      allow.guest().to(["create"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",

    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
