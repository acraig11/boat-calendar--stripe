import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";
import "@aws-amplify/ui-react/styles.css";
import { downloadData, getUrl, remove, uploadData } from "aws-amplify/storage";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { client } from "../lib/amplifyClient";
import outputs from "../../amplify_outputs.json";
import "./OwnerDashboard.css";
import "./OwnerBookingRequests.css";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
type OwnerProfile = Awaited<
  ReturnType<typeof client.models.ExperienceOwnerProfile.list>
>["data"][number];

type Experience = Awaited<
  ReturnType<typeof client.models.Experience.list>
>["data"][number];

type Booking = Awaited<
  ReturnType<typeof client.models.Booking.list>
>["data"][number];

type BookingMessage = Awaited<
  ReturnType<typeof client.models.BookingMessage.list>
>["data"][number];

type ExperienceCalendarEvent = Awaited<
  ReturnType<typeof client.models.ExperienceCalendarEvent.list>
>["data"][number];

type OwnerAccessRequest = Awaited<
  ReturnType<typeof client.models.OwnerAccessRequest.list>
>["data"][number];

type OwnerAccessMessage = Awaited<
  ReturnType<typeof client.models.OwnerAccessMessage.list>
>["data"][number];

type PendingBookingRequest = {
  booking: Booking;
  calendarEvent: ExperienceCalendarEvent | null;
};

function formatBookingDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const EXPERIENCE_TYPES = [
  "Home",
  "Boat",
  "Golf",
  "Fishing",
  "Tennis",
  "Swimming",
  "Skiing",
  "Hiking",
  "Biking",
  "Surfing",
  "Pickle Ball",
  "Beach",
];

const MODERATOR_USER_ID =
  "14588428-20f1-706f-f6d7-308f21156444";

/*
 * Prevent React development-mode double effects or overlapping dashboard loads
 * from creating the same initial approved experience twice in one browser session.
 * The backend duplicate check below remains the primary safeguard.
 */
const initialExperienceCreationInProgress = new Set<string>();

/*
 * Prevent overlapping OwnerDashboard loads (including React StrictMode's
 * development double-effect behavior) from creating the same owner profile
 * twice.
 */
const ownerProfileCreationInProgress = new Set<string>();

async function copyPartnerImageToPublicExperienceImages(
  partnerImagePath: string,
) {
  const sourceFileName =
    partnerImagePath.split("/").pop() || "experience-image.jpg";

  const extensionMatch = sourceFileName.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase() || "jpg";

  const downloadResult = await downloadData({
    path: partnerImagePath,
  }).result;

  const imageBlob = await downloadResult.body.blob();

  const copiedImageResult = await uploadData({
    path: ({ identityId }) =>
      `experience-images/${identityId}/${crypto.randomUUID()}.${extension}`,
    data: imageBlob,
    options: {
      preventOverwrite: true,
    },
  }).result;

  return copiedImageResult.path;
}

function ExperienceImage({
  imagePath,
  experienceName,
}: {
  imagePath: string;
  experienceName: string;
}) {
  const [displayUrl, setDisplayUrl] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadImage() {
      setDisplayUrl("");
      setImageError("");

      try {
        const result = await getUrl({
          path: imagePath,
          options: {
            validateObjectExistence: true,
          },
        });

        if (active) {
          setDisplayUrl(result.url.toString());
        }
      } catch (error) {
        console.error(
          `Could not load experience image at path "${imagePath}":`,
          error,
        );

        if (active) {
          setImageError("Image could not be loaded.");
        }
      }
    }

    void loadImage();

    return () => {
      active = false;
    };
  }, [imagePath]);

  if (imageError) {
    return <p>{imageError}</p>;
  }

  if (!displayUrl) {
    return <p>Loading image...</p>;
  }

  return (
    <img
      src={displayUrl}
      alt={experienceName}
      width="200"
      style={{
        height: "220px",
        objectFit: "cover",
        borderRadius: "10px",
      }}
    />
  );
}

function PartnerRequestImage({
  imagePath,
  applicantName,
}: {
  imagePath: string;
  applicantName: string;
}) {
  const [displayUrl, setDisplayUrl] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPartnerImage() {
      setDisplayUrl("");
      setImageError("");

      try {
        const result = await getUrl({
          path: imagePath,
          options: {
            validateObjectExistence: true,
          },
        });

        if (active) {
          setDisplayUrl(result.url.toString());
        }
      } catch (error: unknown) {
        console.error(
          `Could not load partner request image at path "${imagePath}":`,
          error,
        );

        if (active) {
          setImageError("The submitted experience image could not be loaded.");
        }
      }
    }

    void loadPartnerImage();

    return () => {
      active = false;
    };
  }, [imagePath]);

  if (imageError) {
    return (
      <p
        style={{
          margin: "14px 0",
          padding: 12,
          color: "#9f1239",
          background: "#fff1f2",
          border: "1px solid #fecdd3",
          borderRadius: 12,
        }}
      >
        {imageError}
      </p>
    );
  }

  if (!displayUrl) {
    return (
      <p
        style={{
          margin: "14px 0",
          color: "#64748b",
        }}
      >
        Loading submitted experience image...
      </p>
    );
  }

  return (
    <div
      style={{
        margin: "16px 0",
        padding: 12,
        background: "#f8fafc",
        border: "1px solid #dbe2ea",
        borderRadius: 14,
      }}
    >
      <p
        style={{
          margin: "0 0 10px",
          color: "#334155",
          fontSize: 14,
          fontWeight: 800,
        }}
      >
        Submitted Experience Image
      </p>

      <img
        src={displayUrl}
        alt={`${applicantName}'s proposed experience`}
        style={{
          display: "block",
          width: "100%",
          maxWidth: 520,
          height: 300,
          objectFit: "cover",
          borderRadius: 12,
          border: "1px solid rgba(15, 23, 42, 0.08)",
        }}
      />
    </div>
  );
}

function DashboardContent({
  signOut,
  userEmail,
}: {
  signOut?: () => void;
  userEmail: string;
}) {
  const navigate = useNavigate();
const [showStripeOnboarding, setShowStripeOnboarding] = useState(false);
  const [stripeSetupState, setStripeSetupState] = useState<
    "IDLE" | "CHECKING" | "NEEDS_ONBOARDING" | "ACTIVE" | "ERROR"
  >("IDLE");
  const [stripeSetupError, setStripeSetupError] = useState("");
  console.log("OWNER DASHBOARD VERSION: PENDING-LIST-2026-07-31");

  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [experiences, setexperiences] = useState<Experience[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<
    ExperienceCalendarEvent[]
  >([]);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(
    null,
  );
  const [showAllBookings, setShowAllBookings] = useState(false);
  const [expandedMessagesBookingId, setExpandedMessagesBookingId] =
    useState<string | null>(null);
  const [bookingMessages, setBookingMessages] = useState<
    Record<string, BookingMessage[]>
  >({});
  const [historyMessagesByBooking, setHistoryMessagesByBooking] = useState<
    Record<string, BookingMessage[]>
  >({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>(
    {},
  );
  const [loadingMessagesBookingId, setLoadingMessagesBookingId] =
    useState<string | null>(null);
  const [sendingMessageBookingId, setSendingMessageBookingId] =
    useState<string | null>(null);
  const [messageErrors, setMessageErrors] = useState<Record<string, string>>(
    {},
  );
  const [editingDateBookingId, setEditingDateBookingId] =
    useState<string | null>(null);
  const [proposedBookingDate, setProposedBookingDate] = useState("");
  const [proposedBookingTime, setProposedBookingTime] = useState("09:00");
  const [updatingDateBookingId, setUpdatingDateBookingId] =
    useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] =
    useState<string | null>(null);
  const [showUnreadMessages, setShowUnreadMessages] = useState(false);
  const [markingMessageReadId, setMarkingMessageReadId] =
    useState<string | null>(null);

  const [partnerRequests, setPartnerRequests] = useState<OwnerAccessRequest[]>([]);
  const [partnerRequestHistory, setPartnerRequestHistory] = useState<
    OwnerAccessRequest[]
  >([]);
  const [showPartnerRequestHistory, setShowPartnerRequestHistory] =
    useState(false);
  const [partnerMessagesByRequest, setPartnerMessagesByRequest] = useState<
    Record<string, OwnerAccessMessage[]>
  >({});
  const [expandedPartnerRequestId, setExpandedPartnerRequestId] =
    useState<string | null>(null);
  const [partnerMessageDrafts, setPartnerMessageDrafts] = useState<
    Record<string, string>
  >({});
  const [updatingPartnerRequestId, setUpdatingPartnerRequestId] =
    useState<string | null>(null);
  const [sendingPartnerMessageId, setSendingPartnerMessageId] =
    useState<string | null>(null);

  const [ownerAccessStatus, setOwnerAccessStatus] = useState<
    "CHECKING" | "APPROVED" | "PENDING" | "REJECTED" | "NOT_REQUESTED"
  >("CHECKING");
  const [isModerator, setIsModerator] = useState(false);

  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  const [experienceName, setexperienceName] = useState("");
  const [experienceExperienceType, setexperienceExperienceType] = useState("");
  const [experienceLocation, setexperienceLocation] = useState("");
  const [experienceDescription, setexperienceDescription] = useState("");
  const [experiencePrice, setexperiencePrice] = useState("");

  const [experienceImageFile, setexperienceImageFile] = useState<File | null>(
    null,
  );
  const [experienceImagePreview, setexperienceImagePreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddexperienceForm, setShowAddexperienceForm] = useState(false);
  const [editingExperience, setEditingExperience] =
    useState<Experience | null>(null);
  const [deletingexperienceId, setDeletingexperienceId] = useState<
    string | null
  >(null);

  const experienceImageInputRef = useRef<HTMLInputElement>(null);

async function getStripeApiBaseUrl(): Promise<string> {
  const stripeApi =
    (outputs as any).custom?.API?.stripeRestApi?.endpoint;

  if (!stripeApi) {
    throw new Error(
      "The Stripe REST API endpoint was not found in amplify_outputs.json.",
    );
  }

  return stripeApi.replace(/\/$/, "");
}

async function getStripeIdToken(): Promise<string> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();

  if (!idToken) {
    throw new Error("No Cognito ID token was found.");
  }

  return idToken;
}

async function createConnectedAccountIfNeeded() {
  const [stripeApi, idToken] = await Promise.all([
    getStripeApiBaseUrl(),
    getStripeIdToken(),
  ]);

  const response = await fetch(
    `${stripeApi}/create-connected-account`,
    {
      method: "POST",
      headers: {
        Authorization: idToken,
        "Content-Type": "application/json",
      },
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message ?? "Could not create Stripe connected account.",
    );
  }

  return result;
}

async function fetchStripeAccountStatus() {
  const [stripeApi, idToken] = await Promise.all([
    getStripeApiBaseUrl(),
    getStripeIdToken(),
  ]);

  const response = await fetch(
    `${stripeApi}/stripe-account-status`,
    {
      method: "GET",
      headers: {
        Authorization: idToken,
        "Content-Type": "application/json",
      },
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message ?? "Could not check Stripe account status.",
    );
  }

  return result as {
    success?: boolean;
    hasStripeAccount?: boolean;
    stripeAccountId?: string | null;
    detailsSubmitted?: boolean;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    ready?: boolean;
  };
}

async function waitForStripeAccountStatus(
  attempts = 8,
  delayMs = 750,
) {
  let lastStatus: Awaited<ReturnType<typeof fetchStripeAccountStatus>> | null =
    null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const status = await fetchStripeAccountStatus();
      lastStatus = status;

      if (status.hasStripeAccount) {
        return status;
      }
    } catch (error: unknown) {
      lastError = error;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, delayMs),
      );
    }
  }

  if (lastStatus) {
    return lastStatus;
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Stripe account status could not be loaded.");
}

async function ensureStripeSetup() {
  if (!profile) {
    setStripeSetupState("IDLE");
    setShowStripeOnboarding(false);
    return;
  }

  try {
    setStripeSetupState("CHECKING");
    setStripeSetupError("");

    let status = await waitForStripeAccountStatus();

    if (!status.hasStripeAccount) {
      await createConnectedAccountIfNeeded();
      status = await waitForStripeAccountStatus();
    }

    if (status.ready) {
      setShowStripeOnboarding(false);
      setStripeSetupState("ACTIVE");
      return;
    }

    setStripeSetupState("NEEDS_ONBOARDING");
    setShowStripeOnboarding(true);
  } catch (error: unknown) {
    console.error("Could not prepare Stripe setup:", error);
    setShowStripeOnboarding(false);
    setStripeSetupState("ERROR");
    setStripeSetupError(
      error instanceof Error
        ? error.message
        : "Could not prepare Stripe payments.",
    );
  }
}

