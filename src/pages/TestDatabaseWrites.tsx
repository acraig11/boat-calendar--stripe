import { useState } from "react";
import { client } from "../lib/amplifyClient";

const TEST_EXPERIENCE_ID = "1d56cc1c-1011-443c-9f11-ac12c147aa2d";
const TEST_OWNER_PROFILE_ID = "060c0a64-f924-40cb-82ba-7f806287559e";
const TEST_EXPERIENCE_NAME = "Tennis";
const TEST_LOCATION = "Aiken sc";

function TestDatabaseWrites() {
  const [bookingMessage, setBookingMessage] = useState("");
  const [calendarMessage, setCalendarMessage] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [isWritingBooking, setIsWritingBooking] = useState(false);
  const [isWritingCalendar, setIsWritingCalendar] = useState(false);

  const writeBookingRecord = async () => {
    try {
      setIsWritingBooking(true);
      setBookingMessage("");

      const appointmentDateTime = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      const input = {
        customerName: "Temporary Test User",
        customerEmail: "temporary-test@example.com",
        customerPhone: "555-555-5555",
        appointmentDateTime,
        experienceId: TEST_EXPERIENCE_ID,
        experienceName: TEST_EXPERIENCE_NAME,
        ownerProfileId: TEST_OWNER_PROFILE_ID,
      };

      console.log("TEST BOOKING INPUT:", input);

      const result = await client.models.Booking.create(input, {
        authMode: "apiKey",
      });

      console.log("TEST BOOKING RESULT:", result);

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      if (!result.data) {
        throw new Error("No booking record was returned.");
      }

      setBookingId(result.data.id);
      setBookingMessage(`Booking created successfully: ${result.data.id}`);
    } catch (error) {
      console.error("TEST BOOKING ERROR:", error);

      setBookingMessage(
        error instanceof Error
          ? `Booking failed: ${error.message}`
          : "Booking failed for an unknown reason.",
      );
    } finally {
      setIsWritingBooking(false);
    }
  };

  const writeCalendarRecord = async () => {
    try {
      setIsWritingCalendar(true);
      setCalendarMessage("");

      const startDateTime = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      const input = {
        experienceId: TEST_EXPERIENCE_ID,
        experienceName: TEST_EXPERIENCE_NAME,
        ownerProfileId: TEST_OWNER_PROFILE_ID,
        bookingId,
        startDateTime,
        status: "PENDING" as const,
        title: "Temporary Test Event",
      };

      console.log("TEST CALENDAR INPUT:", input);

      const result = await client.models.ExperienceCalendarEvent.create(input, {
        authMode: "apiKey",
      });

      console.log("TEST CALENDAR RESULT:", result);

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      if (!result.data) {
        throw new Error("No calendar event record was returned.");
      }

      setCalendarMessage(
        `Calendar event created successfully: ${result.data.id}`,
      );
    } catch (error) {
      console.error("TEST CALENDAR ERROR:", error);

      setCalendarMessage(
        error instanceof Error
          ? `Calendar write failed: ${error.message}`
          : "Calendar write failed for an unknown reason.",
      );
    } finally {
      setIsWritingCalendar(false);
    }
  };

  return (
    <main style={{ maxWidth: "720px", margin: "40px auto", padding: "24px" }}>
      <h1>Temporary Database Write Test</h1>

      <p>
        This page writes one test record at a time using the Tennis experience.
      </p>

      <section style={{ marginBottom: "32px" }}>
        <h2>1. Test Booking Table</h2>

        <button
          type="button"
          onClick={() => void writeBookingRecord()}
          disabled={isWritingBooking}
        >
          {isWritingBooking ? "Writing Booking..." : "Write Booking Record"}
        </button>

        {bookingMessage && <p>{bookingMessage}</p>}
      </section>

      <section>
        <h2>2. Test Calendar Table</h2>

        <button
          type="button"
          onClick={() => void writeCalendarRecord()}
          disabled={isWritingCalendar}
        >
          {isWritingCalendar
            ? "Writing Calendar Event..."
            : "Write Calendar Record"}
        </button>

        {calendarMessage && <p>{calendarMessage}</p>}
      </section>
    </main>
  );
}

export default TestDatabaseWrites;
