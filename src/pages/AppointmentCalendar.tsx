import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DatePicker from "react-datepicker";
import "@aws-amplify/ui-react/styles.css";
import "react-datepicker/dist/react-datepicker.css";
import "./AppointmentCalendar.css";
import { getCurrentUser } from "aws-amplify/auth";
import { getUrl } from "aws-amplify/storage";
import { client } from "../lib/amplifyClient";

type Experience = {
  id: string;
  name: string;
  imageUrl?: string | null;
  estimatedPrice?: number | null;
  location: string;
  description?: string | null;
  ownerProfileId: string;
  experienceType?: string | null;
};

const experiences = [
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

type CalendarEvent = {
  id: string;
  experienceId: string;
  ownerProfileId: string;
  bookingId?: string | null;
  startDateTime: string;
  endDateTime?: string | null;
  status?: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "BLOCKED" | null;
};

type BookingMessageRecord = {
  id: string;
  bookingId: string;
  senderName?: string | null;
  senderRole?: "CUSTOMER" | "OWNER" | "SYSTEM" | null;
  message: string;
  messageType?:
    | "CHAT"
    | "BOOKING_RECEIVED"
    | "BOOKING_APPROVED"
    | "BOOKING_REJECTED"
    | "AWAITING_PAYMENT"
    | "PAYMENT_RECEIVED"
    | "BOOKING_CONFIRMED"
    | "BOOKING_CANCELLED"
    | "BOOKING_DATE_CHANGED"
    | "PAYMENT_REFUNDED"
    | null;
  createdAt?: string | null;
};

function formatDateForStorage(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function ExperienceImage({
  imagePath,
  experienceName,
  className,
}: {
  imagePath?: string | null;
  experienceName: string;
  className: string;
}) {
  const [displayUrl, setDisplayUrl] = useState(
    "/images/experience-placeholder.png",
  );

  useEffect(() => {
    let isActive = true;

    async function loadImage() {
      if (!imagePath) {
        setDisplayUrl("/images/experience-placeholder.png");
        return;
      }

      try {
        const result = await getUrl({
          path: imagePath,
        });

        if (isActive) {
          setDisplayUrl(result.url.toString());
        }
      } catch (error) {
        console.error("Could not load experience image:", error);

        if (isActive) {
          setDisplayUrl("/images/experience-placeholder.png");
        }
      }
    }

    void loadImage();

    return () => {
      isActive = false;
    };
  }, [imagePath]);

  return (
    <img
      className={className}
      src={displayUrl}
      alt={experienceName}
      onError={(event) => {
        event.currentTarget.src = "/images/experience-placeholder.png";
      }}
    />
  );
}

function AppointmentCalendarContent() {
  const [searchParams] = useSearchParams();

  const navigate = useNavigate();

  const [experienceRecords, setExperienceRecords] = useState<Experience[]>([]);
  const [isLoadingExperiences, setIsLoadingExperiences] = useState(true);
  const [experienceLoadError, setExperienceLoadError] = useState("");

  const [selectedExperiences, setSelectedExperiences] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState("");

  useEffect(() => {
    const requestedExperience = searchParams.get("experience")?.trim();

    if (!requestedExperience) {
      return;
    }

    const matchingExperience = experiences.find(
      (experience) =>
        experience.toLowerCase() === requestedExperience.toLowerCase(),
    );

    if (matchingExperience) {
      setSelectedExperiences([matchingExperience]);
    }
  }, [searchParams]);

  const [selectedExperience, setSelectedExperience] =
    useState<Experience | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [selectedTime, setSelectedTime] = useState("09:00");

  const [isSending, setIsSending] = useState(false);
  const datePickerRef = useRef<DatePicker>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");

  const [showMessages, setShowMessages] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function checkSignedInUser() {
      try {
        await getCurrentUser();

        if (isActive) {
          setIsSignedIn(true);
        }
      } catch {
        if (isActive) {
          setIsSignedIn(false);
        }
      } finally {
        if (isActive) {
          setIsCheckingAuth(false);
        }
      }
    }

    void checkSignedInUser();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    async function loadExperiences() {
      try {
        setIsLoadingExperiences(true);
        setExperienceLoadError("");

        const { data, errors } = await client.models.Experience.list({
          authMode: "apiKey",
        });

        if (errors?.length) {
          throw new Error(errors.map((error) => error.message).join(", "));
        }

        const databaseExperiences: Experience[] = data.map((experience) => ({
          id: experience.id,
          name: experience.name,
          imageUrl: experience.imageUrl,
          estimatedPrice: experience.estimatedPrice,
          location: experience.location,
          description: experience.description,
          ownerProfileId: experience.ownerProfileId,
          experienceType: experience.experienceType,
        }));

        setExperienceRecords(databaseExperiences);
      } catch (error) {
        console.error("Could not load experiences:", error);

        setExperienceLoadError(
          error instanceof Error
            ? error.message
            : "The experiences could not be loaded.",
        );
      } finally {
        setIsLoadingExperiences(false);
      }
    }

    void loadExperiences();
  }, []);

  useEffect(() => {
    if (!selectedExperience) {
      setCalendarEvents([]);
      setAvailabilityError("");
      setIsLoadingAvailability(false);
      return;
    }

    const selectedExperienceId = selectedExperience.id;
    let isActive = true;

    async function loadCalendarAvailability() {
      try {
        setIsLoadingAvailability(true);
        setAvailabilityError("");

        const result = await client.models.ExperienceCalendarEvent.list({
          filter: {
            experienceId: {
              eq: selectedExperienceId,
            },
          },
          authMode: "apiKey",
        });

        if (result.errors?.length) {
          throw new Error(
            result.errors.map((error) => error.message).join(", "),
          );
        }

        if (!isActive) {
          return;
        }

        const events: CalendarEvent[] = result.data.map((event) => ({
          id: event.id,
          experienceId: event.experienceId,
          ownerProfileId: event.ownerProfileId,
          bookingId: event.bookingId,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          status: event.status,
        }));

        console.log("CALENDAR EVENTS FOR SELECTED EXPERIENCE:", events);

        setCalendarEvents(events);
      } catch (error) {
        console.error("Could not load booked dates:", error);

        if (isActive) {
          setCalendarEvents([]);
          setAvailabilityError(
            error instanceof Error
              ? error.message
              : "Booked dates could not be loaded.",
          );
        }
      } finally {
        if (isActive) {
          setIsLoadingAvailability(false);
        }
      }
    }

    void loadCalendarAvailability();

    return () => {
      isActive = false;
    };
  }, [selectedExperience]);

  const toggleExperience = (experience: string) => {
    setSelectedExperiences((current) =>
      current.includes(experience)
        ? current.filter((item) => item !== experience)
        : [...current, experience],
    );
  };

  const filteredExperiences = experienceRecords.filter((experience) => {
    const normalizedLocation = locationFilter.trim().toLowerCase();

    const matchesLocation =
      normalizedLocation === "" ||
      experience.location.toLowerCase().includes(normalizedLocation);

    const matchesExperience =
      selectedExperiences.length === 0 ||
      selectedExperiences.some(
        (selectedType) =>
          experience.experienceType?.toLowerCase() ===
          selectedType.toLowerCase(),
      );

    return matchesLocation && matchesExperience;
  });

  const unavailableDates = calendarEvents
    .filter(
      (event) =>
        event.status === "PENDING" ||
        event.status === "ACCEPTED" ||
        event.status === "BLOCKED",
    )
    .map((event) => new Date(event.startDateTime));

  const openAppointmentForm = (experience: Experience) => {
    if (isCheckingAuth) {
      return;
    }

    if (!isSignedIn) {
      navigate("/login", {
        state: {
          returnTo: "/booking",
        },
      });
      return;
    }

    setSelectedExperience(experience);
    setSelectedDate(null);
    setSelectedTime("09:00");
  };

  const closeAppointmentForm = () => {
    if (isSending) {
      return;
    }

    setSelectedExperience(null);
    setSelectedDate(null);
    setSelectedTime("09:00");
  };

  const sendAppointmentRequest = async () => {
    if (!selectedExperience) {
      alert("Please select an experience.");
      return;
    }

    if (!selectedDate) {
      alert("Please select a date.");
      return;
    }

    if (!selectedTime) {
      alert("Please select a time.");
      return;
    }

    const dateString = formatDateForStorage(selectedDate);

    const appointmentDateTime = new Date(`${dateString}T${selectedTime}:00`);

    if (Number.isNaN(appointmentDateTime.getTime())) {
      alert("The selected date or time is invalid.");
      return;
    }

    try {
      setIsSending(true);

      const currentUser = await getCurrentUser();

      const signedInEmail =
        currentUser.signInDetails?.loginId?.trim().toLowerCase() ?? "";

      const profileResult = await client.models.UserProfile.list({
        filter: {
          userId: {
            eq: currentUser.userId,
          },
        },
      });

      if (profileResult.errors?.length) {
        throw new Error(
          profileResult.errors.map((error) => error.message).join(", "),
        );
      }

      const customerProfile =
        [...profileResult.data].sort(
          (first, second) =>
            new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime(),
        )[0] ?? null;

      if (!customerProfile) {
        throw new Error(
          "Complete your user profile before requesting a booking.",
        );
      }

      const customerName = [customerProfile.firstName, customerProfile.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const customerEmail =
        customerProfile.ownerEmail?.trim().toLowerCase() || signedInEmail;

      const customerPhone = customerProfile.phoneNumber?.trim() || undefined;

      if (!customerName) {
        throw new Error(
          "Add your first and last name to your user profile before booking.",
        );
      }

      if (!customerEmail) {
        throw new Error(
          "A customer email address could not be found in your profile.",
        );
      }

      if (!selectedExperience.ownerProfileId) {
        throw new Error("This experience does not have an owner profile ID.");
      }

      const ownerProfileResult = await client.models.ExperienceOwnerProfile.get(
        {
          id: selectedExperience.ownerProfileId,
        },
        {
          authMode: "apiKey",
        },
      );

      if (ownerProfileResult.errors?.length) {
        throw new Error(
          ownerProfileResult.errors.map((error) => error.message).join(", "),
        );
      }

      const ownerUserId = ownerProfileResult.data?.userId?.trim();

      if (!ownerUserId) {
        throw new Error(
          "The experience owner's account ID could not be found.",
        );
      }

      const amountInCents =
        selectedExperience.estimatedPrice != null
          ? Math.round(selectedExperience.estimatedPrice * 100)
          : undefined;

      const bookingInput = {
        customerUserId: currentUser.userId,
        customerName,
        customerEmail,
        customerPhone,
        appointmentDateTime: appointmentDateTime.toISOString(),
        experienceId: selectedExperience.id,
        experienceName: selectedExperience.name,
        location: selectedExperience.location,
        ownerProfileId: selectedExperience.ownerProfileId,

        // Optional payment fields. These do not change the current booking flow.
        status: "PENDING" as const,
        amountInCents,
        paymentStatus: "AWAITING_APPROVAL",
      };

      console.log("BOOKING INPUT:", bookingInput);

      const bookingResult = await client.models.Booking.create(bookingInput, {
        authMode: "apiKey",
      });

      console.log("BOOKING RESULT:", bookingResult);

      if (bookingResult.errors?.length) {
        throw new Error(
          bookingResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (!bookingResult.data) {
        throw new Error("No booking record was returned.");
      }

      const booking = bookingResult.data;

      const calendarInput = {
        experienceId: selectedExperience.id,
        experienceName: selectedExperience.name,
        ownerProfileId: selectedExperience.ownerProfileId,
        bookingId: booking.id,
        startDateTime: appointmentDateTime.toISOString(),
        status: "PENDING" as const,
        title: "Unavailable",
      };

      console.log("CALENDAR INPUT:", calendarInput);

      const calendarResult = await client.models.ExperienceCalendarEvent.create(
        calendarInput,
        {
          authMode: "apiKey",
        },
      );

      console.log("CALENDAR RESULT:", calendarResult);

      if (calendarResult.errors?.length) {
        throw new Error(
          calendarResult.errors.map((error) => error.message).join(", "),
        );
      }

      if (!calendarResult.data) {
        throw new Error("No calendar event record was returned.");
      }

      const calendarEvent = calendarResult.data;

      let bookingMessageCreated = false;

      try {
        const messageResult = await client.models.BookingMessage.create({
          bookingId: booking.id,
          customerUserId: currentUser.userId,
          ownerUserId,
          ownerProfileId: selectedExperience.ownerProfileId,
          senderRole: "SYSTEM",
          senderName: "Coast Life",
          message:
            "Your booking request was received and is awaiting owner review.",
          messageType: "BOOKING_RECEIVED",
        });

        if (messageResult.errors?.length) {
          throw new Error(
            messageResult.errors.map((error) => error.message).join(", "),
          );
        }

        if (!messageResult.data) {
          throw new Error(
            "The initial booking status message was not created.",
          );
        }

        bookingMessageCreated = true;
      } catch (messageError: unknown) {
        console.error(
          "The booking was created, but its initial status message could not be created:",
          messageError,
        );
      }

      setCalendarEvents((currentEvents) => [
        ...currentEvents,
        {
          id: calendarEvent.id,
          experienceId: calendarEvent.experienceId,
          ownerProfileId: calendarEvent.ownerProfileId,
          bookingId: calendarEvent.bookingId,
          startDateTime: calendarEvent.startDateTime,
          endDateTime: calendarEvent.endDateTime,
          status: calendarEvent.status,
        },
      ]);
      setSelectedExperience(null);
      setSelectedDate(null);
      setSelectedTime("09:00");

      navigate("/user");
    } catch (error: unknown) {
      console.error("Could not complete appointment request:", error);

      let errorMessage = "The appointment request could not be completed.";

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === "object" &&
        error !== null &&
        "text" in error
      ) {
        errorMessage = String((error as { text?: string }).text);
      }

      const normalizedError = errorMessage.toLowerCase();

      if (
        normalizedError.includes("not authenticated") ||
        normalizedError.includes("user needs to be authenticated") ||
        normalizedError.includes("no current user")
      ) {
        setIsSignedIn(false);
        closeAppointmentForm();
        navigate("/login", {
          state: {
            returnTo: "/booking",
          },
        });
        return;
      }

      alert(`Booking request failed: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="experience-page">
      <section className="experience-header">
        <p className="experience-eyebrow">Experiences</p>

        <p>
          Choose one or more experiences and enter a location to filter the
          available experiences.
        </p>
      </section>

      <section className="experience-filter-card">
        <div className="experience-filter-header">
          <h2>Choose Experiences</h2>
        </div>

        <div className="experience-filter-grid">
          {experiences.map((experience) => {
            const selected = selectedExperiences.includes(experience);
            const checkboxId = `experience-${experience.replace(/\s+/g, "-").toLowerCase()}`;

            return (
              <label
                key={experience}
                htmlFor={checkboxId}
                className="experience-checkbox"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleExperience(experience)}
                />

                <span>{experience}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="experience-filter-card">
        <h2>Location</h2>

        <input
          type="text"
          value={locationFilter}
          onChange={(event) => setLocationFilter(event.target.value)}
          placeholder="Enter a city, state, or area"
          className="location-filter-input"
        />

        {(selectedExperiences.length > 0 || locationFilter.trim()) && (
          <button
            type="button"
            className="clear-filters-button"
            onClick={() => {
              setSelectedExperiences([]);
              setLocationFilter("");
            }}
          >
            Clear filters
          </button>
        )}
      </section>

      {isLoadingExperiences && (
        <p className="experience-status-message">Loading experiences...</p>
      )}

      {experienceLoadError && (
        <p className="experience-status-message experience-error">
          Could not load experiences: {experienceLoadError}
        </p>
      )}

      {!isLoadingExperiences &&
        !experienceLoadError &&
        experienceRecords.length === 0 && (
          <p className="experience-status-message">
            No experiences are currently available.
          </p>
        )}

      {!isLoadingExperiences &&
        !experienceLoadError &&
        experienceRecords.length > 0 &&
        filteredExperiences.length === 0 && (
          <p className="experience-status-message">
            No experiences match the selected filters.
          </p>
        )}

      {!isLoadingExperiences &&
        !experienceLoadError &&
        filteredExperiences.length > 0 && (
          <section className="experience-grid">
            {filteredExperiences.map((experience) => (
              <article className="experience-card" key={experience.id}>
                <div className="experience-image-wrapper">
                  <ExperienceImage
                    className="experience-image"
                    imagePath={experience.imageUrl}
                    experienceName={experience.name}
                  />

                  {experience.estimatedPrice != null && (
                    <span className="experience-price">
                      ${experience.estimatedPrice}
                      <small> estimated</small>
                    </span>
                  )}
                </div>

                <div className="experience-card-content">
                  <h2>{experience.name}</h2>

                  <p className="experience-location">
                    <span aria-hidden="true">📍</span>
                    {experience.location}
                  </p>

                  {experience.experienceType && (
                    <p className="experience-experience-type">
                      Experience: {experience.experienceType}
                    </p>
                  )}

                  {experience.description && (
                    <p className="experience-description">
                      {experience.description}
                    </p>
                  )}

                  <button
                    type="button"
                    className="appointment-button"
                    disabled={isCheckingAuth}
                    onClick={() => openAppointmentForm(experience)}
                  >
                    {isCheckingAuth
                      ? "Checking sign-in..."
                      : isSignedIn
                        ? "Select date and time"
                        : "Sign in to request"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

      {selectedExperience && (
        <div
          className="appointment-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAppointmentForm();
            }
          }}
        >
          <div className="appointment-dialog">
            <button
              type="button"
              className="dialog-close"
              aria-label="Close appointment form"
              disabled={isSending}
              onClick={closeAppointmentForm}
            >
              ×
            </button>

            <>
              <ExperienceImage
                className="dialog-experience-image"
                imagePath={selectedExperience.imageUrl}
                experienceName={selectedExperience.name}
              />

              <h2>Create Appointment</h2>

              <p className="selected-experience-name">
                {selectedExperience.name}
              </p>

              <p className="selected-experience-details">
                {selectedExperience.location}

                {selectedExperience.estimatedPrice != null && (
                  <>
                    {" · "}
                    Approximately ${selectedExperience.estimatedPrice}
                  </>
                )}
              </p>

              <div className="date-time-row">
                <div className="datepicker-label">
                  <label htmlFor="appointment-date">Date</label>

                  <DatePicker
                    id="appointment-date"
                    ref={datePickerRef}
                    selected={selectedDate}
                    onChange={(date: Date | null) => {
                      setSelectedDate(date);

                      window.setTimeout(() => {
                        datePickerRef.current?.setOpen(false);
                        datePickerRef.current?.input?.blur();
                      }, 150);
                    }}
                    shouldCloseOnSelect={true}
                    minDate={new Date()}
                    excludeDates={unavailableDates}
                    disabled={isLoadingAvailability}
                    dateFormat="MMMM d, yyyy"
                    placeholderText={
                      isLoadingAvailability
                        ? "Loading availability..."
                        : "Select a date"
                    }
                    className="datepicker-input"
                  />

                  {availabilityError && (
                    <p className="experience-status-message experience-error">
                      Availability could not be loaded: {availabilityError}
                    </p>
                  )}
                </div>

                <div className="date-time-field">
                  <label htmlFor="appointment-time">Time</label>

                  <input
                    id="appointment-time"
                    type="time"
                    value={selectedTime}
                    onChange={(event) => setSelectedTime(event.target.value)}
                  />
                </div>
              </div>

              {selectedDate && selectedTime && (
                <p className="appointment-summary">
                  Appointment requested for{" "}
                  <strong>
                    {selectedDate.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </strong>{" "}
                  at{" "}
                  <strong>
                    {new Date(
                      `2000-01-01T${selectedTime}:00`,
                    ).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </strong>
                  .
                </p>
              )}

              <div className="dialog-buttons">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={closeAppointmentForm}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="save-button"
                  disabled={isSending}
                  onClick={() => {
                    void sendAppointmentRequest();
                  }}
                >
                  {isSending
                    ? "Sending Booking Request..."
                    : "Send Booking Request"}
                </button>
              </div>
            </>
          </div>
        </div>
      )}

      {showMessages && (
        <div
          className="booking-messages-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowMessages(false);
            }
          }}
        ></div>
      )}
    </main>
  );
}

export default function AppointmentCalendar() {
  return <AppointmentCalendarContent />;
}