async function fetchStripeConnectClientSecret(): Promise<string> {
  const stripeApi = await getStripeApiBaseUrl();

  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const idToken = await getStripeIdToken();

      const response = await fetch(
        `${stripeApi}/create-account-session`,
        {
          method: "POST",
          headers: {
            Authorization: idToken,
            "Content-Type": "application/json",
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ??
            "Could not create Stripe onboarding session.",
        );
      }

      if (!result.clientSecret) {
        throw new Error(
          "Stripe did not return an account session client secret.",
        );
      }

      return result.clientSecret;
    } catch (error: unknown) {
      lastError = error;

      console.warn(
        `Stripe Account Session attempt ${attempt + 1} failed.`,
        error,
      );

      if (attempt < 3) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 1000),
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not authenticate Stripe Connect.");
}
const stripeConnectInstance = useRef(
  loadConnectAndInitialize({
    publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
    fetchClientSecret: fetchStripeConnectClientSecret,
  }),
).current;
  async function loadDashboard() {
    console.log("loadDashboard started");
    setIsLoading(true);
    setOwnerAccessStatus("CHECKING");
    setMessage("");

    try {
      const currentUser = await getCurrentUser();
      const moderator =
        currentUser.userId === MODERATOR_USER_ID;

      setIsModerator(moderator);

      const accessRequestResult =
        await client.models.OwnerAccessRequest.list({
          filter: {
            applicantUserId: {
              eq: currentUser.userId,
            },
          },
        });

      if (accessRequestResult.errors?.length) {
        throw new Error(
          accessRequestResult.errors
            .map((error) => error.message)
            .join(", "),
        );
      }

      const latestAccessRequest =
        [...accessRequestResult.data].sort(
          (first, second) =>
            new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime(),
        )[0] ?? null;

      const resolvedAccessStatus:
        | "APPROVED"
        | "PENDING"
        | "REJECTED"
        | "NOT_REQUESTED" =
        moderator
          ? "APPROVED"
          : !latestAccessRequest
            ? "NOT_REQUESTED"
            : latestAccessRequest.status === "APPROVED"
              ? "APPROVED"
              : latestAccessRequest.status === "REJECTED"
                ? "REJECTED"
                : "PENDING";

      setOwnerAccessStatus(resolvedAccessStatus);

      console.log("OWNER ACCESS CHECK:", {
        userId: currentUser.userId,
        isModerator: moderator,
        latestAccessRequest,
        resolvedAccessStatus,
      });

      if (resolvedAccessStatus !== "APPROVED") {
        setProfile(null);
        setexperiences([]);
        setBookings([]);
        setCalendarEvents([]);
        setHistoryMessagesByBooking({});
        setPartnerRequests([]);
        setPartnerRequestHistory([]);
        setPartnerMessagesByRequest({});
        return;
      }

      const profileResult =
        await client.models.ExperienceOwnerProfile.list();

      if (profileResult.errors?.length) {
        throw new Error(
          profileResult.errors.map((error) => error.message).join(", "),
        );
      }

      let currentProfile =
        profileResult.data.find(
          (ownerProfile) => ownerProfile.userId === currentUser.userId,
        ) ?? null;

      if (
        !currentProfile &&
        !moderator &&
        latestAccessRequest?.status === "APPROVED"
      ) {
        if (ownerProfileCreationInProgress.has(currentUser.userId)) {
          console.log(
            "Owner profile creation is already in progress for this user.",
            currentUser.userId,
          );

          for (let attempt = 0; attempt < 20 && !currentProfile; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 100));

            const retryProfileResult =
              await client.models.ExperienceOwnerProfile.list({
                filter: {
                  userId: {
                    eq: currentUser.userId,
                  },
                },
              });

            if (retryProfileResult.errors?.length) {
              throw new Error(
                retryProfileResult.errors
                  .map((error) => error.message)
                  .join(", "),
              );
            }

            currentProfile = retryProfileResult.data[0] ?? null;
          }
        } else {
          ownerProfileCreationInProgress.add(currentUser.userId);

          try {
            const latestProfileResult =
              await client.models.ExperienceOwnerProfile.list({
                filter: {
                  userId: {
                    eq: currentUser.userId,
                  },
                },
              });

            if (latestProfileResult.errors?.length) {
              throw new Error(
                latestProfileResult.errors
                  .map((error) => error.message)
                  .join(", "),
              );
            }

            currentProfile = latestProfileResult.data[0] ?? null;

            if (!currentProfile) {
              console.log(
                "No owner profile found. Creating one from the approved partner request.",
                latestAccessRequest,
              );

              const createProfileResult =
                await client.models.ExperienceOwnerProfile.create({
                  id: currentUser.userId,
                  userId: currentUser.userId,
                  name: latestAccessRequest.applicantName,
                  email: latestAccessRequest.applicantEmail,
                  phone: latestAccessRequest.applicantPhone || undefined,
                } as any);

              if (
                createProfileResult.errors?.length ||
                !createProfileResult.data
              ) {
                const raceCheckResult =
                  await client.models.ExperienceOwnerProfile.list({
                    filter: {
                      userId: {
                        eq: currentUser.userId,
                      },
                    },
                  });

                if (raceCheckResult.errors?.length) {
                  throw new Error(
                    raceCheckResult.errors
                      .map((error) => error.message)
                      .join(", "),
                  );
                }

                currentProfile = raceCheckResult.data[0] ?? null;

                if (!currentProfile) {
                  throw new Error(
                    createProfileResult.errors
                      ?.map((error) => error.message)
                      .join(", ") ||
                      "The approved owner profile could not be created.",
                  );
                }
              } else {
                currentProfile = createProfileResult.data;
              }
            }
          } finally {
            ownerProfileCreationInProgress.delete(currentUser.userId);
          }
        }
      }

      console.log("SIGNED-IN USER ID:", currentUser.userId);
      console.log("ALL OWNER PROFILES:", profileResult.data);
      console.log("MATCHED OWNER PROFILE:", currentProfile);

      setProfile(currentProfile);

      if (currentProfile) {
        setProfileName(currentProfile.name);
        setProfilePhone(currentProfile.phone ?? "");
      }

      const [
        experienceResult,
        bookingResult,
        calendarResult,
        bookingMessageResult,
        partnerRequestResult,
        partnerMessageResult,
      ] = await Promise.all([
        client.models.Experience.list(),
        client.models.Booking.list(),
        client.models.ExperienceCalendarEvent.list(),
        client.models.BookingMessage.list(),
        client.models.OwnerAccessRequest.list({
          filter: {
            moderatorUserId: {
              eq: currentUser.userId,
            },
          },
        }),
        client.models.OwnerAccessMessage.list({
          filter: {
            moderatorUserId: {
              eq: currentUser.userId,
            },
          },
        }),
      ]);

      if (experienceResult.errors?.length) {
        throw new Error(
          experienceResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (bookingResult.errors?.length) {
        throw new Error(
          bookingResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (calendarResult.errors?.length) {
        throw new Error(
          calendarResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (bookingMessageResult.errors?.length) {
        throw new Error(
          bookingMessageResult.errors
            .map((error) => error.message)
            .join(", "),
        );
      }

      if (partnerRequestResult.errors?.length) {
        throw new Error(
          partnerRequestResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (partnerMessageResult.errors?.length) {
        throw new Error(
          partnerMessageResult.errors.map((error) => error.message).join(", "),
        );
      }

      const sortedPartnerRequestHistory = [
        ...partnerRequestResult.data,
      ].sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      );

      const sortedPartnerRequests = sortedPartnerRequestHistory.filter(
        (request) => request.status !== "APPROVED",
      );

      const partnerMessages = partnerMessageResult.data.reduce<
        Record<string, OwnerAccessMessage[]>
      >((current, partnerMessage) => {
        current[partnerMessage.ownerAccessRequestId] = [
          ...(current[partnerMessage.ownerAccessRequestId] ?? []),
          partnerMessage,
        ];
        return current;
      }, {});

      for (const requestId of Object.keys(partnerMessages)) {
        partnerMessages[requestId].sort(
          (first, second) =>
            new Date(first.createdAt).getTime() -
            new Date(second.createdAt).getTime(),
        );
      }

      setPartnerRequestHistory(sortedPartnerRequestHistory);
      setPartnerRequests(sortedPartnerRequests);
      setPartnerMessagesByRequest(partnerMessages);

      let allExperiences = [...experienceResult.data];

      /*
       * First approved partner experience
       *
       * The partner request represents ONE initial experience only.
       * Additional experiences are created later from the Owner Dashboard.
       *
       * This runs while the newly approved owner is signed in, after their
       * ExperienceOwnerProfile has been created/loaded. If that profile does
       * not yet own any experiences, create the initial experience from the
       * approved OwnerAccessRequest.
       *
       * Using "no existing experiences for this profile" makes this safe to
       * run again when the dashboard reloads without creating duplicates.
       */
    

      console.log("ALL EXPERIENCES:", allExperiences);
      console.log("ALL BOOKINGS:", bookingResult.data);
      console.log("ALL CALENDAR EVENTS:", calendarResult.data);
      console.log("ALL BOOKING MESSAGES:", bookingMessageResult.data);

      if (currentProfile) {
        const ownerExperiences = allExperiences.filter(
          (experience) => experience.ownerProfileId === currentProfile.id,
        );

        const ownerExperienceIds = new Set(
          ownerExperiences.map((experience) => experience.id),
        );

        const ownerBookings = bookingResult.data.filter(
          (booking) =>
            booking.ownerProfileId === currentProfile.id ||
            ownerExperienceIds.has(booking.experienceId),
        );

        const ownerBookingIds = new Set(
          ownerBookings.map((booking) => booking.id),
        );

        const ownerBookingMessages = bookingMessageResult.data.filter(
          (bookingMessage) =>
            ownerBookingIds.has(bookingMessage.bookingId),
        );

        const messagesByBooking =
          ownerBookingMessages.reduce<Record<string, BookingMessage[]>>(
            (current, bookingMessage) => {
              const currentMessages =
                current[bookingMessage.bookingId] ?? [];

              current[bookingMessage.bookingId] = [
                ...currentMessages,
                bookingMessage,
              ];

              return current;
            },
            {},
          );

        for (const bookingId of Object.keys(messagesByBooking)) {
          messagesByBooking[bookingId].sort(
            (first, second) =>
              new Date(first.createdAt).getTime() -
              new Date(second.createdAt).getTime(),
          );
        }

        const ownerCalendarEvents = calendarResult.data.filter(
          (calendarEvent) =>
            calendarEvent.ownerProfileId === currentProfile.id ||
            ownerExperienceIds.has(calendarEvent.experienceId) ||
            (calendarEvent.bookingId
              ? ownerBookingIds.has(calendarEvent.bookingId)
              : false),
        );

        setexperiences(ownerExperiences);
        setBookings(ownerBookings);
        setCalendarEvents(ownerCalendarEvents);
        setHistoryMessagesByBooking(messagesByBooking);

        console.log("OWNER PROFILE ID:", currentProfile.id);
        console.log(
          "OWNER EXPERIENCE IDS:",
          Array.from(ownerExperienceIds),
        );
        console.log("OWNER BOOKINGS FOUND:", ownerBookings);
        console.log(
          "OWNER CALENDAR EVENTS FOUND:",
          ownerCalendarEvents,
        );
      } else {
        console.warn(
          "NO OWNER PROFILE MATCHED THE SIGNED-IN USER. Pending bookings cannot be displayed.",
        );
        setexperiences([]);
        setBookings([]);
        setCalendarEvents([]);
        setHistoryMessagesByBooking({});
      }
    } catch (error) {
      console.error("Could not load owner dashboard:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load the dashboard.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (
      ownerAccessStatus === "APPROVED" &&
      profile
    ) {
      void ensureStripeSetup();
    } else if (!profile || ownerAccessStatus !== "APPROVED") {
      setStripeSetupState("IDLE");
      setShowStripeOnboarding(false);
    }
  }, [ownerAccessStatus, profile?.id]);

  useEffect(() => {
    return () => {
      if (experienceImagePreview) {
        URL.revokeObjectURL(experienceImagePreview);
      }
    };
  }, [experienceImagePreview]);
async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = profileName.trim();
    const trimmedEmail = userEmail?.trim();

    if (!trimmedName) {
      setMessage("Enter the owner name.");
      return;
    }

    if (!trimmedEmail) {
      setMessage("The signed-in user's email could not be found.");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");

      const currentUser = await getCurrentUser();

      const result = await client.models.ExperienceOwnerProfile.create({
        userId: currentUser.userId,
        name: trimmedName,
        email: trimmedEmail,
        phone: profilePhone.trim() || undefined,
      } as any);

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      if (!result.data) {
        throw new Error("The owner profile was not created.");
      }

      setProfile(result.data);
      setMessage("Owner profile created.");
    } catch (error) {
      console.error("Could not create profile:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the owner profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }
  function clearexperienceImage() {
    if (experienceImagePreview) {
      URL.revokeObjectURL(experienceImagePreview);
    }

    setexperienceImageFile(null);
    setexperienceImagePreview("");
    setUploadProgress(0);

    if (experienceImageInputRef.current) {
      experienceImageInputRef.current.value = "";
    }
  }

  function handleexperienceImageChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    setMessage("");
    setUploadProgress(0);

    if (!selectedFile) {
      clearexperienceImage();
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setMessage("Please select a JPEG, PNG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_IMAGE_SIZE) {
      setMessage("The experience image must be smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    if (experienceImagePreview) {
      URL.revokeObjectURL(experienceImagePreview);
    }

    setexperienceImageFile(selectedFile);
    setexperienceImagePreview(URL.createObjectURL(selectedFile));
  }

  function getImageExtension(file: File) {
    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (extension) {
      return extension;
    }

    switch (file.type) {
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      default:
        return "jpg";
    }
  }

  async function uploadexperienceImage(file: File) {
    const fileName = `${crypto.randomUUID()}.${getImageExtension(file)}`;

    const result = await uploadData({
      path: ({ identityId }) => `experience-images/${identityId}/${fileName}`,
      data: file,
      options: {
        contentType: file.type,
        preventOverwrite: true,
        onProgress: ({ transferredBytes, totalBytes }) => {
          if (!totalBytes) {
            return;
          }

          setUploadProgress(Math.round((transferredBytes / totalBytes) * 100));
        },
      },
    }).result;

    return result.path;
  }

  function resetExperienceForm() {
    clearexperienceImage();
    setexperienceName("");
    setexperienceExperienceType("");
    setexperienceLocation("");
    setexperienceDescription("");
    setexperiencePrice("");
    setEditingExperience(null);
    setShowAddexperienceForm(false);
  }

  function beginEditExperience(experience: Experience) {
    clearexperienceImage();
    setMessage("");
    setEditingExperience(experience);
    setexperienceName(experience.name);
    setexperienceExperienceType(experience.experienceType ?? "");
    setexperienceLocation(experience.location);
    setexperienceDescription(experience.description ?? "");
    setexperiencePrice(
      experience.estimatedPrice != null
        ? String(experience.estimatedPrice)
        : "",
    );
    setShowAddexperienceForm(true);

    window.setTimeout(() => {
      document
        .getElementById("owner-experience-form")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 50);
  }

  async function addExperience(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile) {
      setMessage("Create your owner profile first.");
      return;
    }

    if (!experienceName.trim()) {
      setMessage("Experience name is required.");
      return;
    }

    if (!experienceExperienceType.trim()) {
      setMessage("Please select an experience type.");
      return;
    }

    if (!experienceLocation.trim()) {
      setMessage("Experience location is required.");
      return;
    }

    if (!editingExperience && !experienceImageFile) {
      setMessage("Please choose an experience image.");
      return;
    }

    const numericPrice =
      experiencePrice.trim() === "" ? undefined : Number(experiencePrice);

    if (
      numericPrice !== undefined &&
      (!Number.isFinite(numericPrice) || numericPrice < 0)
    ) {
      setMessage("Enter a valid estimated price.");
      return;
    }

    let uploadedImagePath: string | null = null;

    try {
      setIsSaving(true);
      setMessage("Uploading experience image...");
      setUploadProgress(0);

      if (experienceImageFile) {
        uploadedImagePath =
          await uploadexperienceImage(experienceImageFile);
      }

      setMessage(
        editingExperience
          ? "Updating experience information..."
          : "Saving experience information...",
      );

      if (editingExperience) {
        const previousImagePath = editingExperience.imageUrl ?? null;

        const result = await client.models.Experience.update({
          id: editingExperience.id,
          name: experienceName.trim(),
          experienceType: experienceExperienceType.trim(),
          location: experienceLocation.trim(),
          description: experienceDescription.trim() || undefined,
          estimatedPrice: numericPrice,
          imageUrl: uploadedImagePath ?? previousImagePath ?? undefined,
        } as any);

        if (result.errors?.length) {
          throw new Error(
            result.errors.map((error) => error.message).join(", "),
          );
        }

        if (!result.data) {
          throw new Error("The experience was not updated.");
        }

        setexperiences((currentexperiences) =>
          currentexperiences.map((experience) =>
            experience.id === result.data?.id
              ? result.data
              : experience,
          ),
        );

        if (
          uploadedImagePath &&
          previousImagePath &&
          previousImagePath !== uploadedImagePath
        ) {
          try {
            await remove({
              path: previousImagePath,
            });
          } catch (imageCleanupError) {
            console.error(
              "Experience was updated, but the previous image could not be removed:",
              imageCleanupError,
            );
          }
        }

        resetExperienceForm();
        setMessage("Experience updated successfully.");
      } else {
        const result = await client.models.Experience.create({
          name: experienceName.trim(),
          experienceType: experienceExperienceType.trim(),
          location: experienceLocation.trim(),
          description: experienceDescription.trim() || undefined,
          estimatedPrice: numericPrice,
          imageUrl: uploadedImagePath ?? undefined,
          ownerProfileId: profile.id,
          ownerEmail: profile.email,
        } as any);

        if (result.errors?.length) {
          throw new Error(
            result.errors.map((error) => error.message).join(", "),
          );
        }

        if (!result.data) {
          throw new Error("The experience was not created.");
        }

        setexperiences((currentexperiences) => [
          ...currentexperiences,
          result.data,
        ]);

        resetExperienceForm();
        setMessage("Experience added successfully.");
      }
    } catch (error) {
      console.error("Could not add experience:", error);

      if (uploadedImagePath) {
        try {
          await remove({
            path: uploadedImagePath,
          });
        } catch (cleanupError) {
          console.error("Could not remove unused image:", cleanupError);
        }
      }

      setMessage(
        error instanceof Error
          ? error.message
          : editingExperience
            ? "Could not update the experience."
            : "Could not add the experience.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteExperience(experience: Experience) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${experience.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingexperienceId(experience.id);
      setMessage("");

      const result = await client.models.Experience.delete({
        id: experience.id,
      });

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      setexperiences((currentexperiences) =>
        currentexperiences.filter(
          (currentexperience) => currentexperience.id !== experience.id,
        ),
      );

      if (experience.imageUrl) {
        try {
          await remove({
            path: experience.imageUrl,
          });
        } catch (imageError) {
          console.error(
            "experience deleted, but its stored image could not be removed:",
            imageError,
          );
        }
      }

      setMessage(`"${experience.name}" was deleted.`);
    } catch (error) {
      console.error("Could not delete experience:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not delete the experience.",
      );
    } finally {
      setDeletingexperienceId(null);
    }
  }

  const allBookingsSorted = [...bookings].sort(
    (first, second) =>
      new Date(second.appointmentDateTime).getTime() -
      new Date(first.appointmentDateTime).getTime(),
  );

  function formatBookingAmount(amountInCents?: number | null) {
    if (amountInCents == null) {
      return "Not set";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amountInCents / 100);
  }

  function getBookingDisplayStatus(booking: Booking) {
    if (booking.paymentStatus === "PAID") {
      return "Confirmed — Paid";
    }

    if (booking.status === "REJECTED") {
      return "Rejected";
    }

    if (booking.status === "CANCELLED") {
      return "Cancelled";
    }

    if (booking.paymentStatus === "AWAITING_PAYMENT") {
      return "Approved — Awaiting Payment";
    }

    if (
      booking.paymentStatus === "AWAITING_APPROVAL" ||
      booking.status === "PENDING" ||
      !booking.status
    ) {
      return "Pending Owner Approval";
    }

    return booking.status;
  }

  function getUnreadCustomerMessageCount(bookingId: string) {
    return (historyMessagesByBooking[bookingId] ?? []).filter(
      (bookingMessage) =>
        bookingMessage.messageType === "CHAT" &&
        bookingMessage.senderRole === "CUSTOMER" &&
        !bookingMessage.readByOwnerAt,
    ).length;
  }

  function doesBookingNeedOwnerResponse(bookingId: string) {
    const chatMessages = (historyMessagesByBooking[bookingId] ?? [])
      .filter((bookingMessage) => bookingMessage.messageType === "CHAT")
      .sort(
        (first, second) =>
          new Date(first.createdAt).getTime() -
          new Date(second.createdAt).getTime(),
      );

    const latestChatMessage = chatMessages.at(-1);

    return latestChatMessage?.senderRole === "CUSTOMER";
  }

  async function markCustomerMessagesRead(bookingId: string) {
    const unreadMessages = (historyMessagesByBooking[bookingId] ?? []).filter(
      (bookingMessage) =>
        bookingMessage.messageType === "CHAT" &&
        bookingMessage.senderRole === "CUSTOMER" &&
        !bookingMessage.readByOwnerAt,
    );

    if (unreadMessages.length === 0) {
      return;
    }

    const readAt = new Date().toISOString();
    const unreadIds = new Set(
      unreadMessages.map((bookingMessage) => bookingMessage.id),
    );

    // Update the screen immediately so the New Messages badge clears.
    setHistoryMessagesByBooking((current) => ({
      ...current,
      [bookingId]: (current[bookingId] ?? []).map((bookingMessage) =>
        unreadIds.has(bookingMessage.id)
          ? {
              ...bookingMessage,
              readByOwnerAt: readAt,
            }
          : bookingMessage,
      ),
    }));

    setBookingMessages((current) => ({
      ...current,
      [bookingId]: (current[bookingId] ?? []).map((bookingMessage) =>
        unreadIds.has(bookingMessage.id)
          ? {
              ...bookingMessage,
              readByOwnerAt: readAt,
            }
          : bookingMessage,
      ),
    }));

    // Persist the read markers after the UI has already updated.
    const updateResults = await Promise.all(
      unreadMessages.map((bookingMessage) =>
        client.models.BookingMessage.update({
          id: bookingMessage.id,
          readByOwnerAt: readAt,
        } as any),
      ),
    );

    const updateErrors = updateResults.flatMap(
      (result) => result.errors ?? [],
    );

    if (updateErrors.length > 0) {
      // Reload from the backend if any update failed.
      await loadDashboard();

      throw new Error(
        updateErrors.map((error) => error.message).join(", "),
      );
    }
  }


  const totalUnreadCustomerMessages = Object.values(
    historyMessagesByBooking,
  ).reduce(
    (total, bookingMessageList) =>
      total +
      bookingMessageList.filter(
        (bookingMessage) =>
          bookingMessage.messageType === "CHAT" &&
          bookingMessage.senderRole === "CUSTOMER" &&
          !bookingMessage.readByOwnerAt,
      ).length,
    0,
  );

  const unreadCustomerMessages = Object.values(
    historyMessagesByBooking,
  )
    .flat()
    .filter(
      (bookingMessage) =>
        bookingMessage.messageType === "CHAT" &&
        bookingMessage.senderRole === "CUSTOMER" &&
        !bookingMessage.readByOwnerAt,
    )
    .sort(
      (first, second) =>
        new Date(first.createdAt).getTime() -
        new Date(second.createdAt).getTime(),
    );

  const unreadMessagesGroupedByBooking =
    unreadCustomerMessages.reduce<
      Record<string, BookingMessage[]>
    >((current, bookingMessage) => {
      current[bookingMessage.bookingId] = [
        ...(current[bookingMessage.bookingId] ?? []),
        bookingMessage,
      ];

      return current;
    }, {});

  function openAllUnreadCustomerMessages() {
    console.log("=== OPEN ALL OWNER UNREAD MESSAGES ===");
    console.log(
      "unreadCustomerMessages =",
      unreadCustomerMessages,
    );

    if (unreadCustomerMessages.length === 0) {
      setMessage("There are no unread customer messages.");
      return;
    }

    setShowUnreadMessages(true);
  }

  async function markOneCustomerMessageRead(
    bookingMessage: BookingMessage,
  ) {
    if (bookingMessage.readByOwnerAt) {
      return;
    }

    const readAt = new Date().toISOString();

    try {
      setMarkingMessageReadId(bookingMessage.id);

      const result = await client.models.BookingMessage.update({
        id: bookingMessage.id,
        readByOwnerAt: readAt,
      } as any);

      if (result.errors?.length) {
        throw new Error(
          result.errors.map((error) => error.message).join(", "),
        );
      }

      setHistoryMessagesByBooking((current) => ({
        ...current,
        [bookingMessage.bookingId]: (
          current[bookingMessage.bookingId] ?? []
        ).map((currentMessage) =>
          currentMessage.id === bookingMessage.id
            ? {
                ...currentMessage,
                readByOwnerAt: readAt,
              }
            : currentMessage,
        ),
      }));

      setBookingMessages((current) => ({
        ...current,
        [bookingMessage.bookingId]: (
          current[bookingMessage.bookingId] ?? []
        ).map((currentMessage) =>
          currentMessage.id === bookingMessage.id
            ? {
                ...currentMessage,
                readByOwnerAt: readAt,
              }
            : currentMessage,
        ),
      }));
    } catch (error: unknown) {
      console.error(
        "Could not mark the customer message as read:",
        error,
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "The message could not be marked as read.",
      );
    } finally {
      setMarkingMessageReadId(null);
    }
  }


  const openBookingRequests: PendingBookingRequest[] = bookings
    .map((booking) => ({
      booking,
      calendarEvent:
        calendarEvents.find(
          (calendarEvent) => calendarEvent.bookingId === booking.id,
        ) ?? null,
    }))
    .filter(({ booking, calendarEvent }) => {
      const isOpenBooking =
        booking.paymentStatus === "AWAITING_APPROVAL" ||
        booking.paymentStatus === "AWAITING_PAYMENT" ||
        (!booking.paymentStatus &&
          (!calendarEvent || calendarEvent.status === "PENDING"));

      return (
        isOpenBooking ||
        doesBookingNeedOwnerResponse(booking.id)
      );
    })
    .sort(
      (first, second) =>
        new Date(first.booking.appointmentDateTime).getTime() -
        new Date(second.booking.appointmentDateTime).getTime(),
    );

  async function loadBookingMessages(
    bookingId: string,
  ): Promise<BookingMessage[]> {
    try {
      setLoadingMessagesBookingId(bookingId);
      setMessageErrors((current) => ({
        ...current,
        [bookingId]: "",
      }));

      const result = await client.models.BookingMessage.list({
        filter: {
          bookingId: {
            eq: bookingId,
          },
        },
      });

      if (result.errors?.length) {
        throw new Error(
          result.errors.map((error) => error.message).join(", "),
        );
      }

      const conversationMessages = [...result.data].sort(
        (first, second) =>
          new Date(first.createdAt).getTime() -
          new Date(second.createdAt).getTime(),
      );

      setBookingMessages((current) => ({
        ...current,
        [bookingId]: conversationMessages,
      }));

      return conversationMessages;
    } catch (error: unknown) {
      console.error("Could not load owner booking messages:", error);

      setMessageErrors((current) => ({
        ...current,
        [bookingId]:
          error instanceof Error
            ? error.message
            : "The booking conversation could not be loaded.",
      }));

      return [];
    } finally {
      setLoadingMessagesBookingId(null);
    }
  }

  async function toggleBookingMessages(bookingId: string) {
    if (expandedMessagesBookingId === bookingId) {
      setExpandedMessagesBookingId(null);
      setHighlightedMessageId(null);
      return;
    }

    const firstUnreadMessage =
      (historyMessagesByBooking[bookingId] ?? []).find(
        (bookingMessage) =>
          bookingMessage.messageType === "CHAT" &&
          bookingMessage.senderRole === "CUSTOMER" &&
          !bookingMessage.readByOwnerAt,
      ) ?? null;

    setExpandedMessagesBookingId(bookingId);

    const loadedMessages = await loadBookingMessages(bookingId);

    const messageToHighlight =
      firstUnreadMessage ??
      loadedMessages.find(
        (bookingMessage) =>
          bookingMessage.senderRole === "CUSTOMER" &&
          !bookingMessage.readByOwnerAt,
      ) ??
      null;

    if (messageToHighlight) {
      setHighlightedMessageId(messageToHighlight.id);

      window.setTimeout(() => {
        document
          .getElementById(
            `booking-message-${messageToHighlight.id}`,
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
      }, 120);

      window.setTimeout(() => {
        setHighlightedMessageId((currentId) =>
          currentId === messageToHighlight.id ? null : currentId,
        );
      }, 3200);
    }

    try {
      await markCustomerMessagesRead(bookingId);
    } catch (error: unknown) {
      console.error("Could not mark customer messages as read:", error);

      setMessageErrors((current) => ({
        ...current,
        [bookingId]:
          error instanceof Error
            ? error.message
            : "The messages were opened, but could not be marked as read.",
      }));
    }
  }


  async function sendOwnerMessage(booking: Booking) {
    const draft = messageDrafts[booking.id]?.trim() ?? "";

    if (!draft) {
      setMessageErrors((current) => ({
        ...current,
        [booking.id]: "Enter a message before sending.",
      }));
      return;
    }

    if (!profile) {
      setMessageErrors((current) => ({
        ...current,
        [booking.id]: "The owner profile could not be found.",
      }));
      return;
    }

    if (!booking.customerUserId) {
      setMessageErrors((current) => ({
        ...current,
        [booking.id]:
          "This booking is not linked to a customer account.",
      }));
      return;
    }

    try {
      setSendingMessageBookingId(booking.id);
      setMessageErrors((current) => ({
        ...current,
        [booking.id]: "",
      }));

      const currentUser = await getCurrentUser();

      if (currentUser.userId !== profile.userId) {
        throw new Error(
          "The signed-in user does not match this owner profile.",
        );
      }

      const result = await client.models.BookingMessage.create({
        bookingId: booking.id,
        customerUserId: booking.customerUserId,
        ownerUserId: currentUser.userId,
        ownerProfileId: profile.id,
        senderUserId: currentUser.userId,
        senderRole: "OWNER",
        senderName: profile.name,
        message: draft,
        messageType: "CHAT",
        readByOwnerAt: new Date().toISOString(),
      } as any);

      if (result.errors?.length) {
        throw new Error(
          result.errors.map((error) => error.message).join(", "),
        );
      }

      if (!result.data) {
        throw new Error("The owner message was not created.");
      }

      const createdMessage = result.data;

      setBookingMessages((current) => ({
        ...current,
        [booking.id]: [
          ...(current[booking.id] ?? []),
          createdMessage,
        ],
      }));

      setHistoryMessagesByBooking((current) => ({
        ...current,
        [booking.id]: [
          ...(current[booking.id] ?? []),
          createdMessage,
        ],
      }));

      setMessageDrafts((current) => ({
        ...current,
        [booking.id]: "",
      }));
    } catch (error: unknown) {
      console.error("Could not send owner message:", error);

      setMessageErrors((current) => ({
        ...current,
        [booking.id]:
          error instanceof Error
            ? error.message
            : "The message could not be sent.",
      }));
    } finally {
      setSendingMessageBookingId(null);
    }
  }

  function beginBookingDateUpdate(booking: Booking) {
    const currentDate = new Date(booking.appointmentDateTime);

    if (Number.isNaN(currentDate.getTime())) {
      setMessage("The current booking date is invalid.");
      return;
    }

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const hours = String(currentDate.getHours()).padStart(2, "0");
    const minutes = String(currentDate.getMinutes()).padStart(2, "0");

    setProposedBookingDate(`${year}-${month}-${day}`);
    setProposedBookingTime(`${hours}:${minutes}`);
    setEditingDateBookingId(booking.id);
    setMessage("");
  }

  function cancelBookingDateUpdate() {
    if (updatingDateBookingId) {
      return;
    }

    setEditingDateBookingId(null);
    setProposedBookingDate("");
    setProposedBookingTime("09:00");
  }

  async function updateBookingDate(
    request: PendingBookingRequest,
  ) {
    if (!profile) {
      setMessage("The owner profile could not be found.");
      return;
    }

    if (!request.calendarEvent) {
      setMessage(
        "This booking does not have a matching calendar event to update.",
      );
      return;
    }

    if (!request.booking.customerUserId) {
      setMessage(
        "This booking is not linked to a customer account, so the date-change message cannot be created.",
      );
      return;
    }

    if (!proposedBookingDate || !proposedBookingTime) {
      setMessage("Choose the agreed date and time.");
      return;
    }

    const proposedDateTime = new Date(
      `${proposedBookingDate}T${proposedBookingTime}:00`,
    );

    if (Number.isNaN(proposedDateTime.getTime())) {
      setMessage("The proposed date or time is invalid.");
      return;
    }

    if (proposedDateTime.getTime() < Date.now()) {
      setMessage("The new booking date and time must be in the future.");
      return;
    }

    const proposedDateKey = proposedBookingDate;

    const conflictingEvent = calendarEvents.find((calendarEvent) => {
      if (
        calendarEvent.id === request.calendarEvent?.id ||
        calendarEvent.experienceId !== request.booking.experienceId
      ) {
        return false;
      }

      if (
        calendarEvent.status !== "PENDING" &&
        calendarEvent.status !== "ACCEPTED" &&
        calendarEvent.status !== "BLOCKED"
      ) {
        return false;
      }

      const eventDate = new Date(calendarEvent.startDateTime);

      if (Number.isNaN(eventDate.getTime())) {
        return false;
      }

      const eventDateKey = [
        eventDate.getFullYear(),
        String(eventDate.getMonth() + 1).padStart(2, "0"),
        String(eventDate.getDate()).padStart(2, "0"),
      ].join("-");

      return eventDateKey === proposedDateKey;
    });

    if (conflictingEvent) {
      setMessage(
        "That date is already unavailable for this experience. Choose another date.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Update this booking to ${proposedDateTime.toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}?`,
    );

    if (!confirmed) {
      return;
    }

    const previousCalendarDateTime =
      request.calendarEvent.startDateTime;

    try {
      setUpdatingDateBookingId(request.booking.id);
      setMessage("");

      const calendarResult =
        await client.models.ExperienceCalendarEvent.update({
          id: request.calendarEvent.id,
          startDateTime: proposedDateTime.toISOString(),
        } as any);

      if (calendarResult.errors?.length) {
        throw new Error(
          calendarResult.errors
            .map((error) => error.message)
            .join(", "),
        );
      }

      if (!calendarResult.data) {
        throw new Error(
          "The calendar event date could not be updated.",
        );
      }

      const bookingResult = await client.models.Booking.update({
        id: request.booking.id,
        appointmentDateTime: proposedDateTime.toISOString(),
      } as any);

      if (bookingResult.errors?.length || !bookingResult.data) {
        try {
          await client.models.ExperienceCalendarEvent.update({
            id: request.calendarEvent.id,
            startDateTime: previousCalendarDateTime,
          } as any);
        } catch (rollbackError: unknown) {
          console.error(
            "The booking update failed and the calendar rollback also failed:",
            rollbackError,
          );
        }

        throw new Error(
          bookingResult.errors?.length
            ? bookingResult.errors
                .map((error) => error.message)
                .join(", ")
            : "The Booking date could not be updated.",
        );
      }

      const currentUser = await getCurrentUser();

      const messageResult =
        await client.models.BookingMessage.create({
          bookingId: request.booking.id,
          customerUserId: request.booking.customerUserId,
          ownerUserId: currentUser.userId,
          ownerProfileId: profile.id,
          senderUserId: currentUser.userId,
          senderRole: "OWNER",
          senderName: profile.name,
          message: `As agreed, the booking date was updated to ${proposedDateTime.toLocaleString(
            "en-US",
            {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            },
          )}.`,
          messageType: "BOOKING_DATE_CHANGED",
          readByOwnerAt: new Date().toISOString(),
        } as any);

      if (messageResult.errors?.length) {
        throw new Error(
          messageResult.errors
            .map((error) => error.message)
            .join(", "),
        );
      }

      setCalendarEvents((currentEvents) =>
        currentEvents.map((calendarEvent) =>
          calendarEvent.id === calendarResult.data?.id
            ? calendarResult.data
            : calendarEvent,
        ),
      );

      setBookings((currentBookings) =>
        currentBookings.map((booking) =>
          booking.id === bookingResult.data?.id
            ? bookingResult.data
            : booking,
        ),
      );

      if (messageResult.data) {
        const createdDateChangeMessage = messageResult.data;

        setBookingMessages((current) => ({
          ...current,
          [request.booking.id]: [
            ...(current[request.booking.id] ?? []),
            createdDateChangeMessage,
          ],
        }));

        setHistoryMessagesByBooking((current) => ({
          ...current,
          [request.booking.id]: [
            ...(current[request.booking.id] ?? []),
            createdDateChangeMessage,
          ],
        }));
      }

      setEditingDateBookingId(null);
      setProposedBookingDate("");
      setProposedBookingTime("09:00");

      setMessage(
        `${request.booking.customerName}'s booking date was updated successfully.`,
      );
    } catch (error: unknown) {
      console.error("Could not update the booking date:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "The booking date could not be updated.",
      );
    } finally {
      setUpdatingDateBookingId(null);
    }
  }

  async function updateBookingStatus(
    request: PendingBookingRequest,
    status: "ACCEPTED" | "REJECTED",
  ) {
    if (!profile) {
      setMessage("The owner profile could not be found.");
      return;
    }

    if (!request.booking.customerUserId) {
      setMessage(
        "This booking does not contain the customer's account ID, so an in-app message cannot be created.",
      );
      return;
    }

    if (!request.calendarEvent) {
      setMessage(
        "This booking does not have a matching calendar event to update.",
      );
      return;
    }

    try {
      setUpdatingBookingId(request.booking.id);
      setMessage("");

      const calendarResult =
        await client.models.ExperienceCalendarEvent.update({
          id: request.calendarEvent.id,
          status,
        } as any);

      if (calendarResult.errors?.length) {
        throw new Error(
          calendarResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (!calendarResult.data) {
        throw new Error("The booking calendar status could not be updated.");
      }

      const bookingResult = await client.models.Booking.update({
        id: request.booking.id,
        status,
        paymentStatus:
          status === "ACCEPTED" ? "AWAITING_PAYMENT" : "REJECTED",
      } as any);

      if (bookingResult.errors?.length) {
        throw new Error(
          bookingResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (!bookingResult.data) {
        throw new Error("The booking record status could not be updated.");
      }

      setCalendarEvents((currentEvents) =>
        currentEvents.map((calendarEvent) =>
          calendarEvent.id === calendarResult.data?.id
            ? calendarResult.data
            : calendarEvent,
        ),
      );

      setBookings((currentBookings) =>
        currentBookings.map((booking) =>
          booking.id === bookingResult.data?.id
            ? bookingResult.data
            : booking,
        ),
      );

      try {
        if (status === "ACCEPTED") {
          setMessage("Creating the secure Stripe payment session...");

          await createCheckoutSession(request.booking.id);

          const approvedMessageResult =
            await client.models.BookingMessage.create({
              bookingId: request.booking.id,
              customerUserId: request.booking.customerUserId,
              ownerUserId: profile.userId,
              ownerProfileId: profile.id,
              senderRole: "SYSTEM",
              senderName: "Coast Life",
              message: "Your booking request has been approved.",
              messageType: "BOOKING_APPROVED",
            } as any);

          if (approvedMessageResult.errors?.length) {
            throw new Error(
              approvedMessageResult.errors
                .map((error) => error.message)
                .join(", "),
            );
          }

          const awaitingPaymentMessageResult =
            await client.models.BookingMessage.create({
              bookingId: request.booking.id,
              customerUserId: request.booking.customerUserId,
              ownerUserId: profile.userId,
              ownerProfileId: profile.id,
              senderRole: "SYSTEM",
              senderName: "Coast Life",
              message:
                "Your booking will be confirmed once payment is received.",
              messageType: "AWAITING_PAYMENT",
            } as any);

          if (awaitingPaymentMessageResult.errors?.length) {
            throw new Error(
              awaitingPaymentMessageResult.errors
                .map((error) => error.message)
                .join(", "),
            );
          }

          setMessage(
            `${request.booking.customerName}'s booking was approved and is awaiting payment. The customer can view the update in My Bookings.`,
          );
        } else {
          const rejectedMessageResult =
            await client.models.BookingMessage.create({
              bookingId: request.booking.id,
              customerUserId: request.booking.customerUserId,
              ownerUserId: profile.userId,
              ownerProfileId: profile.id,
              senderRole: "SYSTEM",
              senderName: "Coast Life",
              message:
                "Unfortunately, your booking request was not approved.",
              messageType: "BOOKING_REJECTED",
            } as any);

          if (rejectedMessageResult.errors?.length) {
            throw new Error(
              rejectedMessageResult.errors
                .map((error) => error.message)
                .join(", "),
            );
          }

          setMessage(
            `${request.booking.customerName}'s booking was rejected. The customer can view the update in My Bookings.`,
          );
        }
      } catch (notificationError: unknown) {
        console.error(
          "The booking status was updated, but its Stripe session or in-app message could not be completed:",
          notificationError,
        );

        setMessage(
          status === "ACCEPTED"
            ? `${request.booking.customerName}'s booking was approved, but the payment session or in-app message could not be completed.`
            : `${request.booking.customerName}'s booking was rejected, but the in-app message could not be created.`,
        );
      }
    } catch (error) {
      console.error("Could not update booking status:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update the booking status.",
      );
    } finally {
      setUpdatingBookingId(null);
    }
  }

  async function sendPartnerMessage(request: OwnerAccessRequest) {
    const draft = partnerMessageDrafts[request.id]?.trim() ?? "";

    if (!draft) {
      setMessage("Enter a message before sending.");
      return;
    }

    try {
      setSendingPartnerMessageId(request.id);
      setMessage("");

      const currentUser = await getCurrentUser();
      const result = await client.models.OwnerAccessMessage.create({
        ownerAccessRequestId: request.id,
        applicantUserId: request.applicantUserId,
        moderatorEmail: request.moderatorEmail,
        moderatorUserId: currentUser.userId,
        senderUserId: currentUser.userId,
        senderRole: "MODERATOR",
        senderName: profile?.name || "Coast Life Moderator",
        message: draft,
        messageType: "CHAT",
        readByModeratorAt: new Date().toISOString(),
      } as any);

      if (result.errors?.length || !result.data) {
        throw new Error(
          result.errors?.map((error) => error.message).join(", ") ||
            "The moderator message was not created.",
        );
      }

      setPartnerMessagesByRequest((current) => ({
        ...current,
        [request.id]: [...(current[request.id] ?? []), result.data],
      }));
      setPartnerMessageDrafts((current) => ({ ...current, [request.id]: "" }));
    } catch (error: unknown) {
      console.error("Could not send partner-request message:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "The partner-request message could not be sent.",
      );
    } finally {
      setSendingPartnerMessageId(null);
    }
  }

  async function updatePartnerRequestStatus(
    request: OwnerAccessRequest,
    status: "APPROVED" | "REJECTED",
  ) {
    try {
      setUpdatingPartnerRequestId(request.id);
      setMessage("");

      const currentUser = await getCurrentUser();
      const reviewedAt = new Date().toISOString();

      let updatedPartnerRequest: OwnerAccessRequest;

      if (status === "APPROVED") {
        console.log("Calling approveOwnerRequest backend mutation:", request.id);

        const approvalResult = await client.mutations.approveOwnerRequest({
          requestId: request.id,
        });

        if (approvalResult.errors?.length) {
          throw new Error(
            approvalResult.errors.map((error) => error.message).join(", "),
          );
        }

        if (approvalResult.data !== "APPROVED") {
          throw new Error(
            "The backend did not confirm the owner request approval.",
          );
        }

        const refreshedRequestResult =
          await client.models.OwnerAccessRequest.get({
            id: request.id,
          });

        if (
          refreshedRequestResult.errors?.length ||
          !refreshedRequestResult.data
        ) {
          throw new Error(
            refreshedRequestResult.errors
              ?.map((error) => error.message)
              .join(", ") ||
              "The approved partner request could not be reloaded.",
          );
        }

        updatedPartnerRequest = refreshedRequestResult.data;
      } else {
        const requestResult = await client.models.OwnerAccessRequest.update({
          id: request.id,
          status,
          reviewedByUserId: currentUser.userId,
          reviewedAt,
        } as any);

        if (requestResult.errors?.length || !requestResult.data) {
          throw new Error(
            requestResult.errors?.map((error) => error.message).join(", ") ||
              "The partner request was not updated.",
          );
        }

        updatedPartnerRequest = requestResult.data;
      }

      const messageResult = await client.models.OwnerAccessMessage.create({
        ownerAccessRequestId: request.id,
        applicantUserId: request.applicantUserId,
        moderatorEmail: request.moderatorEmail,
        applicantEmail: request.applicantEmail,
        moderatorUserId: currentUser.userId,
        senderUserId: currentUser.userId,
        senderRole: "SYSTEM",
        senderName: "Coast Life",
        message:
          status === "APPROVED"
            ? "Congratulations! Your experience partner request was approved. You can now access the Owner Dashboard."
            : "Your experience partner request was not approved at this time.",
        messageType:
          status === "APPROVED"
            ? "REQUEST_APPROVED"
            : "REQUEST_REJECTED",
        readByModeratorAt: reviewedAt,
      } as any);

      if (messageResult.errors?.length || !messageResult.data) {
        throw new Error(
          messageResult.errors?.map((error) => error.message).join(", ") ||
            "The decision message was not created.",
        );
      }

      const createdDecisionMessage = messageResult.data;

      setPartnerRequestHistory((current) =>
        current.map((item) =>
          item.id === request.id ? updatedPartnerRequest : item,
        ),
      );

      setPartnerRequests((current) =>
        status === "APPROVED"
          ? current.filter((item) => item.id !== request.id)
          : current.map((item) =>
              item.id === request.id ? updatedPartnerRequest : item,
            ),
      );

      setPartnerMessagesByRequest((current) => ({
        ...current,
        [request.id]: [
          ...(current[request.id] ?? []),
          createdDecisionMessage,
        ],
      }));

      setMessage(
        status === "APPROVED"
          ? `${request.applicantName}'s experience partner request was approved and the experience was created.`
          : `${request.applicantName}'s experience partner request was rejected.`,
      );
    } catch (error: unknown) {
      console.error("Could not update partner request:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "The partner request could not be updated.",
      );
    } finally {
      setUpdatingPartnerRequestId(null);
    }
  }

  async function createCheckoutSession(
    bookingId: string,
  ): Promise<{ checkoutUrl: string; reused?: boolean }> {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();

    if (!idToken) {
      throw new Error(
        "The signed-in owner's authentication token could not be found.",
      );
    }

    const endpoint = outputs.custom?.API?.stripeRestApi?.endpoint;

    if (!endpoint) {
      throw new Error(
        "The Stripe REST API endpoint is missing from amplify_outputs.json.",
      );
    }

    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/create-checkout-session`,
      {
        method: "POST",
        headers: {
          Authorization: idToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ bookingId }),
      },
    );

    const responseText = await response.text();

    let responseData: {
      message?: string;
      checkoutUrl?: string;
      reused?: boolean;
    } = {};

    if (responseText) {
      try {
        responseData = JSON.parse(responseText) as typeof responseData;
      } catch {
        throw new Error(
          `Stripe returned an unreadable response: ${responseText}`,
        );
      }
    }

    if (!response.ok) {
      throw new Error(
        responseData.message ||
          `The Checkout request failed with status ${response.status}.`,
      );
    }

    if (!responseData.checkoutUrl) {
      throw new Error("Stripe did not return a Checkout payment link.");
    }

    return {
      checkoutUrl: responseData.checkoutUrl,
      reused: responseData.reused,
    };
  }

  if (isLoading || ownerAccessStatus === "CHECKING") {
    return <p>Checking owner dashboard access...</p>;
  }

  if (ownerAccessStatus !== "APPROVED") {
    return (
      <main className="owner-dashboard">
        <header className="owner-dashboard-header">
          <div>
            <h1>Experience Owner Dashboard</h1>
            <p>Signed in as {userEmail}</p>
          </div>

          <div className="owner-dashboard-header-actions">
            <button type="button" onClick={signOut}>
              Sign Out
            </button>
          </div>
        </header>

        <section className="dashboard-section">
          <h2>Owner Dashboard Access</h2>

          {ownerAccessStatus === "PENDING" && (
            <p>
              Your Experience Partner request is still under review. The Owner
              Dashboard will become available after Coast Life approves it.
            </p>
          )}

          {ownerAccessStatus === "REJECTED" && (
            <p>
              Your Experience Partner request was not approved. Review the
              messages on the Offer Experiences page for more information.
            </p>
          )}

          {ownerAccessStatus === "NOT_REQUESTED" && (
            <div>
              <p>
                You must submit an Experience Partner request before using the
                Owner Dashboard.
              </p>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  navigate("/offer-experiences");
                }}
              >
                Request to Offer Experiences
              </button>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="owner-dashboard">
      <header className="owner-dashboard-header">
        <div>
          <h1>Experience Owner Dashboard</h1>
          <p>Signed in as {userEmail}</p>
          <small>Dashboard version: Pending List 2026-07-31</small>
        </div>

        <div className="owner-dashboard-header-actions">
          {stripeSetupState === "CHECKING" && (
            <span>Checking Stripe payments...</span>
          )}

          {stripeSetupState === "ACTIVE" && (
            <span>Stripe Payments Active</span>
          )}

          {stripeSetupState === "ERROR" && (
            <span>{stripeSetupError || "Stripe setup needs attention."}</span>
          )}

          
        </div>
      </header>

      {message && <p className="dashboard-message">{message}</p>}

      {stripeSetupState === "NEEDS_ONBOARDING" && showStripeOnboarding && (
        <section className="dashboard-section">
          <h2>Complete Stripe Payment Setup</h2>
          <p>
            Complete the Stripe setup below so Coast Life can send booking
            payments to your connected merchant account.
          </p>

          <div
            style={{
              marginTop: 20,
              padding: 20,
              border: "1px solid #dbe2ea",
              borderRadius: 14,
              background: "#ffffff",
            }}
          >
            <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
              <ConnectAccountOnboarding
                onExit={() => {
                  void ensureStripeSetup();
                  void loadDashboard();
                }}
              />
            </ConnectComponentsProvider>
          </div>
        </section>
      )}

      {stripeSetupState === "ERROR" && (
        <section className="dashboard-section">
          <h2>Stripe Payment Setup</h2>
          <p>{stripeSetupError}</p>
        </section>
      )}

      {!profile ? (
        <section className="dashboard-section">
          <h2>Create Owner Profile</h2>

          <form onSubmit={createProfile}>
            <div>
              <label htmlFor="profile-name">Owner name</label>

              <input
                id="profile-name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="profile-email">Email</label>

              <input
                id="profile-email"
                type="email"
                value={userEmail}
                readOnly
              />
            </div>

            <div>
              <label htmlFor="profile-phone">Phone</label>

              <input
                id="profile-phone"
                value={profilePhone}
                onChange={(event) => setProfilePhone(event.target.value)}
              />
            </div>

            <button type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Profile"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="dashboard-section">
            <h2>Owner Profile</h2>

            <p>
              <strong>Name:</strong> {profile.name}
            </p>

            <p>
              <strong>Email:</strong> {profile.email}
            </p>

            <p>
              <strong>Phone:</strong> {profile.phone || "Not provided"}
            </p>

            {totalUnreadCustomerMessages > 0 && (
              <button
                type="button"
                className="owner-profile-unread-button"
                onClick={openAllUnreadCustomerMessages}
              >
                <span className="owner-profile-unread-copy">
                  <strong>
                    {totalUnreadCustomerMessages} unread customer message
                    {totalUnreadCustomerMessages === 1 ? "" : "s"}
                  </strong>
                  <span>Click to open all unread messages.</span>
                </span>

                <span className="owner-profile-unread-count">
                  {totalUnreadCustomerMessages}
                </span>
              </button>
            )}
          </section>

          {isModerator && (
          <section className="dashboard-section">
            <div className="booking-requests-header">
              <div>
                <h2>Experience Partner Requests</h2>
                
              </div>

              <div className="booking-requests-header-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setShowPartnerRequestHistory(true);
                  }}
                >
                  Partner request history
                </button>
              </div>
            </div>

           {partnerRequests.length === 0 ? (
  <div className="empty-state-card">
    <h3>No Pending Partner Requests</h3>
    <p>
      All experience partner requests have been reviewed.
      You can view previous requests and conversations by
      selecting <strong>Partner Request History</strong>.
    </p>
  </div>
) : (
              <div className="booking-request-list">
                {partnerRequests.map((request) => (
                  <article className="booking-request-card" key={request.id}>
                    <div className="booking-request-main">
                      <div>
                        <h3>{request.applicantName}</h3>
                        <p className="booking-request-date">
                          Submitted{" "}
                          {new Date(request.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <span className="pending-booking-badge">
                        {request.status ?? "PENDING"}
                      </span>
                    </div>

                    <dl className="booking-request-details">
                      <div>
                        <dt>Applicant name</dt>
                        <dd>{request.applicantName}</dd>
                      </div>

                      <div>
                        <dt>Email</dt>
                        <dd>
                          <a href={`mailto:${request.applicantEmail}`}>
                            {request.applicantEmail}
                          </a>
                        </dd>
                      </div>

                      <div>
                        <dt>Phone</dt>
                        <dd>{request.applicantPhone || "Not provided"}</dd>
                      </div>

                      <div>
                        <dt>Business name</dt>
                        <dd>{request.businessName || "Not provided"}</dd>
                      </div>

                      <div>
                        <dt>Experiences requested</dt>
                        <dd>
                          {request.experienceTypes?.length
                            ? request.experienceTypes.join(", ")
                            : "Not provided"}
                        </dd>
                      </div>

                      <div>
                        <dt>Request status</dt>
                        <dd>{request.status ?? "PENDING"}</dd>
                      </div>
                    </dl>

                    <div
                      style={{
                        marginTop: 16,
                        padding: 16,
                        background: "#f8fafc",
                        border: "1px solid #dbe2ea",
                        borderRadius: 14,
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 8px",
                          color: "#334155",
                          fontSize: 14,
                          fontWeight: 800,
                        }}
                      >
                        About the proposed experience
                      </p>

                      <p
                        style={{
                          margin: 0,
                          color: "#475569",
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {request.description || "No description was provided."}
                      </p>
                    </div>

                    {request.experienceImageUrl ? (
                      <PartnerRequestImage
                        imagePath={request.experienceImageUrl}
                        applicantName={request.applicantName}
                      />
                    ) : (
                      <p
                        style={{
                          margin: "14px 0",
                          padding: 12,
                          color: "#64748b",
                          background: "#f8fafc",
                          border: "1px solid #dbe2ea",
                          borderRadius: 12,
                        }}
                      >
                        No experience image was submitted with this request.
                      </p>
                    )}

                    <div className="booking-conversation-section">
                      <button
                        type="button"
                        className="booking-conversation-toggle"
                        aria-expanded={expandedPartnerRequestId === request.id}
                        onClick={() =>
                          setExpandedPartnerRequestId((current) =>
                            current === request.id ? null : request.id,
                          )
                        }
                      >
                        <span>Messages</span>
                        <span aria-hidden="true">
                          {expandedPartnerRequestId === request.id ? "▲" : "▼"}
                        </span>
                      </button>

                      {expandedPartnerRequestId === request.id && (
                        <div className="booking-conversation-panel">
                          {(partnerMessagesByRequest[request.id] ?? []).length ===
                          0 ? (
                            <p>No messages were found for this request.</p>
                          ) : (
                            (partnerMessagesByRequest[request.id] ?? []).map(
                              (partnerMessage) => (
                                <article
                                  key={partnerMessage.id}
                                  className="booking-message-card"
                                  style={{ marginBottom: 10 }}
                                >
                                  <strong>
                                    {partnerMessage.senderName ||
                                      partnerMessage.senderRole ||
                                      "Message"}
                                  </strong>
                                  <p>{partnerMessage.message}</p>
                                  <small>
                                    {new Date(
                                      partnerMessage.createdAt,
                                    ).toLocaleString()}
                                  </small>
                                </article>
                              ),
                            )
                          )}

                          <textarea
                            rows={3}
                            value={partnerMessageDrafts[request.id] ?? ""}
                            onChange={(event) =>
                              setPartnerMessageDrafts((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                            placeholder="Send a message to the applicant."
                            style={{ width: "100%", marginTop: 10 }}
                          />

                          <button
                            type="button"
                            className="primary-button"
                            disabled={sendingPartnerMessageId === request.id}
                            onClick={() => void sendPartnerMessage(request)}
                            style={{ marginTop: 10 }}
                          >
                            {sendingPartnerMessageId === request.id
                              ? "Sending..."
                              : "Send Message"}
                          </button>
                        </div>
                      )}
                    </div>

                    {request.status === "PENDING" && (
                      <div
                        className="booking-request-actions"
                        style={{ display: "flex", gap: 10, marginTop: 12 }}
                      >
                        <button
                          type="button"
                          className="primary-button"
                          disabled={updatingPartnerRequestId === request.id}
                          onClick={() =>
                            void updatePartnerRequestStatus(request, "APPROVED")
                          }
                        >
                          {updatingPartnerRequestId === request.id
                            ? "Updating..."
                            : "Approve"}
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          disabled={updatingPartnerRequestId === request.id}
                          onClick={() =>
                            void updatePartnerRequestStatus(request, "REJECTED")
                          }
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          )}

          <section className="dashboard-section">
            <div className="booking-requests-header">
              <div>
                <h2>Open Booking Requests</h2>
                <p>
                  Review requests awaiting approval and approved bookings
                  awaiting customer payment. Found {openBookingRequests.length}{" "}
                  open booking{openBookingRequests.length === 1 ? "" : "s"}.
                </p>
              </div>

              <div className="booking-requests-header-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setShowAllBookings(true);
                  }}
                >
                  Bookings history
                </button>

                
              </div>
            </div>

            {openBookingRequests.length === 0 ? (
              <p>There are no open booking requests.</p>
            ) : (
              <div className="booking-request-list">
                {openBookingRequests.map(
                  ({ booking, calendarEvent }) => {
                    const isAwaitingPayment =
                      booking.paymentStatus === "AWAITING_PAYMENT";

                    const isPendingApproval =
                      booking.paymentStatus === "AWAITING_APPROVAL" ||
                      booking.status === "PENDING" ||
                      (!booking.paymentStatus && !booking.status);

                    const needsOwnerResponse =
                      doesBookingNeedOwnerResponse(booking.id);

                    return (
                    <article
                      id={`owner-open-booking-${booking.id}`}
                      className="booking-request-card"
                      key={booking.id}
                    >
                      <div className="booking-request-main">
                        <div>
                          <h3>
                            {booking.experienceName || "Experience Booking"}
                          </h3>

                          <p className="booking-request-date">
                            {formatBookingDateTime(
                              booking.appointmentDateTime,
                            )}
                          </p>
                        </div>

                        <span
                          className={`pending-booking-badge ${
                            needsOwnerResponse
                              ? "response-needed-booking-badge"
                              : ""
                          }`}
                        >
                          {needsOwnerResponse
                            ? "Response Needed"
                            : isAwaitingPayment
                              ? "Approved — Awaiting Payment"
                              : isPendingApproval
                                ? "Pending Owner Approval"
                                : getBookingDisplayStatus(booking)}
                        </span>
                      </div>

                      <dl className="booking-request-details">
                        <div>
                          <dt>Customer</dt>
                          <dd>{booking.customerName}</dd>
                        </div>

                        <div>
                          <dt>Email</dt>
                          <dd>
                            <a href={`mailto:${booking.customerEmail}`}>
                              {booking.customerEmail}
                            </a>
                          </dd>
                        </div>

                        <div>
                          <dt>Phone</dt>
                          <dd>
                            <a href={`tel:${booking.customerPhone}`}>
                              {booking.customerPhone}
                            </a>
                          </dd>
                        </div>
                      </dl>

                      {editingDateBookingId === booking.id && (
                        <div className="booking-date-update-section">
                          <div className="booking-date-update-panel">
                            <p>
                              <strong>Update to the agreed date and time</strong>
                            </p>

                            <div className="booking-date-update-fields">
                              <label>
                                Date
                                <input
                                  type="date"
                                  value={proposedBookingDate}
                                  min={new Date()
                                    .toISOString()
                                    .slice(0, 10)}
                                  disabled={
                                    updatingDateBookingId === booking.id
                                  }
                                  onChange={(event) => {
                                    setProposedBookingDate(
                                      event.target.value,
                                    );
                                  }}
                                />
                              </label>

                              <label>
                                Time
                                <input
                                  type="time"
                                  value={proposedBookingTime}
                                  disabled={
                                    updatingDateBookingId === booking.id
                                  }
                                  onChange={(event) => {
                                    setProposedBookingTime(
                                      event.target.value,
                                    );
                                  }}
                                />
                              </label>
                            </div>

                            <div className="booking-date-update-actions">
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={
                                  updatingDateBookingId === booking.id
                                }
                                onClick={cancelBookingDateUpdate}
                              >
                                Cancel
                              </button>

                              <button
                                type="button"
                                className="primary-button"
                                disabled={
                                  updatingDateBookingId === booking.id ||
                                  !proposedBookingDate ||
                                  !proposedBookingTime
                                }
                                onClick={() => {
                                  void updateBookingDate({
                                    booking,
                                    calendarEvent,
                                  });
                                }}
                              >
                                {updatingDateBookingId === booking.id
                                  ? "Updating..."
                                  : "Save New Date"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="booking-conversation-section">
                        <button
                          type="button"
                          className={`booking-conversation-toggle ${
                            getUnreadCustomerMessageCount(booking.id) > 0
                              ? "has-new-messages"
                              : doesBookingNeedOwnerResponse(booking.id)
                                ? "needs-response"
                                : ""
                          }`}
                          aria-expanded={
                            expandedMessagesBookingId === booking.id
                          }
                          onClick={() => {
                            void toggleBookingMessages(booking.id);
                          }}
                        >
                          <span className="booking-conversation-toggle-label">
                            {getUnreadCustomerMessageCount(booking.id) > 0 ? (
                              <>
                                New messages
                                <span className="booking-message-count">
                                  {getUnreadCustomerMessageCount(booking.id)}
                                </span>
                              </>
                            ) : doesBookingNeedOwnerResponse(booking.id) ? (
                              "Response needed"
                            ) : (
                              "Messages"
                            )}
                          </span>

                          <span aria-hidden="true">
                            {expandedMessagesBookingId === booking.id
                              ? "▲"
                              : "▼"}
                          </span>
                        </button>

                        {expandedMessagesBookingId === booking.id && (
                          <div className="booking-conversation-panel">
                            <p className="booking-conversation-title">
                              Conversation with {booking.customerName}
                            </p>

                            <p className="booking-conversation-purpose">
                              Use this thread for alternate-date discussions,
                              cancellation explanations, special instructions,
                              and other booking questions.
                            </p>

                            {loadingMessagesBookingId === booking.id ? (
                              <p>Loading messages...</p>
                            ) : (bookingMessages[booking.id] ?? []).length ===
                              0 ? (
                              <p>No conversation messages yet.</p>
                            ) : (
                              <div className="booking-conversation-list">
                                {(bookingMessages[booking.id] ?? []).map(
                                  (bookingMessage) => (
                                    <article
                                      id={`booking-message-${bookingMessage.id}`}
                                      className={`booking-conversation-message ${
                                        bookingMessage.messageType !== "CHAT"
                                          ? "system-message"
                                          : bookingMessage.senderRole === "OWNER"
                                            ? "owner-message"
                                            : "customer-message"
                                      } ${
                                        highlightedMessageId ===
                                        bookingMessage.id
                                          ? "highlighted-unread-message"
                                          : ""
                                      }`}
                                      key={bookingMessage.id}
                                    >
                                      <div className="booking-conversation-meta">
                                        <strong>
                                          {bookingMessage.senderName ||
                                            (bookingMessage.senderRole ===
                                            "OWNER"
                                              ? "Experience Owner"
                                              : "Customer")}
                                        </strong>

                                        <span>
                                          {new Date(
                                            bookingMessage.createdAt,
                                          ).toLocaleString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            hour: "numeric",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      </div>

                                      {bookingMessage.messageType &&
                                        bookingMessage.messageType !== "CHAT" && (
                                          <span className="booking-conversation-message-type">
                                            {bookingMessage.messageType
                                              .replaceAll("_", " ")
                                              .toLowerCase()}
                                          </span>
                                        )}

                                      <p>{bookingMessage.message}</p>
                                    </article>
                                  ),
                                )}
                              </div>
                            )}

                            {messageErrors[booking.id] && (
                              <p className="booking-conversation-error">
                                {messageErrors[booking.id]}
                              </p>
                            )}

                            <label className="booking-conversation-composer-label">
                              Reply to customer
                              <textarea
                                rows={3}
                                value={messageDrafts[booking.id] ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;

                                  setMessageDrafts((current) => ({
                                    ...current,
                                    [booking.id]: value,
                                  }));
                                }}
                                placeholder="Suggest another date, explain a cancellation, or share special instructions."
                                disabled={
                                  sendingMessageBookingId === booking.id
                                }
                              />
                            </label>

                            <button
                              type="button"
                              className="primary-button"
                              disabled={
                                sendingMessageBookingId === booking.id
                              }
                              onClick={() => {
                                void sendOwnerMessage(booking);
                              }}
                            >
                              {sendingMessageBookingId === booking.id
                                ? "Sending..."
                                : "Send Message"}
                            </button>
                          </div>
                        )}
                      </div>

                      {!calendarEvent && (
                        <p className="booking-request-warning">
                          No matching calendar event was found for this
                          booking.
                        </p>
                      )}

                      <div className="booking-request-actions">
                        {isPendingApproval ? (
                          <>
                            <button
                              type="button"
                              className="update-booking-date-button"
                              disabled={
                                !calendarEvent ||
                                updatingDateBookingId === booking.id ||
                                updatingBookingId === booking.id
                              }
                              onClick={() => {
                                beginBookingDateUpdate(booking);
                              }}
                            >
                              {editingDateBookingId === booking.id
                                ? "Editing Date"
                                : "Update Booking Date"}
                            </button>

                            <button
                              type="button"
                              className="approve-booking-button"
                              disabled={
                                !calendarEvent ||
                                updatingBookingId === booking.id
                              }
                              onClick={() => {
                                void updateBookingStatus(
                                  { booking, calendarEvent },
                                  "ACCEPTED",
                                );
                              }}
                            >
                              {updatingBookingId === booking.id
                                ? "Updating..."
                                : "Approve Booking"}
                            </button>

                            <button
                              type="button"
                              className="reject-booking-button"
                              disabled={
                                !calendarEvent ||
                                updatingBookingId === booking.id
                              }
                              onClick={() => {
                                void updateBookingStatus(
                                  { booking, calendarEvent },
                                  "REJECTED",
                                );
                              }}
                            >
                              {updatingBookingId === booking.id
                                ? "Updating..."
                                : "Reject Booking"}
                            </button>
                          </>
                        ) : isAwaitingPayment ? (
                          <p className="booking-payment-status-message">
                            Payment is awaiting completion by the customer.
                            This booking will be confirmed when payment is
                            received.
                          </p>
                        ) : needsOwnerResponse ? (
                          <p className="booking-response-needed-message">
                            The customer sent the latest message. Open the
                            conversation above and send a response.
                          </p>
                        ) : null}
                      </div>

                      {isAwaitingPayment &&
                        booking.amountInCents != null &&
                        booking.amountInCents <= 0 && (
                          <p className="booking-request-warning">
                            This booking does not have a valid payment amount.
                          </p>
                        )}

                    </article>
                    );
                  },
                )}
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <h2>My Experiences</h2>

            {experiences.length === 0 ? (
              <p>You have not added any experiences yet.</p>
            ) : (
              <div className="experience-card-grid">
                {experiences.map((experience) => (
                  <article className="experience-card" key={experience.id}>
                    <div className="experience-card-image">
                      {experience.imageUrl ? (
                        <ExperienceImage
                          imagePath={experience.imageUrl}
                          experienceName={experience.name}
                        />
                      ) : (
                        <div className="experience-image-placeholder">
                          No image
                        </div>
                      )}
                    </div>

                    <div className="experience-card-body">
                      <div className="experience-card-heading">
                        <div>
                          <h3>{experience.name}</h3>
                          {experience.experienceType && (
                            <span className="experience-type-badge">
                              {experience.experienceType}
                            </span>
                          )}
                        </div>

                        {experience.estimatedPrice != null && (
                          <strong className="owner-experience-price">
                            ${experience.estimatedPrice.toFixed(2)}
                          </strong>
                        )}
                      </div>

                      <p className="experience-location">
                        {experience.location}
                      </p>

                      {experience.description && (
                        <p className="experience-description">
                          {experience.description}
                        </p>
                      )}
                    </div>

                    <div
                      className="experience-card-actions"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginTop: 16,
                      }}
                    >
                      <button
                        type="button"
                        className="secondary-button"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 42,
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid #2563eb",
                          background: "#2563eb",
                          color: "#ffffff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          beginEditExperience(experience);
                        }}
                        disabled={isSaving}
                        aria-label={`Edit ${experience.name}`}
                      >
                        Edit Experience
                      </button>

                      <button
                        type="button"
                        className="delete-experience-button"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 42,
                          padding: "0 14px",
                          borderRadius: 10,
                          border: "1px solid #dc2626",
                          background: "#dc2626",
                          color: "#ffffff",
                          fontWeight: 700,
                          cursor:
                            deletingexperienceId === experience.id
                              ? "not-allowed"
                              : "pointer",
                        }}
                        onClick={() => {
                          void deleteExperience(experience);
                        }}
                        disabled={deletingexperienceId === experience.id}
                        aria-label={`Delete ${experience.name}`}
                      >
                        {deletingexperienceId === experience.id
                          ? "Deleting..."
                          : "Delete Experience"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {!showAddexperienceForm && (
              <button
                type="button"
                onClick={() => {
                  resetExperienceForm();
                  setMessage("");
                  setShowAddexperienceForm(true);
                }}
              >
                Add Experience
              </button>
            )}
          </section>

          {showAddexperienceForm && (
            <section
              id="owner-experience-form"
              className="dashboard-section"
            >
              <h2>
                {editingExperience
                  ? "Edit Experience"
                  : "Add Experience"}
              </h2>

              <form className="experience-form" onSubmit={addExperience}>
                <div className="experience-form-grid">
                  <div className="form-field">
                    <label htmlFor="experience-name">Experience name</label>
                    <input
                      id="experience-name"
                      value={experienceName}
                      onChange={(event) =>
                        setexperienceName(event.target.value)
                      }
                      disabled={isSaving}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="experience-experience-type">
                      Experience type
                    </label>
                    <select
                      id="experience-experience-type"
                      value={experienceExperienceType}
                      onChange={(event) =>
                        setexperienceExperienceType(event.target.value)
                      }
                      disabled={isSaving}
                      required
                    >
                      <option value="">Choose an experience</option>
                      {EXPERIENCE_TYPES.map((experience) => (
                        <option key={experience} value={experience}>
                          {experience}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="experience-location">Location</label>
                    <input
                      id="experience-location"
                      value={experienceLocation}
                      onChange={(event) =>
                        setexperienceLocation(event.target.value)
                      }
                      disabled={isSaving}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="owner-experience-price">
                      Estimated price
                    </label>
                    <input
                      id="owner-experience-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={experiencePrice}
                      onChange={(event) =>
                        setexperiencePrice(event.target.value)
                      }
                      disabled={isSaving}
                    />
                  </div>

                  <div className="form-field form-field-full">
                    <label htmlFor="experience-description">Description</label>
                    <textarea
                      id="experience-description"
                      rows={5}
                      value={experienceDescription}
                      onChange={(event) =>
                        setexperienceDescription(event.target.value)
                      }
                      disabled={isSaving}
                    />
                  </div>

                  <div className="form-field form-field-full">
                    <label htmlFor="experience-image">Experience image</label>
                    <input
                      ref={experienceImageInputRef}
                      id="experience-image"
                      type="file"
                      accept="image/*"
                      onChange={handleexperienceImageChange}
                      disabled={isSaving}
                      required={!editingExperience}
                    />
                    <small>
                      {editingExperience
                        ? "Choose a new image only if you want to replace the current one. JPEG, PNG, WebP, or GIF. Maximum size: 10 MB."
                        : "JPEG, PNG, WebP, or GIF. Maximum size: 10 MB."}
                    </small>
                  </div>
                </div>

                {experienceImagePreview ? (
                  <div className="experience-image-preview">
                    <img
                      src={experienceImagePreview}
                      alt="Selected experience preview"
                    />
                  </div>
                ) : (
                  editingExperience?.imageUrl && (
                    <div className="experience-image-preview">
                      <ExperienceImage
                        imagePath={editingExperience.imageUrl}
                        experienceName={editingExperience.name}
                      />
                    </div>
                  )
                )}

                {isSaving && uploadProgress > 0 && (
                  <progress
                    className="experience-upload-progress"
                    value={uploadProgress}
                    max="100"
                  >
                    {uploadProgress}%
                  </progress>
                )}

                <div className="experience-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isSaving}
                    onClick={() => {
                      resetExperienceForm();
                      setMessage("");
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isSaving}
                  >
                    {isSaving
                      ? editingExperience
                        ? "Saving Changes..."
                        : "Saving..."
                      : editingExperience
                        ? "Save Changes"
                        : "Save Experience"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
      )}

      {showUnreadMessages && (
        <div
          className="owner-unread-messages-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowUnreadMessages(false);
            }
          }}
        >
          <section
            className="owner-unread-messages-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-unread-messages-title"
          >
            <div className="owner-unread-messages-header">
              <div>
                <h2 id="owner-unread-messages-title">
                  Unread Customer Messages
                </h2>
                <p>
                  Showing {unreadCustomerMessages.length} unread message
                  {unreadCustomerMessages.length === 1 ? "" : "s"}.
                  Messages remain here until individually marked as read.
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowUnreadMessages(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="owner-unread-booking-list">
              {Object.entries(unreadMessagesGroupedByBooking).map(
                ([bookingId, bookingMessageList]) => {
                  const booking = bookings.find(
                    (currentBooking) =>
                      currentBooking.id === bookingId,
                  );

                  return (
                    <article
                      className="owner-unread-booking-card"
                      key={bookingId}
                    >
                      <div className="owner-unread-booking-heading">
                        <div>
                          <h3>
                            {booking?.experienceName ||
                              "Experience Booking"}
                          </h3>
                          <p>
                            {booking
                              ? `${booking.customerName} · ${formatBookingDateTime(
                                  booking.appointmentDateTime,
                                )}`
                              : `Booking ${bookingId}`}
                          </p>
                        </div>

                        <span className="owner-unread-booking-count">
                          {bookingMessageList.length}
                        </span>
                      </div>

                      <div className="owner-unread-message-list">
                        {bookingMessageList.map(
                          (bookingMessage) => (
                            <article
                              className="owner-unread-message-card"
                              key={bookingMessage.id}
                            >
                              <div className="owner-unread-message-meta">
                                <strong>
                                  {bookingMessage.senderName ||
                                    booking?.customerName ||
                                    "Customer"}
                                </strong>

                                <span>
                                  {new Date(
                                    bookingMessage.createdAt,
                                  ).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>

                              <p>{bookingMessage.message}</p>

                              <button
                                type="button"
                                className="owner-mark-message-read-button"
                                disabled={
                                  markingMessageReadId === bookingMessage.id
                                }
                                onClick={() => {
                                  void markOneCustomerMessageRead(
                                    bookingMessage,
                                  );
                                }}
                              >
                                {markingMessageReadId === bookingMessage.id
                                  ? "Marking as Read..."
                                  : "Mark as Read"}
                              </button>
                            </article>
                          ),
                        )}
                      </div>

                      {booking && (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => {
                            setShowUnreadMessages(false);

                            const isOpenBooking =
                              openBookingRequests.some(
                                ({ booking: openBooking }) =>
                                  openBooking.id === booking.id,
                              );

                            if (isOpenBooking) {
                              void toggleBookingMessages(booking.id);

                              window.setTimeout(() => {
                                document
                                  .getElementById(
                                    `owner-open-booking-${booking.id}`,
                                  )
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              }, 150);
                            } else {
                              setShowAllBookings(true);

                              window.setTimeout(() => {
                                document
                                  .getElementById(
                                    `owner-history-booking-${booking.id}`,
                                  )
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              }, 150);
                            }
                          }}
                        >
                          Open Booking Conversation
                        </button>
                      )}
                    </article>
                  );
                },
              )}
            </div>
          </section>
        </div>
      )}


      {isModerator && showPartnerRequestHistory && (
        <div
          className="booking-history-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowPartnerRequestHistory(false);
            }
          }}
        >
          <section
            className="booking-history-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-request-history-title"
          >
            <div className="booking-history-header">
              <div>
                <h2 id="partner-request-history-title">
                  Experience Partner Request History
                </h2>
                <p>
                  Showing {partnerRequestHistory.length} partner request
                  {partnerRequestHistory.length === 1 ? "" : "s"}.
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowPartnerRequestHistory(false);
                  setExpandedPartnerRequestId(null);
                }}
              >
                Close
              </button>
            </div>

            {partnerRequestHistory.length === 0 ? (
              <p>No experience partner requests were found.</p>
            ) : (
              <div className="booking-history-list">
                {partnerRequestHistory.map((request) => (
                  <article
                    id={`owner-partner-history-${request.id}`}
                    className="booking-history-card"
                    key={request.id}
                  >
                    <div className="booking-history-card-heading">
                      <div>
                        <h3>{request.applicantName}</h3>
                        <p>
                          Submitted{" "}
                          {new Date(request.createdAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <span className="booking-history-status">
                        {request.status ?? "PENDING"}
                      </span>
                    </div>

                    <dl className="booking-history-details">
                      <div>
                        <dt>Email</dt>
                        <dd>
                          <a href={`mailto:${request.applicantEmail}`}>
                            {request.applicantEmail}
                          </a>
                        </dd>
                      </div>

                      <div>
                        <dt>Phone</dt>
                        <dd>{request.applicantPhone || "Not provided"}</dd>
                      </div>

                      <div>
                        <dt>Business name</dt>
                        <dd>{request.businessName || "Not provided"}</dd>
                      </div>

                      <div>
                        <dt>Experiences requested</dt>
                        <dd>
                          {request.experienceTypes?.length
                            ? request.experienceTypes.join(", ")
                            : "Not provided"}
                        </dd>
                      </div>

                      <div>
                        <dt>Reviewed</dt>
                        <dd>
                          {request.reviewedAt
                            ? new Date(request.reviewedAt).toLocaleString()
                            : "Not reviewed"}
                        </dd>
                      </div>
                    </dl>

                    <div
                      style={{
                        marginTop: 16,
                        padding: 16,
                        background: "#f8fafc",
                        border: "1px solid #dbe2ea",
                        borderRadius: 14,
                      }}
                    >
                      <strong>About the proposed experience</strong>
                      <p
                        style={{
                          marginBottom: 0,
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.6,
                        }}
                      >
                        {request.description || "No description was provided."}
                      </p>
                    </div>

                    {request.experienceImageUrl && (
                      <PartnerRequestImage
                        imagePath={request.experienceImageUrl}
                        applicantName={request.applicantName}
                      />
                    )}

                    <div className="booking-conversation-section">
                      <button
                        type="button"
                        className="booking-conversation-toggle"
                        aria-expanded={expandedPartnerRequestId === request.id}
                        onClick={() =>
                          setExpandedPartnerRequestId((current) =>
                            current === request.id ? null : request.id,
                          )
                        }
                      >
                        <span>
                          Messages (
                          {(partnerMessagesByRequest[request.id] ?? []).length})
                        </span>
                        <span aria-hidden="true">
                          {expandedPartnerRequestId === request.id ? "▲" : "▼"}
                        </span>
                      </button>

                      {expandedPartnerRequestId === request.id && (
                        <div className="booking-conversation-panel">
                          {(partnerMessagesByRequest[request.id] ?? []).length ===
                          0 ? (
                            <p>No messages were found for this request.</p>
                          ) : (
                            (partnerMessagesByRequest[request.id] ?? []).map(
                              (partnerMessage) => (
                                <article
                                  key={partnerMessage.id}
                                  className="booking-message-card"
                                  style={{ marginBottom: 10 }}
                                >
                                  <strong>
                                    {partnerMessage.senderName ||
                                      partnerMessage.senderRole ||
                                      "Message"}
                                  </strong>
                                  <p>{partnerMessage.message}</p>
                                  <small>
                                    {new Date(
                                      partnerMessage.createdAt,
                                    ).toLocaleString()}
                                  </small>
                                </article>
                              ),
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {showAllBookings && (
        <div
          className="booking-history-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowAllBookings(false);
            }
          }}
        >
          <section
            className="booking-history-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-history-title"
          >
            <div className="booking-history-header">
              <div>
                <h2 id="booking-history-title">All Bookings</h2>
                <p>
                  Showing {allBookingsSorted.length} booking
                  {allBookingsSorted.length === 1 ? "" : "s"}.
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowAllBookings(false);
                }}
              >
                Close
              </button>
            </div>

            {allBookingsSorted.length === 0 ? (
              <p>No bookings were found.</p>
            ) : (
              <div className="booking-history-list">
                {allBookingsSorted.map((booking) => (
                  <article
                    id={`owner-history-booking-${booking.id}`}
                    className="booking-history-card"
                    key={booking.id}
                  >
                    <div className="booking-history-card-heading">
                      <div>
                        <h3>
                          {booking.experienceName || "Experience Booking"}
                        </h3>
                        <p>
                          {formatBookingDateTime(
                            booking.appointmentDateTime,
                          )}
                        </p>
                      </div>

                      <div className="booking-history-card-indicators">
                        <span className="booking-history-status">
                          {getBookingDisplayStatus(booking)}
                        </span>

                        {getUnreadCustomerMessageCount(booking.id) > 0 && (
                          <span className="booking-history-message-alert">
                            {getUnreadCustomerMessageCount(booking.id)} new
                            message
                            {getUnreadCustomerMessageCount(booking.id) === 1
                              ? ""
                              : "s"}
                          </span>
                        )}

                        {getUnreadCustomerMessageCount(booking.id) === 0 &&
                          doesBookingNeedOwnerResponse(booking.id) && (
                            <span className="booking-history-response-alert">
                              Response needed
                            </span>
                          )}
                      </div>
                    </div>

                    <dl className="booking-history-details">
                      <div>
                        <dt>Customer</dt>
                        <dd>{booking.customerName}</dd>
                      </div>

                      <div>
                        <dt>Email</dt>
                        <dd>{booking.customerEmail}</dd>
                      </div>

                      <div>
                        <dt>Phone</dt>
                        <dd>{booking.customerPhone || "Not set"}</dd>
                      </div>

                      <div>
                        <dt>Location</dt>
                        <dd>{booking.location || "Not set"}</dd>
                      </div>

                      <div>
                        <dt>Amount</dt>
                        <dd>
                          {formatBookingAmount(booking.amountInCents)}
                        </dd>
                      </div>

                      <div>
                        <dt>Booking Status</dt>
                        <dd>{booking.status || "Not set"}</dd>
                      </div>

                      <div>
                        <dt>Payment Status</dt>
                        <dd>{booking.paymentStatus || "Not set"}</dd>
                      </div>

                      {booking.paidAt && (
                        <div>
                          <dt>Paid</dt>
                          <dd>{formatBookingDateTime(booking.paidAt)}</dd>
                        </div>
                      )}
                    </dl>

                    <div className="booking-history-conversation-section">
                      <button
                        type="button"
                        className={`booking-conversation-toggle ${
                          getUnreadCustomerMessageCount(booking.id) > 0
                            ? "has-new-messages"
                            : doesBookingNeedOwnerResponse(booking.id)
                              ? "needs-response"
                              : ""
                        }`}
                        aria-expanded={
                          expandedMessagesBookingId === booking.id
                        }
                        onClick={() => {
                          void toggleBookingMessages(booking.id);
                        }}
                      >
                        <span className="booking-conversation-toggle-label">
                          {getUnreadCustomerMessageCount(booking.id) > 0 ? (
                            <>
                              New messages
                              <span className="booking-message-count">
                                {getUnreadCustomerMessageCount(booking.id)}
                              </span>
                            </>
                          ) : doesBookingNeedOwnerResponse(booking.id) ? (
                            "Response needed"
                          ) : (
                            "Messages"
                          )}
                        </span>

                        <span aria-hidden="true">
                          {expandedMessagesBookingId === booking.id
                            ? "▲"
                            : "▼"}
                        </span>
                      </button>

                      {expandedMessagesBookingId === booking.id && (
                        <div className="booking-conversation-panel">
                          <p className="booking-conversation-title">
                            Conversation with {booking.customerName}
                          </p>

                          <p className="booking-conversation-purpose">
                            Messaging remains available for this booking
                            regardless of status.
                          </p>

                          {loadingMessagesBookingId === booking.id ? (
                            <p>Loading messages...</p>
                          ) : (bookingMessages[booking.id] ?? []).length ===
                            0 ? (
                            <p>No conversation messages yet.</p>
                          ) : (
                            <div className="booking-conversation-list">
                              {(bookingMessages[booking.id] ?? []).map(
                                (bookingMessage) => (
                                  <article
                                    id={`booking-message-${bookingMessage.id}`}
                                    className={`booking-conversation-message ${
                                      bookingMessage.messageType !== "CHAT"
                                        ? "system-message"
                                        : bookingMessage.senderRole === "OWNER"
                                          ? "owner-message"
                                          : "customer-message"
                                    } ${
                                      highlightedMessageId ===
                                      bookingMessage.id
                                        ? "highlighted-unread-message"
                                        : ""
                                    }`}
                                    key={bookingMessage.id}
                                  >
                                    <div className="booking-conversation-meta">
                                      <strong>
                                        {bookingMessage.senderName ||
                                          (bookingMessage.senderRole === "OWNER"
                                            ? "Experience Owner"
                                            : bookingMessage.senderRole ===
                                                "CUSTOMER"
                                              ? "Customer"
                                              : "Coast Life")}
                                      </strong>

                                      <span>
                                        {new Date(
                                          bookingMessage.createdAt,
                                        ).toLocaleString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                          hour: "numeric",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    </div>

                                    {bookingMessage.messageType &&
                                      bookingMessage.messageType !== "CHAT" && (
                                        <span className="booking-conversation-message-type">
                                          {bookingMessage.messageType
                                            .replaceAll("_", " ")
                                            .toLowerCase()}
                                        </span>
                                      )}

                                    <p>{bookingMessage.message}</p>
                                  </article>
                                ),
                              )}
                            </div>
                          )}

                          {messageErrors[booking.id] && (
                            <p className="booking-conversation-error">
                              {messageErrors[booking.id]}
                            </p>
                          )}

                          <label className="booking-conversation-composer-label">
                            Send a message to the customer
                            <textarea
                              rows={3}
                              value={messageDrafts[booking.id] ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;

                                setMessageDrafts((current) => ({
                                  ...current,
                                  [booking.id]: value,
                                }));
                              }}
                              placeholder="Send a message about this booking."
                              disabled={
                                sendingMessageBookingId === booking.id
                              }
                            />
                          </label>

                          <button
                            type="button"
                            className="primary-button"
                            disabled={
                              sendingMessageBookingId === booking.id
                            }
                            onClick={() => {
                              void sendOwnerMessage(booking);
                            }}
                          >
                            {sendingMessageBookingId === booking.id
                              ? "Sending..."
                              : "Send Message"}
                          </button>
                        </div>
                      )}
                    </div>

                    
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default function OwnerDashboard() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <DashboardContent
          signOut={signOut}
          userEmail={user?.signInDetails?.loginId ?? "Signed-in owner"}
        />
      )}
    </Authenticator>
  );
}