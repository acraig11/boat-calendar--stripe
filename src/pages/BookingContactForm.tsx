import { useState, type FormEvent } from "react";

export type BookingContactData = {
  name: string;
  email: string;
  phone: string;
};

type BookingContactFormProps = {
  isSending: boolean;
  onCancel: () => void;
  onSend: (contact: BookingContactData) => void;
};

function BookingContactForm({
  isSending,
  onCancel,
  onSend,
}: BookingContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      alert("Please enter your name.");
      return;
    }

    if (!email.trim()) {
      alert("Please enter your email address.");
      return;
    }

    if (!phone.trim()) {
      alert("Please enter your phone number.");
      return;
    }

    onSend({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
    });
  };

  return (
    <form className="booking-contact-form" onSubmit={handleSubmit}>
      <h2>Contact Information</h2>

      <p className="contact-form-description">
        Enter your contact information to send the booking request.
      </p>

      <label>
        Name
        <input
          type="text"
          value={name}
          placeholder="Your full name"
          autoComplete="name"
          disabled={isSending}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label>
        Email
        <input
          type="email"
          value={email}
          placeholder="you@example.com"
          autoComplete="email"
          disabled={isSending}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label>
        Phone Number
        <input
          type="tel"
          value={phone}
          placeholder="386-555-1234"
          autoComplete="tel"
          disabled={isSending}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>

      <div className="dialog-buttons">
        <button
          type="button"
          className="cancel-button"
          disabled={isSending}
          onClick={onCancel}
        >
          Back
        </button>

        <button type="submit" className="save-button" disabled={isSending}>
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}

export default BookingContactForm;
