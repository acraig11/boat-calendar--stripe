import { useEffect, useState } from "react";
import type { FormEvent, HTMLInputTypeAttribute } from "react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import outputs from "../../amplify_outputs.json";

const client = generateClient<Schema>();

type UserProfile = Schema["UserProfile"]["type"];
type Booking = Schema["Booking"]["type"];
type BookingMessage = Schema["BookingMessage"]["type"];

type ProfileForm = {
  firstName: string;
  lastName: string;
  ownerEmail: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  age: string;
  apparelSize: string;
  apparelGender: string;
};

const emptyForm: ProfileForm = {
  firstName: "",
  lastName: "",
  ownerEmail: "",
  phoneNumber: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  age: "",
  apparelSize: "",
  apparelGender: "",
};

function UserDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showBookings, setShowBookings] = useState(false);
  const [startingPaymentBookingId, setStartingPaymentBookingId] =
    useState<string | null>(null);
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
  const [unreadMessagesByBooking, setUnreadMessagesByBooking] = useState<
    Record<string, number>
  >({});

  const [form, setForm] = useState<ProfileForm>(emptyForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setIsLoading(true);
      setMessage("");

      const currentUser = await getCurrentUser();

      const signedInEmail =
        currentUser.signInDetails?.loginId?.trim().toLowerCase() ?? "";

      const bookingResult = await client.models.Booking.list({
        filter: {
          customerUserId: {
            eq: currentUser.userId,
          },
        },
      });

      if (bookingResult.errors?.length) {
        throw new Error(
          bookingResult.errors.map((error) => error.message).join(", "),
        );
      }

      const sortedBookings = [...bookingResult.data].sort(
        (a, b) =>
          new Date(b.appointmentDateTime).getTime() -
          new Date(a.appointmentDateTime).getTime(),
      );

      setBookings(sortedBookings);

      const messageResult = await client.models.BookingMessage.list({
        filter: {
          customerUserId: {
            eq: currentUser.userId,
          },
        },
      });

      if (messageResult.errors?.length) {
        throw new Error(
          messageResult.errors.map((error) => error.message).join(", "),
        );
      }

      const unreadCounts: Record<string, number> = {};

      for (const bookingMessage of messageResult.data) {
        if (
          bookingMessage.messageType === "CHAT" &&
          bookingMessage.senderRole === "OWNER" &&
          !bookingMessage.readByCustomerAt
        ) {
          unreadCounts[bookingMessage.bookingId] =
            (unreadCounts[bookingMessage.bookingId] ?? 0) + 1;
        }
      }

      setUnreadMessagesByBooking(unreadCounts);

      const result = await client.models.UserProfile.list({
        filter: {
          userId: {
            eq: currentUser.userId,
          },
        },
      });

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      const userRecords = result.data;

      const points = userRecords.reduce(
        (sum, record) => sum + Number(record.rewardPoints ?? 0),
        0,
      );

      setAvailablePoints(points);

      const hasProfileFields = (record: UserProfile) =>
        Boolean(
          record.firstName ||
          record.lastName ||
          record.ownerEmail ||
          record.phoneNumber ||
          record.address ||
          record.city ||
          record.state ||
          record.zip ||
          record.apparelSize ||
          record.apparelGender,
        );

      let profileRecords = userRecords.filter(hasProfileFields);

      // Older profile records may not have userId.
      // If no profile was found by userId, fall back to the signed-in email.
      if (profileRecords.length === 0 && signedInEmail) {
        const emailResult = await client.models.UserProfile.list({
          filter: {
            ownerEmail: {
              eq: signedInEmail,
            },
          },
        });

        if (emailResult.errors?.length) {
          throw new Error(
            emailResult.errors.map((error) => error.message).join(", "),
          );
        }

        profileRecords = emailResult.data.filter(hasProfileFields);
      }

      const userProfile =
        [...profileRecords].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0] ?? null;

      setProfile(userProfile);

      console.log("Signed-in user:", {
        userId: currentUser.userId,
        email: signedInEmail,
      });
      console.log("User point records:", userRecords);
      console.log("Available points:", points);
      console.log("Matching profile:", userProfile);

      if (userProfile) {
        setForm({
          firstName: userProfile.firstName ?? "",
          lastName: userProfile.lastName ?? "",
          ownerEmail: userProfile.ownerEmail ?? "",
          phoneNumber: userProfile.phoneNumber ?? "",
          address: userProfile.address ?? "",
          city: userProfile.city ?? "",
          state: userProfile.state ?? "",
          zip: userProfile.zip ?? "",
          age:
            userProfile.age === null || userProfile.age === undefined
              ? ""
              : String(userProfile.age),
          apparelSize: userProfile.apparelSize ?? "",
          apparelGender: userProfile.apparelGender ?? "",
        });

        setMessage("Profile and points loaded.");
      } else {
        setForm({
          ...emptyForm,
          ownerEmail: signedInEmail,
        });

        setIsEditing(true);
        setMessage("Complete your profile to continue.");
      }
    } catch (error) {
      console.error("Could not load user profile:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load the user profile.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function updateForm(field: keyof ProfileForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function beginEditing() {
    if (profile) {
      setForm({
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        ownerEmail: profile.ownerEmail ?? "",
        phoneNumber: profile.phoneNumber ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        zip: profile.zip ?? "",
        age:
          profile.age === null || profile.age === undefined
            ? ""
            : String(profile.age),
        apparelSize: profile.apparelSize ?? "",
        apparelGender: profile.apparelGender ?? "",
      });
    }

    setMessage("");
    setIsEditing(true);
  }

  function cancelEditing() {
    if (!profile) {
      setMessage("A profile has not been created yet.");
      return;
    }

    setForm({
      firstName: profile.firstName ?? "",
      lastName: profile.lastName ?? "",
      ownerEmail: profile.ownerEmail ?? "",
      phoneNumber: profile.phoneNumber ?? "",
      address: profile.address ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      zip: profile.zip ?? "",
      age:
        profile.age === null || profile.age === undefined
          ? ""
          : String(profile.age),
      apparelSize: profile.apparelSize ?? "",
      apparelGender: profile.apparelGender ?? "",
    });

    setMessage("");
    setIsEditing(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedFirstName = form.firstName.trim();
    const trimmedLastName = form.lastName.trim();
    const trimmedPhoneNumber = form.phoneNumber.trim();
    const trimmedState = form.state.trim().toUpperCase();
    const trimmedAge = form.age.trim();

    const age = trimmedAge === "" ? undefined : Number(trimmedAge);

    if (age !== undefined && (!Number.isInteger(age) || age < 1 || age > 120)) {
      setMessage("Enter a valid age between 1 and 120.");
      return;
    }

    if (!trimmedFirstName) {
      setMessage("Enter your first name.");
      return;
    }

    if (trimmedState && !/^[A-Z]{2}$/.test(trimmedState)) {
      setMessage("Enter the two-letter state abbreviation, such as FL.");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");

      const currentUser = await getCurrentUser();

      const signedInEmail = currentUser.signInDetails?.loginId
        ?.trim()
        .toLowerCase();

      const profileData = {
        firstName: trimmedFirstName,
        lastName: trimmedLastName || undefined,
        ownerEmail: signedInEmail || form.ownerEmail.trim() || undefined,
        phoneNumber: trimmedPhoneNumber || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: trimmedState || null,
        zip: form.zip.trim() || undefined,
        age,
        apparelSize: form.apparelSize.trim() || undefined,
        apparelGender: form.apparelGender.trim() || undefined,
      };

      if (profile?.id) {
        const result = await client.models.UserProfile.update({
          id: profile.id,
          userId: currentUser.userId,
          ...profileData,
        });

        if (result.errors?.length) {
          throw new Error(
            result.errors.map((error) => error.message).join(", "),
          );
        }

        if (!result.data) {
          throw new Error("The user profile was not updated.");
        }

        await loadProfile();
        setMessage("User profile updated.");
      } else {
        const result = await client.models.UserProfile.create({
          userId: currentUser.userId,
          rewardPoints: 0,
          ...profileData,
        });

        if (result.errors?.length) {
          throw new Error(
            result.errors.map((error) => error.message).join(", "),
          );
        }

        if (!result.data) {
          throw new Error("The user profile was not created.");
        }

        await loadProfile();
        setMessage("User profile created.");
      }

      setIsEditing(false);
    } catch (error) {
      console.error("Could not save user profile:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save the user profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

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

      // Routine system status messages are intentionally hidden because
      // the booking card already displays booking and payment status.
      const conversationMessages = result.data
        .filter((bookingMessage) => bookingMessage.messageType === "CHAT")
        .sort(
          (first, second) =>
            new Date(first.createdAt).getTime() -
            new Date(second.createdAt).getTime(),
        );

      const unreadOwnerMessages = conversationMessages.filter(
        (bookingMessage) =>
          bookingMessage.senderRole === "OWNER" &&
          !bookingMessage.readByCustomerAt,
      );

      if (unreadOwnerMessages.length > 0) {
        const readAt = new Date().toISOString();

        await Promise.all(
          unreadOwnerMessages.map(async (bookingMessage) => {
            const updateResult =
              await client.models.BookingMessage.update({
                id: bookingMessage.id,
                readByCustomerAt: readAt,
              });

            if (updateResult.errors?.length) {
              throw new Error(
                updateResult.errors
                  .map((error) => error.message)
                  .join(", "),
              );
            }
          }),
        );

        for (const bookingMessage of conversationMessages) {
          if (
            bookingMessage.senderRole === "OWNER" &&
            !bookingMessage.readByCustomerAt
          ) {
            bookingMessage.readByCustomerAt = readAt;
          }
        }
      }

      setUnreadMessagesByBooking((current) => ({
        ...current,
        [bookingId]: 0,
      }));

      setBookingMessages((current) => ({
        ...current,
        [bookingId]: conversationMessages,
      }));
    } catch (error: unknown) {
      console.error("Could not load booking messages:", error);

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

  async function sendCustomerMessage(booking: Booking) {
    const draft = messageDrafts[booking.id]?.trim() ?? "";

    if (!draft) {
      setMessageErrors((current) => ({
        ...current,
        [booking.id]: "Enter a message before sending.",
      }));
      return;
    }

    if (!booking.customerUserId) {
      setMessageErrors((current) => ({
        ...current,
        [booking.id]:
          "This booking is not linked to the signed-in customer account.",
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

      if (currentUser.userId !== booking.customerUserId) {
        throw new Error(
          "This booking does not belong to the signed-in customer.",
        );
      }

      const ownerProfileResult =
        await client.models.ExperienceOwnerProfile.get({
          id: booking.ownerProfileId,
        });

      if (ownerProfileResult.errors?.length) {
        throw new Error(
          ownerProfileResult.errors
            .map((error) => error.message)
            .join(", "),
        );
      }

      const ownerUserId = ownerProfileResult.data?.userId?.trim();

      if (!ownerUserId) {
        throw new Error(
          "The experience owner's account ID could not be found.",
        );
      }

      const senderName =
        [profile?.firstName, profile?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "Customer";

      const result = await client.models.BookingMessage.create({
        bookingId: booking.id,
        customerUserId: currentUser.userId,
        ownerUserId,
        ownerProfileId: booking.ownerProfileId,
        senderUserId: currentUser.userId,
        senderRole: "CUSTOMER",
        senderName,
        message: draft,
        messageType: "CHAT",
        readByCustomerAt: new Date().toISOString(),
      });

      if (result.errors?.length) {
        throw new Error(
          result.errors.map((error) => error.message).join(", "),
        );
      }

      if (!result.data) {
        throw new Error("The message was not created.");
      }

      const createdMessage = result.data;

      setBookingMessages((current) => ({
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
      console.error("Could not send customer message:", error);

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

  async function startBookingPayment(bookingId: string) {
    try {
      setStartingPaymentBookingId(bookingId);
      setMessage("");

      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();

      if (!idToken) {
        throw new Error(
          "Your signed-in session could not be verified.",
        );
      }

      const endpoint = outputs.custom?.API?.stripeRestApi?.endpoint;

      if (!endpoint) {
        throw new Error(
          "The Stripe payment service is not configured.",
        );
      }

      const response = await fetch(
        `${endpoint.replace(/\/$/, "")}/customer-create-checkout-session`,
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

      let result: {
        message?: string;
        checkoutUrl?: string;
      } = {};

      if (responseText) {
        try {
          result = JSON.parse(responseText) as typeof result;
        } catch {
          throw new Error(
            `The payment service returned an unreadable response: ${responseText}`,
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.message ||
            `The payment request failed with status ${response.status}.`,
        );
      }

      if (!result.checkoutUrl) {
        throw new Error(
          "Stripe did not return a secure payment link.",
        );
      }

      window.location.assign(result.checkoutUrl);
    } catch (error: unknown) {
      console.error("Could not start booking payment:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "The payment could not be started.",
      );
    } finally {
      setStartingPaymentBookingId(null);
    }
  }

  function formatBookingDateTime(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

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

    return "Pending Owner Approval";
  }

  if (isLoading) {
    return (
      <main style={styles.page}>
        <section style={styles.loadingCard}>
          <h2 style={{ marginTop: 0 }}>User Dashboard</h2>

          <p style={{ marginBottom: 0 }}>Loading user dashboard...</p>
        </section>
      </main>
    );
  }

  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    "Create Your Profile";

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.memberLabel}>Coast Life Member</div>

        <h1 style={styles.heroTitle}>{displayName}</h1>

        <div style={styles.rewardBox}>
          <div style={styles.rewardLabel}>Available Reward Points</div>

          <div style={styles.rewardPoints}>{availablePoints}</div>
        </div>
      </section>

      {!isEditing && (
        <div style={styles.dashboardActions}>
          <button
            type="button"
            onClick={beginEditing}
            style={styles.editButton}
          >
            {profile ? "Edit Profile" : "Create Profile"}
          </button>

          <button
            type="button"
            onClick={() => setShowBookings(true)}
            style={styles.bookingsButton}
          >
            My Bookings ({bookings.length})
          </button>
        </div>
      )}

      {message && (
        <div
          style={{
            ...styles.message,
            color: message.toLowerCase().includes("could not")
              ? "#c62828"
              : "#666",
          }}
        >
          {message}
        </div>
      )}

      {isEditing && (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>
            {profile ? "Edit Profile" : "Create Profile"}
          </h2>

          <p style={styles.formDescription}>
            Complete your information to manage rewards and account details.
          </p>

          <form onSubmit={saveProfile}>
            <div style={styles.formGrid}>
              <ProfileInput
                id="firstName"
                label="First Name"
                value={form.firstName}
                onChange={(value) => updateForm("firstName", value)}
                disabled={isSaving}
                required
              />

              <ProfileInput
                id="lastName"
                label="Last Name"
                value={form.lastName}
                onChange={(value) => updateForm("lastName", value)}
                disabled={isSaving}
              />
            </div>

            <ProfileInput
              id="ownerEmail"
              label="Email"
              type="email"
              value={form.ownerEmail}
              onChange={(value) => updateForm("ownerEmail", value)}
              disabled={isSaving}
              readOnly
            />

            <ProfileInput
              id="phoneNumber"
              label="Phone Number"
              type="tel"
              value={form.phoneNumber}
              onChange={(value) => updateForm("phoneNumber", value)}
              disabled={isSaving}
              placeholder="(555) 555-5555"
            />

            <ProfileInput
              id="address"
              label="Address"
              value={form.address}
              onChange={(value) => updateForm("address", value)}
              disabled={isSaving}
            />

            <div style={styles.formGrid}>
              <ProfileInput
                id="city"
                label="City"
                value={form.city}
                onChange={(value) => updateForm("city", value)}
                disabled={isSaving}
              />

              <ProfileInput
                id="state"
                label="State"
                value={form.state}
                onChange={(value) => updateForm("state", value.toUpperCase())}
                disabled={isSaving}
                maxLength={2}
                placeholder="FL"
              />
            </div>

            <div style={styles.formGrid}>
              <ProfileInput
                id="zip"
                label="ZIP Code"
                value={form.zip}
                onChange={(value) => updateForm("zip", value)}
                disabled={isSaving}
                inputMode="numeric"
                maxLength={10}
              />

              <ProfileInput
                id="age"
                label="Age"
                type="number"
                value={form.age}
                onChange={(value) => updateForm("age", value)}
                disabled={isSaving}
                min="1"
                max="120"
              />
            </div>

            <div style={styles.formGrid}>
              <ProfileSelect
                id="apparelSize"
                label="Apparel Size"
                value={form.apparelSize}
                onChange={(value) => updateForm("apparelSize", value)}
                disabled={isSaving}
                options={["XS", "S", "M", "L", "XL", "2XL", "3XL"]}
              />

              <ProfileSelect
                id="apparelGender"
                label="Apparel Style"
                value={form.apparelGender}
                onChange={(value) => updateForm("apparelGender", value)}
                disabled={isSaving}
                options={["M", "F"]}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              style={{
                ...styles.saveButton,
                background: isSaving ? "#999" : "#34c759",
                cursor: isSaving ? "not-allowed" : "pointer",
              }}
            >
              {isSaving
                ? "Saving..."
                : profile
                  ? "Save Changes"
                  : "Create Profile"}
            </button>

            {profile && (
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isSaving}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            )}
          </form>
        </section>
      )}

      {profile && !isEditing && (
        <>
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Contact Information</h2>

            <ProfileRow label="Email" value={profile.ownerEmail} />

            <ProfileRow label="Phone" value={profile.phoneNumber} />

            <ProfileRow label="Address" value={profile.address} />

            <ProfileRow label="City" value={profile.city} />

            <ProfileRow label="State" value={profile.state} />

            <ProfileRow label="ZIP" value={profile.zip} />
          </section>

          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Apparel Information</h2>

            <ProfileRow label="Age" value={profile.age} />

            <ProfileRow label="Size" value={profile.apparelSize} />

            <ProfileRow label="Style" value={profile.apparelGender} />
          </section>

          <section style={styles.card}>
            <ProfileRow
              label="Last Updated"
              value={
                profile.updatedAt
                  ? new Date(profile.updatedAt).toLocaleString()
                  : "Not set"
              }
              showBorder={false}
            />
          </section>
        </>
      )}
      {showBookings && (
        <div
          style={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowBookings(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="my-bookings-title"
            style={styles.modalSheet}
          >
            <div style={styles.modalHeader}>
              <div>
                <h2 id="my-bookings-title" style={styles.modalTitle}>
                  My Bookings
                </h2>
                <p style={styles.modalSubtitle}>
                  {bookings.length} booking{bookings.length === 1 ? "" : "s"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowBookings(false)}
                style={styles.modalCloseButton}
              >
                Close
              </button>
            </div>

            {bookings.length === 0 ? (
              <p>No bookings were found for this account.</p>
            ) : (
              <div style={styles.bookingList}>
                {bookings.map((booking) => (
                  <article key={booking.id} style={styles.bookingCard}>
                    <div style={styles.bookingCardHeader}>
                      <div>
                        <h3 style={styles.bookingTitle}>
                          {booking.experienceName || "Experience Booking"}
                        </h3>
                        <p style={styles.bookingDate}>
                          {formatBookingDateTime(
                            booking.appointmentDateTime,
                          )}
                        </p>
                      </div>

                      <span style={styles.bookingStatus}>
                        {getBookingDisplayStatus(booking)}
                      </span>
                    </div>

                    <ProfileRow label="Location" value={booking.location} />
                    <ProfileRow
                      label="Amount"
                      value={formatBookingAmount(booking.amountInCents)}
                    />
                    <ProfileRow
                      label="Booking Status"
                      value={booking.status}
                    />
                    <ProfileRow
                      label="Payment Status"
                      value={booking.paymentStatus}
                    />

                    <div style={styles.bookingMessagesSection}>
                      <button
                        type="button"
                        style={{
                          ...styles.messagesToggleButton,
                          ...(unreadMessagesByBooking[booking.id] > 0
                            ? styles.messagesToggleButtonUnread
                            : {}),
                        }}
                        aria-expanded={
                          expandedMessagesBookingId === booking.id
                        }
                        onClick={() => {
                          void toggleBookingMessages(booking.id);
                        }}
                      >
                        <span>
                          {unreadMessagesByBooking[booking.id] > 0
                            ? `New messages await${
                                unreadMessagesByBooking[booking.id] > 1
                                  ? ` (${unreadMessagesByBooking[booking.id]})`
                                  : ""
                              }`
                            : "Messages"}
                        </span>

                        <span aria-hidden="true">
                          {expandedMessagesBookingId === booking.id
                            ? "▲"
                            : "▼"}
                        </span>
                      </button>

                      {expandedMessagesBookingId === booking.id && (
                        <div style={styles.messagesPanel}>
                          <p style={styles.messagesPanelTitle}>
                            Conversation with the experience owner
                          </p>

                          <p style={styles.messagesPurpose}>
                            Use this conversation for alternate-date
                            discussions, cancellation explanations, special
                            instructions, and other booking questions.
                          </p>

                          {loadingMessagesBookingId === booking.id ? (
                            <p style={styles.messagesPlaceholder}>
                              Loading messages...
                            </p>
                          ) : (bookingMessages[booking.id] ?? []).length ===
                            0 ? (
                            <p style={styles.messagesPlaceholder}>
                              No conversation messages yet.
                            </p>
                          ) : (
                            <div style={styles.conversationList}>
                              {(bookingMessages[booking.id] ?? []).map(
                                (bookingMessage) => (
                                  <article
                                    key={bookingMessage.id}
                                    style={{
                                      ...styles.conversationMessage,
                                      marginLeft:
                                        bookingMessage.senderRole ===
                                        "CUSTOMER"
                                          ? 36
                                          : 0,
                                      marginRight:
                                        bookingMessage.senderRole ===
                                        "CUSTOMER"
                                          ? 0
                                          : 36,
                                      background:
                                        bookingMessage.senderRole ===
                                        "CUSTOMER"
                                          ? "#e8f3ff"
                                          : "#f3f4f6",
                                    }}
                                  >
                                    <div style={styles.conversationMeta}>
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

                                    <p style={styles.conversationText}>
                                      {bookingMessage.message}
                                    </p>
                                  </article>
                                ),
                              )}
                            </div>
                          )}

                          {messageErrors[booking.id] && (
                            <p style={styles.messageError}>
                              {messageErrors[booking.id]}
                            </p>
                          )}

                          <label style={styles.messageComposerLabel}>
                            Send a message
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
                              placeholder="Ask about another date, explain a cancellation, or share special instructions."
                              disabled={
                                sendingMessageBookingId === booking.id
                              }
                              style={styles.messageComposer}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              void sendCustomerMessage(booking);
                            }}
                            disabled={
                              sendingMessageBookingId === booking.id
                            }
                            style={{
                              ...styles.sendMessageButton,
                              opacity:
                                sendingMessageBookingId === booking.id
                                  ? 0.7
                                  : 1,
                            }}
                          >
                            {sendingMessageBookingId === booking.id
                              ? "Sending..."
                              : "Send Message"}
                          </button>
                        </div>
                      )}
                    </div>

                    {booking.status === "ACCEPTED" &&
                      booking.paymentStatus === "AWAITING_PAYMENT" && (
                        <button
                          type="button"
                          style={{
                            ...styles.payButton,
                            opacity:
                              startingPaymentBookingId === booking.id
                                ? 0.7
                                : 1,
                            cursor:
                              startingPaymentBookingId === booking.id
                                ? "wait"
                                : "pointer",
                          }}
                          disabled={
                            startingPaymentBookingId === booking.id ||
                            booking.amountInCents == null ||
                            booking.amountInCents <= 0
                          }
                          onClick={() => {
                            void startBookingPayment(booking.id);
                          }}
                        >
                          {startingPaymentBookingId === booking.id
                            ? "Opening Secure Checkout..."
                            : `Pay ${formatBookingAmount(
                                booking.amountInCents,
                              )} Securely`}
                        </button>
                      )}

                    {booking.status === "ACCEPTED" &&
                      booking.paymentStatus === "AWAITING_PAYMENT" &&
                      (booking.amountInCents == null ||
                        booking.amountInCents <= 0) && (
                        <p style={styles.paymentWarning}>
                          This booking does not have a valid payment amount.
                        </p>
                      )}

                    {booking.paidAt && (
                      <ProfileRow
                        label="Paid"
                        value={formatBookingDateTime(booking.paidAt)}
                        showBorder={false}
                      />
                    )}
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

type ProfileInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: HTMLInputTypeAttribute;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  inputMode?:
    | "none"
    | "text"
    | "decimal"
    | "numeric"
    | "tel"
    | "search"
    | "email"
    | "url";
  min?: string;
  max?: string;
  maxLength?: number;
};

function ProfileInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
  required = false,
  readOnly = false,
  inputMode,
  min,
  max,
  maxLength,
}: ProfileInputProps) {
  return (
    <label htmlFor={id} style={styles.inputLabel}>
      {label}

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        readOnly={readOnly}
        inputMode={inputMode}
        min={min}
        max={max}
        maxLength={maxLength}
        style={{
          ...styles.input,
          background: readOnly ? "#f2f2f7" : "#fff",
          color: readOnly ? "#666" : "#222",
        }}
      />
    </label>
  );
}

type ProfileSelectProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

function ProfileSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: ProfileSelectProps) {
  return (
    <label htmlFor={id} style={styles.inputLabel}>
      {label}

      <select
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={styles.input}
      >
        <option value="">Select one</option>

        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProfileRow({
  label,
  value,
  showBorder = true,
}: {
  label: string;
  value: unknown;
  showBorder?: boolean;
}) {
  const displayedValue =
    value === null || value === undefined || value === ""
      ? "Not set"
      : String(value);

  return (
    <div
      style={{
        ...styles.profileRow,
        borderBottom: showBorder ? "1px solid #f0f0f0" : "none",
      }}
    >
      <span style={styles.rowLabel}>{label}</span>

      <span style={styles.rowValue}>{displayedValue}</span>
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    maxWidth: 900,
    minHeight: "100vh",
    margin: "0 auto",
    padding: "20px 16px 40px",
    boxSizing: "border-box" as const,
    background: "#f2f2f7",
  },

  loadingCard: {
    padding: 24,
    background: "#fff",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.06)",
  },

  hero: {
    padding: 24,
    marginBottom: 16,
    color: "#fff",
    borderRadius: 22,
    background: "linear-gradient(135deg, #007aff, #00a8ff)",
    boxShadow: "0 12px 30px rgba(0,122,255,.25)",
  },

  memberLabel: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    opacity: 0.9,
  },

  heroTitle: {
    margin: "8px 0",
    fontSize: 34,
    lineHeight: 1.1,
  },

  rewardBox: {
    padding: 16,
    marginTop: 18,
    borderRadius: 16,
    background: "rgba(255,255,255,.18)",
    border: "1px solid rgba(255,255,255,.2)",
  },

  rewardLabel: {
    fontSize: 13,
    textTransform: "uppercase" as const,
    opacity: 0.85,
  },

  rewardPoints: {
    marginTop: 4,
    fontSize: 42,
    fontWeight: 800,
  },

  dashboardActions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },

  editButton: {
    width: "100%",
    padding: 14,
    border: "none",
    borderRadius: 14,
    background: "#007aff",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },

  bookingsButton: {
    width: "100%",
    padding: 14,
    border: "none",
    borderRadius: 14,
    background: "#fff",
    color: "#007aff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 0 0 1px rgba(0,122,255,.25)",
  },

  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
    background: "rgba(15,23,42,.55)",
  },

  modalSheet: {
    width: "min(720px, 94vw)",
    height: "100%",
    overflowY: "auto" as const,
    padding: 22,
    background: "#f2f2f7",
    boxShadow: "-12px 0 30px rgba(15,23,42,.2)",
  },

  modalHeader: {
    position: "sticky" as const,
    top: 0,
    zIndex: 2,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    margin: "-22px -22px 18px",
    padding: 22,
    background: "#fff",
    borderBottom: "1px solid #ddd",
  },

  modalTitle: {
    margin: 0,
  },

  modalSubtitle: {
    margin: "6px 0 0",
    color: "#666",
  },

  modalCloseButton: {
    padding: "10px 14px",
    border: "none",
    borderRadius: 12,
    background: "#007aff",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },

  bookingList: {
    display: "grid",
    gap: 14,
  },

  bookingCard: {
    padding: 18,
    background: "#fff",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.06)",
  },

  bookingCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 12,
  },

  bookingTitle: {
    margin: 0,
  },

  bookingDate: {
    margin: "6px 0 0",
    color: "#666",
  },

  bookingStatus: {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eef2f7",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center" as const,
  },

  bookingMessagesSection: {
    marginTop: 14,
    borderTop: "1px solid #e5e7eb",
    paddingTop: 14,
  },

  messagesToggleButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    border: "1px solid #dbe3ec",
    borderRadius: 12,
    background: "#f8fafc",
    color: "#1f2937",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },

  messagesToggleButtonUnread: {
    background: "#fff3cd",
    color: "#7a4d00",
    border: "1px solid #f0b429",
    boxShadow: "0 0 0 3px rgba(240,180,41,.18)",
  },

  messagesPanel: {
    marginTop: 10,
    padding: 14,
    border: "1px solid #dbe3ec",
    borderRadius: 12,
    background: "#fff",
  },

  messagesPanelTitle: {
    margin: "0 0 6px",
    fontSize: 14,
    fontWeight: 800,
  },

  messagesPurpose: {
    margin: "0 0 14px",
    color: "#666",
    fontSize: 13,
    lineHeight: 1.5,
  },

  messagesPlaceholder: {
    margin: "0 0 14px",
    color: "#666",
    lineHeight: 1.5,
  },

  conversationList: {
    display: "grid",
    gap: 10,
    marginBottom: 14,
  },

  conversationMessage: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,.06)",
  },

  conversationMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    color: "#555",
    fontSize: 12,
  },

  conversationText: {
    margin: "7px 0 0",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
  },

  messageComposerLabel: {
    display: "block",
    marginTop: 12,
    color: "#333",
    fontSize: 13,
    fontWeight: 800,
  },

  messageComposer: {
    width: "100%",
    marginTop: 7,
    padding: 11,
    border: "1px solid #d1d5db",
    borderRadius: 11,
    font: "inherit",
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
  },

  sendMessageButton: {
    width: "100%",
    marginTop: 10,
    padding: 12,
    border: "none",
    borderRadius: 11,
    background: "#007aff",
    color: "#fff",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  },

  messageError: {
    margin: "10px 0",
    color: "#c62828",
    fontSize: 13,
    fontWeight: 600,
  },

  payButton: {
    width: "100%",
    padding: 14,
    marginTop: 14,
    border: "none",
    borderRadius: 14,
    background: "#34c759",
    color: "#fff",
    fontSize: 16,
    fontWeight: 800,
  },

  paymentWarning: {
    margin: "12px 0 0",
    color: "#c62828",
    fontSize: 14,
    fontWeight: 600,
  },

  message: {
    marginBottom: 14,
    fontSize: 14,
  },

  card: {
    padding: 18,
    marginBottom: 14,
    background: "#fff",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.06)",
  },

  cardTitle: {
    marginTop: 0,
    marginBottom: 16,
  },

  formDescription: {
    marginTop: -6,
    marginBottom: 20,
    color: "#666",
    lineHeight: 1.5,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },

  inputLabel: {
    display: "block",
    marginBottom: 12,
    color: "#333",
    fontWeight: 700,
  },

  input: {
    width: "100%",
    padding: 12,
    marginTop: 6,
    border: "1px solid #ddd",
    borderRadius: 12,
    background: "#fff",
    color: "#222",
    fontSize: 16,
    boxSizing: "border-box" as const,
  },

  saveButton: {
    width: "100%",
    padding: 14,
    marginTop: 12,
    border: "none",
    borderRadius: 14,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
  },

  cancelButton: {
    width: "100%",
    padding: 12,
    marginTop: 8,
    border: "none",
    background: "transparent",
    color: "#007aff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },

  profileRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    padding: "10px 0",
  },

  rowLabel: {
    color: "#666",
    fontWeight: 600,
  },

  rowValue: {
    fontWeight: 700,
    textAlign: "right" as const,
    overflowWrap: "anywhere" as const,
  },
};

function AuthenticatedUserDashboard() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <>
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              padding: "16px",
              background: "#fff",
              borderBottom: "1px solid #ddd",
            }}
          >
            <div>
              Signed in as{" "}
              <strong>
                {user?.signInDetails?.loginId ?? "Signed-in user"}
              </strong>
            </div>

            <button type="button" onClick={signOut}>
              Sign Out
            </button>
          </header>

          <UserDashboard />
        </>
      )}
    </Authenticator>
  );
}

export default AuthenticatedUserDashboard;