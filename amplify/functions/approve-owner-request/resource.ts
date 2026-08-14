import { defineFunction } from "@aws-amplify/backend";

export const approveOwnerRequestFunction = defineFunction({
  name: "approve-owner-request",
  entry: "./handler.ts",
  timeoutSeconds: 30,

  // Prevent a CloudFormation circular dependency because this Lambda
  // is both a Data mutation handler and needs access to the Data API.
  resourceGroupName: "data",
});