import { defineFunction, secret } from "@aws-amplify/backend";

export const stripeApiFunction = defineFunction({
  name: "stripe-api",
  entry: "./handler.ts",
  timeoutSeconds: 30,

  environment: {
    STRIPE_SECRET_KEY: secret("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: secret("STRIPE_WEBHOOK_SECRET"),

    EMAILJS_SERVICE_ID: secret("EMAILJS_SERVICE_ID"),
    EMAILJS_TEMPLATE_ID: secret("EMAILJS_TEMPLATE_ID"),
    EMAILJS_PUBLIC_KEY: secret("EMAILJS_PUBLIC_KEY"),

    APP_URL: "http://localhost:5173",
  },
});
