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
type Boat = {
  id: string;
  name: string;
  imageUrl?: string | null;
  estimatedPrice?: number | null;
  location: string;
  description?: string | null;
  ownerProfileId: string;
};

type Appointment = {
  id: string;
  boatId: string;
  boatName: string;
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

function BoatImage({
  imagePath,
  boatName,
  className,
}: {
  imagePath?: string | null;
  boatName: string;
  className: string;
}) {
  const [displayUrl, setDisplayUrl] = useState("/images/boat-placeholder.png");

  useEffect(() => {
    let isActive = true;

    async function loadImage() {
      if (!imagePath) {
        setDisplayUrl("/images/boat-placeholder.png");
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
        console.error("Could not load boat image:", error);

        if (isActive) {
          setDisplayUrl("/images/boat-placeholder.png");
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
      alt={boatName}
      onError={(event) => {
        event.currentTarget.src = "/images/boat-placeholder.png";
      }}
    />
  );
}

function AppointmentCalendar() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [isLoadingBoats, setIsLoadingBoats] = useState(true);
  const [boatLoadError, setBoatLoadError] = useState("");

  const [selectedBoat, setSelectedBoat] = useState<Boat | null>(null);

  const [appointmentTitle, setAppointmentTitle] = useState("");

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [selectedTime, setSelectedTime] = useState("09:00");

  const [showContactForm, setShowContactForm] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const datePickerRef = useRef<DatePicker>(null);
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    try {
      const saved = localStorage.getItem("boatAppointments");

      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Could not load appointments:", error);

      return [];
    }
  });

  useEffect(() => {
    async function loadBoats() {
      try {
        setIsLoadingBoats(true);
        setBoatLoadError("");

        const { data, errors } = await client.models.Boat.list({
          authMode: "apiKey",
        });

        if (errors?.length) {
          throw new Error(errors.map((error) => error.message).join(", "));
        }

        const databaseBoats: Boat[] = data.map((boat) => ({
          id: boat.id,
          name: boat.name,
          imageUrl: boat.imageUrl,
          estimatedPrice: boat.estimatedPrice,
          location: boat.location,
          description: boat.description,
          ownerProfileId: boat.ownerProfileId,
        }));

        setBoats(databaseBoats);
      } catch (error) {
        console.error("Could not load boats:", error);

        setBoatLoadError(
          error instanceof Error
            ? error.message
            : "The boats could not be loaded.",
        );
      } finally {
        setIsLoadingBoats(false);
      }
    }

    void loadBoats();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("boatAppointments", JSON.stringify(appointments));
    } catch (error) {
      console.error("Could not save appointments:", error);
    }
  }, [appointments]);

  const openAppointmentForm = (boat: Boat) => {
    setSelectedBoat(boat);
    setAppointmentTitle(`${boat.name} reservation`);
    setSelectedDate(null);
    setSelectedTime("09:00");
    setShowContactForm(false);
  };

  const closeAppointmentForm = () => {
    if (isSending) {
      return;
    }

    setSelectedBoat(null);
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
    if (!selectedBoat) {
      alert("Please select a boat.");
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
      boatId: selectedBoat.id,
      boatName: selectedBoat.name,
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

      const ownerProfileResult = await client.models.BoatOwnerProfile.get(
        {
          id: selectedBoat.ownerProfileId,
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

      if (!ownerProfileResult.data?.email) {
        throw new Error("The boat owner's email could not be found.");
      }

      const boatOwnerEmail = ownerProfileResult.data.email;

      await sendBookingEmailWithAppointment(
        appointmentDateTime,
        profile,
        selectedBoat.name,
        selectedBoat.location,
        boatOwnerEmail,
      );

      setAppointments((currentAppointments) => [
        ...currentAppointments,
        newAppointment,
      ]);

      alert("Your boat appointment request was sent.");

      setSelectedBoat(null);
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
    <main className="boat-page">
      <section className="boat-header">
        <p className="boat-eyebrow">Boat rentals</p>

        <h1>Choose Your Boat</h1>

        <p>Select a boat to choose your preferred appointment date and time.</p>
      </section>

      {isLoadingBoats && (
        <p className="boat-status-message">Loading boats...</p>
      )}

      {boatLoadError && (
        <p className="boat-status-message boat-error">
          Could not load boats: {boatLoadError}
        </p>
      )}

      {!isLoadingBoats && !boatLoadError && boats.length === 0 && (
        <p className="boat-status-message">No boats are currently available.</p>
      )}

      {!isLoadingBoats && !boatLoadError && boats.length > 0 && (
        <section className="boat-grid">
          {boats.map((boat) => (
            <article className="boat-card" key={boat.id}>
              <div className="boat-image-wrapper">
                <BoatImage
                  className="boat-image"
                  imagePath={boat.imageUrl}
                  boatName={boat.name}
                />

                {boat.estimatedPrice != null && (
                  <span className="boat-price">
                    ${boat.estimatedPrice}
                    <small> estimated</small>
                  </span>
                )}
              </div>

              <div className="boat-card-content">
                <h2>{boat.name}</h2>

                <p className="boat-location">
                  <span aria-hidden="true">📍</span>
                  {boat.location}
                </p>

                {boat.description && (
                  <p className="boat-description">{boat.description}</p>
                )}

                <button
                  type="button"
                  className="appointment-button"
                  onClick={() => openAppointmentForm(boat)}
                >
                  Select date and time
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {selectedBoat && (
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
                <BoatImage
                  className="dialog-boat-image"
                  imagePath={selectedBoat.imageUrl}
                  boatName={selectedBoat.name}
                />

                <h2>Create Appointment</h2>

                <p className="selected-boat-name">{selectedBoat.name}</p>

                <p className="selected-boat-details">
                  {selectedBoat.location}

                  {selectedBoat.estimatedPrice != null && (
                    <>
                      {" · "}
                      Approximately ${selectedBoat.estimatedPrice}
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
