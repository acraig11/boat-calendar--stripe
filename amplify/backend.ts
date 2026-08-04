import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";

import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { stripeApiFunction } from "./functions/stripe-api/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  stripeApiFunction,
});

const apiStack = backend.createStack("stripe-api-stack");

const stripeRestApi = new RestApi(apiStack, "StripeRestApi", {
  restApiName: "stripeRestApi",
  deploy: true,
  deployOptions: {
    stageName: "dev",
  },
  defaultCorsPreflightOptions: {
    allowOrigins: ["http://localhost:5173"],
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: Cors.DEFAULT_HEADERS,
  },
});

const stripeLambda =
  backend.stripeApiFunction.resources.lambda;
const stripeFunctionIntegration =
  new LambdaIntegration(stripeLambda);

const cognitoAuthorizer =
  new CognitoUserPoolsAuthorizer(
    apiStack,
    "StripeApiCognitoAuthorizer",
    {
      cognitoUserPools: [
        backend.auth.resources.userPool,
      ],
    },
  );

const stripeTestPath =
  stripeRestApi.root.addResource("stripe-test");
stripeTestPath.addMethod(
  "GET",
  stripeFunctionIntegration,
  {
    authorizationType: AuthorizationType.COGNITO,
    authorizer: cognitoAuthorizer,
  },
);

const bookingPaymentDetailsPath =
  stripeRestApi.root.addResource(
    "booking-payment-details",
  );
bookingPaymentDetailsPath.addMethod(
  "POST",
  stripeFunctionIntegration,
  {
    authorizationType: AuthorizationType.COGNITO,
    authorizer: cognitoAuthorizer,
  },
);

const createCheckoutSessionPath =
  stripeRestApi.root.addResource(
    "create-checkout-session",
  );
createCheckoutSessionPath.addMethod(
  "POST",
  stripeFunctionIntegration,
  {
    authorizationType: AuthorizationType.COGNITO,
    authorizer: cognitoAuthorizer,
  },
);

// Customer-facing Checkout route used by My Bookings.
const customerCreateCheckoutSessionPath =
  stripeRestApi.root.addResource(
    "customer-create-checkout-session",
  );
customerCreateCheckoutSessionPath.addMethod(
  "POST",
  stripeFunctionIntegration,
  {
    authorizationType: AuthorizationType.COGNITO,
    authorizer: cognitoAuthorizer,
  },
);

// Stripe calls this route directly, so it must not require Cognito.
const stripeWebhookPath =
  stripeRestApi.root.addResource("stripe-webhook");
stripeWebhookPath.addMethod(
  "POST",
  stripeFunctionIntegration,
  {
    authorizationType: AuthorizationType.NONE,
  },
);

const paymentSuccessDetailsPath =
  stripeRestApi.root.addResource(
    "payment-success-details",
  );
paymentSuccessDetailsPath.addMethod(
  "GET",
  stripeFunctionIntegration,
  {
    authorizationType: AuthorizationType.NONE,
  },
);

const bookingTable =
  backend.data.resources.tables["Booking"];

const ownerProfileTable =
  backend.data.resources.tables[
    "ExperienceOwnerProfile"
  ];

const bookingMessageTable =
  backend.data.resources.tables["BookingMessage"];

bookingTable.grantReadWriteData(stripeLambda);
ownerProfileTable.grantReadData(stripeLambda);
bookingMessageTable.grantReadWriteData(stripeLambda);

backend.stripeApiFunction.addEnvironment(
  "BOOKING_TABLE_NAME",
  bookingTable.tableName,
);

backend.stripeApiFunction.addEnvironment(
  "OWNER_PROFILE_TABLE_NAME",
  ownerProfileTable.tableName,
);

backend.stripeApiFunction.addEnvironment(
  "BOOKING_MESSAGE_TABLE_NAME",
  bookingMessageTable.tableName,
);

backend.addOutput({
  custom: {
    API: {
      [stripeRestApi.restApiName]: {
        endpoint: stripeRestApi.url,
        region: Stack.of(stripeRestApi).region,
        apiName: stripeRestApi.restApiName,
      },
    },
  },
});
