import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { getUrl, remove, uploadData } from "aws-amplify/storage";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { client } from "../lib/amplifyClient";
import outputs from "../../amplify_outputs.json";
import "./OwnerDashboard.css";
import "./OwnerBookingRequests.css";

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
        height: "140px",
        objectFit: "cover",
        borderRadius: "10px",
      }}
    />
  );
}

function DashboardContent({
  signOut,
  userEmail,
}: {
  signOut?: () => void;
  userEmail: string;
}) {
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
  const [deletingexperienceId, setDeletingexperienceId] = useState<
    string | null
  >(null);

  const experienceImageInputRef = useRef<HTMLInputElement>(null);

  async function loadDashboard() {
    console.log("loadDashboard started");
    setIsLoading(true);
    setMessage("");

    try {
      const profileResult = await client.models.ExperienceOwnerProfile.list();

      if (profileResult.errors?.length) {
        throw new Error(
          profileResult.errors.map((error) => error.message).join(", "),
        );
      }

      const currentUser = await getCurrentUser();

      const currentProfile =
        profileResult.data.find(
          (ownerProfile) => ownerProfile.userId === currentUser.userId,
        ) ?? null;

      console.log("SIGNED-IN USER ID:", currentUser.userId);
      console.log("ALL OWNER PROFILES:", profileResult.data);
      console.log("MATCHED OWNER PROFILE:", currentProfile);

      setProfile(currentProfile);

      if (currentProfile) {
        setProfileName(currentProfile.name);
        setProfilePhone(currentProfile.phone ?? "");
      }

      const [experienceResult, bookingResult, calendarResult] =
        await Promise.all([
          client.models.Experience.list(),
          client.models.Booking.list(),
          client.models.ExperienceCalendarEvent.list(),
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

      console.log("ALL EXPERIENCES:", experienceResult.data);
      console.log("ALL BOOKINGS:", bookingResult.data);
      console.log("ALL CALENDAR EVENTS:", calendarResult.data);

      if (currentProfile) {
        const ownerExperiences = experienceResult.data.filter(
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
      });

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

    if (!experienceImageFile) {
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

      uploadedImagePath = await uploadexperienceImage(experienceImageFile);

      setMessage("Saving experience information...");

      const result = await client.models.Experience.create({
        name: experienceName.trim(),
        experienceType: experienceExperienceType.trim(),
        location: experienceLocation.trim(),
        description: experienceDescription.trim() || undefined,
        estimatedPrice: numericPrice,
        imageUrl: uploadedImagePath,
        ownerProfileId: profile.id,
      });

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      if (!result.data) {
        throw new Error("The experience was not created.");
      }

      setexperiences((currentexperiences) => [
        ...currentexperiences,
        result.data,
      ]);

      setexperienceName("");
      setexperienceExperienceType("");
      setexperienceLocation("");
      setexperienceDescription("");
      setexperiencePrice("");
      clearexperienceImage();
      setShowAddexperienceForm(false);

      setMessage("Experience added successfully.");
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

  const openBookingRequests: PendingBookingRequest[] = bookings
    .map((booking) => ({
      booking,
      calendarEvent:
        calendarEvents.find(
          (calendarEvent) => calendarEvent.bookingId === booking.id,
        ) ?? null,
    }))
    .filter(({ booking, calendarEvent }) => {
      return (
        booking.paymentStatus === "AWAITING_APPROVAL" ||
        booking.paymentStatus === "AWAITING_PAYMENT" ||
        (!booking.paymentStatus &&
          (!calendarEvent || calendarEvent.status === "PENDING"))
      );
    })
    .sort(
      (first, second) =>
        new Date(first.booking.appointmentDateTime).getTime() -
        new Date(second.booking.appointmentDateTime).getTime(),
    );

  async function loadBookingMessages(bookingId: string) {
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

      const conversationMessages = result.data
        .filter((bookingMessage) => bookingMessage.messageType === "CHAT")
        .sort(
          (first, second) =>
            new Date(first.createdAt).getTime() -
            new Date(second.createdAt).getTime(),
        );

      setBookingMessages((current) => ({
        ...current,
        [bookingId]: conversationMessages,
      }));
    } catch (error: unknown) {
      console.error("Could not load owner booking messages:", error);

      setMessageErrors((current) => ({
        ...current,
        [bookingId]:
          error instanceof Error
            ? error.message
            : "The booking conversation could not be loaded.",
      }));
    } finally {
      setLoadingMessagesBookingId(null);
    }
  }

  async function toggleBookingMessages(bookingId: string) {
    if (expandedMessagesBookingId === bookingId) {
      setExpandedMessagesBookingId(null);
      return;
    }

    setExpandedMessagesBookingId(bookingId);
    await loadBookingMessages(bookingId);
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
      });

      if (result.errors?.length) {
        throw new Error(
          result.errors.map((error) => error.message).join(", "),
        );
      }

      if (!result.data) {
        throw new Error("The owner message was not created.");
      }

      setBookingMessages((current) => ({
        ...current,
        [booking.id]: [
          ...(current[booking.id] ?? []),
          result.data,
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
        });

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
      });

      if (bookingResult.errors?.length || !bookingResult.data) {
        try {
          await client.models.ExperienceCalendarEvent.update({
            id: request.calendarEvent.id,
            startDateTime: previousCalendarDateTime,
          });
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
          messageType: "CHAT",
          readByOwnerAt: new Date().toISOString(),
        });

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
        setBookingMessages((current) => ({
          ...current,
          [request.booking.id]: [
            ...(current[request.booking.id] ?? []),
            messageResult.data,
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
        });

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
      });

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
            });

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
            });

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
            });

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

  if (isLoading) {
    return <p>Loading owner dashboard...</p>;
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
         

          <button type="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {message && <p className="dashboard-message">{message}</p>}

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
          </section>

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
                  className="secondary-button"
                  onClick={() => {
                    setShowAllBookings(true);
                  }}
                >
                  Bookings history
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void loadDashboard();
                  }}
                >
                  Refresh
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

                    return (
                    <article
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

                        <span className="pending-booking-badge">
                          {isAwaitingPayment
                            ? "Approved — Awaiting Payment"
                            : "Pending Owner Approval"}
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

                      <div className="booking-date-update-section">
                        {editingDateBookingId !== booking.id ? (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={
                              updatingDateBookingId === booking.id ||
                              !calendarEvent
                            }
                            onClick={() => {
                              beginBookingDateUpdate(booking);
                            }}
                          >
                            Update Booking Date
                          </button>
                        ) : (
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
                        )}
                      </div>

                      <div className="booking-conversation-section">
                        <button
                          type="button"
                          className="booking-conversation-toggle"
                          aria-expanded={
                            expandedMessagesBookingId === booking.id
                          }
                          onClick={() => {
                            void toggleBookingMessages(booking.id);
                          }}
                        >
                          <span>Messages</span>
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
                                      className={`booking-conversation-message ${
                                        bookingMessage.senderRole === "OWNER"
                                          ? "owner-message"
                                          : "customer-message"
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
                        {!isAwaitingPayment ? (
                          <>
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
                        ) : (
                          <p className="booking-payment-status-message">
                            Payment is awaiting completion by the customer.
                            This booking will be confirmed when payment is
                            received.
                          </p>
                        )}
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

                    <div className="experience-card-actions">
                      <button
                        type="button"
                        className="delete-experience-button"
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
                  setMessage("");
                  setShowAddexperienceForm(true);
                }}
              >
                Add Experience
              </button>
            )}
          </section>

          {showAddexperienceForm && (
            <section className="dashboard-section">
              <h2>Add Experience</h2>

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
                      required
                    />
                    <small>JPEG, PNG, WebP, or GIF. Maximum size: 10 MB.</small>
                  </div>
                </div>

                {experienceImagePreview && (
                  <div className="experience-image-preview">
                    <img
                      src={experienceImagePreview}
                      alt="Selected experience preview"
                    />
                  </div>
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
                      clearexperienceImage();
                      setexperienceName("");
                      setexperienceExperienceType("");
                      setexperienceLocation("");
                      setexperienceDescription("");
                      setexperiencePrice("");
                      setMessage("");
                      setShowAddexperienceForm(false);
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Experience"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
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

                      <span className="booking-history-status">
                        {getBookingDisplayStatus(booking)}
                      </span>
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