import { useEffect, useRef, useState } from "react";
import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";
import "./AppointmentCalendar.css";

import { sendBookingEmailWithAppointment } from "../utils/email";
import { getUrl } from "aws-amplify/storage";
import { client } from "../lib/amplifyClient";

import BookingContactForm, {
  type BookingContactData,
} from "./BookingContactForm";
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

type Appointment = {
  id: string;
  experienceId: string;
  experienceName: string;
  title: string;
  date: string;
  time: string;
  start: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
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

function AppointmentCalendar() {
  const [experienceRecords, setExperienceRecords] = useState<Experience[]>([]);
  const [isLoadingExperiences, setIsLoadingExperiences] = useState(true);
  const [experienceLoadError, setExperienceLoadError] = useState("");

  const [selectedExperiences, setSelectedExperiences] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState("");

  const [selectedExperience, setSelectedExperience] =
    useState<Experience | null>(null);

  const [appointmentTitle, setAppointmentTitle] = useState("");

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [selectedTime, setSelectedTime] = useState("09:00");

  const [showContactForm, setShowContactForm] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const datePickerRef = useRef<DatePicker>(null);
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    try {
      const saved = localStorage.getItem("experienceAppointments");

      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Could not load appointments:", error);

      return [];
    }
  });

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
    try {
      localStorage.setItem(
        "experienceAppointments",
        JSON.stringify(appointments),
      );
    } catch (error) {
      console.error("Could not save appointments:", error);
    }
  }, [appointments]);

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

  const openAppointmentForm = (experience: Experience) => {
    setSelectedExperience(experience);
    setAppointmentTitle(`${experience.name} reservation`);
    setSelectedDate(null);
    setSelectedTime("09:00");
    setShowContactForm(false);
  };

  const closeAppointmentForm = () => {
    if (isSending) {
      return;
    }

    setSelectedExperience(null);
    setAppointmentTitle("");
    setSelectedDate(null);
    setSelectedTime("09:00");
    setShowContactForm(false);
  };

  const openContactForm = () => {
    if (!selectedDate) {
      alert("Please select a date.");
      return;
    }

    if (!selectedTime) {
      alert("Please select a time.");
      return;
    }

    setShowContactForm(true);
  };

  const sendAppointmentRequest = async (contact: BookingContactData) => {
    if (!selectedExperience) {
      alert("Please select an experience.");
      return;
    }

    if (!selectedDate) {
      alert("Please select a date.");
      setShowContactForm(false);
      return;
    }

    if (!selectedTime) {
      alert("Please select a time.");
      setShowContactForm(false);
      return;
    }

    const dateString = formatDateForStorage(selectedDate);

    const appointmentDateTime = new Date(`${dateString}T${selectedTime}:00`);

    if (Number.isNaN(appointmentDateTime.getTime())) {
      alert("The selected date or time is invalid.");
      return;
    }

    const nameParts = contact.name.trim().split(/\s+/);

    const profile = {
      firstName: nameParts[0] ?? "",
      lastName: nameParts.slice(1).join(" "),
      phoneNumber: contact.phone,
      ownerEmail: contact.email,
    };

    const newAppointment: Appointment = {
      id: crypto.randomUUID(),
      experienceId: selectedExperience.id,
      experienceName: selectedExperience.name,
      title: appointmentTitle.trim(),
      date: dateString,
      time: selectedTime,
      start: `${dateString}T${selectedTime}:00`,
      customerName: contact.name,
      customerEmail: contact.email,
      customerPhone: contact.phone,
    };

    try {
      setIsSending(true);

      console.log(
        "Selected experience before owner lookup:",
        selectedExperience,
      );
      console.log("Owner profile ID:", selectedExperience.ownerProfileId);

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

      console.log("Owner profile get result:", ownerProfileResult);

      if (ownerProfileResult.errors?.length) {
        console.warn("Owner profile get errors:", ownerProfileResult.errors);
      }

      let ownerProfile = ownerProfileResult.data;

      // Fallback: list the readable owner profiles and match the experiences's
      // ownerProfileId. This also helps when get() returns no readable data.
      if (!ownerProfile?.email) {
        const ownerProfilesResult =
          await client.models.ExperienceOwnerProfile.list({
            authMode: "apiKey",
          });

        console.log("Owner profile list result:", ownerProfilesResult);

        if (ownerProfilesResult.errors?.length) {
          console.warn(
            "Owner profile list errors:",
            ownerProfilesResult.errors,
          );
        }

        ownerProfile =
          ownerProfilesResult.data.find(
            (candidate) => candidate.id === selectedExperience.ownerProfileId,
          ) ?? ownerProfile;
      }

      const experienceOwnerEmail = ownerProfile?.email?.trim();

      if (!experienceOwnerEmail) {
        console.error("Could not resolve experience owner email.", {
          selectedExperience,
          ownerProfile,
        });

        throw new Error(
          `No readable owner email was found for owner profile ${selectedExperience.ownerProfileId}.`,
        );
      }

      await sendBookingEmailWithAppointment(
        appointmentDateTime,
        profile,
        selectedExperience.name,
        selectedExperience.location,
        experienceOwnerEmail,
      );

      setAppointments((currentAppointments) => [
        ...currentAppointments,
        newAppointment,
      ]);

      alert("Your experience appointment request was sent.");

      setSelectedExperience(null);
      setAppointmentTitle("");
      setSelectedDate(null);
      setSelectedTime("09:00");
      setShowContactForm(false);
    } catch (error: unknown) {
      console.error("Could not send appointment email:", error);

      let errorMessage = "The appointment email could not be sent.";

      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (
        typeof error === "object" &&
        error !== null &&
        "text" in error
      ) {
        errorMessage = String((error as { text?: string }).text);
      }

      alert(`Email could not be sent: ${errorMessage}`);
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
                    onClick={() => openAppointmentForm(experience)}
                  >
                    Select date and time
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

            {!showContactForm ? (
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
                      dateFormat="MMMM d, yyyy"
                      placeholderText="Select a date"
                      className="datepicker-input"
                    />
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
                    onClick={openContactForm}
                  >
                    Send Booking Request
                  </button>
                </div>
              </>
            ) : (
              <BookingContactForm
                isSending={isSending}
                onCancel={() => setShowContactForm(false)}
                onSend={(contact) => {
                  void sendAppointmentRequest(contact);
                }}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default AppointmentCalendar;
