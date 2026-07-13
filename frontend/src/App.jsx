import { useState } from "react";
import {
  bulkCheckout,
  checkoutVisitor,
  createPrintJob,
  createVisitor,
  generateBadge,
  getActiveVisitors,
  findVisitors,
  uploadPhoto,
} from "./api";

export default function App() {

  const [activeVisitors, setActiveVisitors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [checkoutFirstName, setCheckoutFirstName] = useState("");
  const [checkoutLastName, setCheckoutLastName] = useState("");
  const [checkoutResults, setCheckoutResults] = useState([]);
  const [contactName, setContactName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [purpose, setPurpose] = useState("Visiting Camper");
  const [screen, setScreen] = useState("home");
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [successTitle, setSuccessTitle] = useState("");
  const [visitorType, setVisitorType] = useState("Parent");



  async function loadActiveVisitors() {
    try {
      const visitors = await getActiveVisitors();
      setActiveVisitors(visitors);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleBulkCheckout() {
  const confirmed = window.confirm(
    "Check out all active visitors?"
  );

  if (!confirmed) {
    return;
  }

  try {
    await bulkCheckout();

    await loadActiveVisitors();

    setSuccessTitle("Bulk Checkout Complete");
    setSuccessMessage(
      "All active visitors have been checked out."
    );

    setScreen("success");

    setTimeout(() => {
      loadActiveVisitors();
      setScreen("staff");
    }, 3000);
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
  }

  async function handleCheckIn() {
    try {
      const visitor = await createVisitor({
        first_name: firstName,
        last_name: lastName,
        visitor_type: visitorType,
        church: "",
        phone: "",
        purpose: purpose,
        host_type: "Camper",
        host_name: contactName,
        vehicle_plate: "",
        notes: "",
        expected_departure_time: null,
      });

      if (photoFile) {
        await uploadPhoto(visitor.id, photoFile);
        await generateBadge(visitor.id);
      }

      await createPrintJob(visitor.id);

      setSuccessTitle("Check-In Complete");
      setSuccessMessage(
        "Your visitor badge is being printed. Please wear it while on campus."
      );

      await checkoutVisitor(visitorId);
      await loadActiveVisitors();

      setScreen("success");

      setTimeout(() => {
        setFirstName("");
        setLastName("");
        setVisitorType("Parent");
        setPurpose("Visiting Camper");
        setContactName("");
        setPhotoFile(null);
        setPhotoPreview(null);

        setScreen("home");
      }, 5000);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleCheckout(visitorId) {
    try {
      await checkoutVisitor(visitorId);

      setSuccessTitle("Check-Out Complete");
      setSuccessMessage(
        "Thank you for visiting Palmetto Bible Camp."
      );

      setCheckoutResults([]);
      setCheckoutFirstName("");
      setCheckoutLastName("");

      setScreen("success");

      setTimeout(() => {
        setScreen("home");
      }, 5000);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleFindVisitor() {
    try {
      const results = await findVisitors(
        checkoutFirstName,
        checkoutLastName
      );

      setCheckoutResults(results);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleReprintBadge(visitorId) {
    try {
      await createPrintJob(visitorId);

      setSuccessTitle("Badge Reprint Queued");
      setSuccessMessage(
        "A new visitor badge has been sent to the printer."
      );

      setScreen("success");

      setTimeout(() => {
        setScreen("staff");
      }, 3000);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function loadActiveVisitors() {
    try {
      const visitors = await getActiveVisitors();
      setActiveVisitors(visitors);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  function handlePhotoChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }  



  // Check-in Screen
  if (screen === "checkin") {
    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("home")}
        >
          ← Home
        </button>

        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Visitor Check-In</h1>
          <p style={styles.instructions}>
            Complete the form and take a visitor photo before printing a badge.
          </p>

          <div style={styles.contentContainer}>
            <div style={styles.formColumn}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>First Name</label>
                  <input
                      style={styles.input}
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                  />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Last Name</label>
                <input
                    style={styles.input}
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Visitor Type</label>
                <select
                    style={styles.input}
                    value={visitorType}
                    onChange={(event) => setVisitorType(event.target.value)}
                >
                  <option>Parent</option>
                  <option>Grandparent</option>
                  <option>Family Member</option>
                  <option>Vendor/Service</option>
                  <option>Friend</option>
                  <option>Minister</option>
                  <option>Board Member</option>
                  <option>Other Guest</option>
                </select>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Purpose</label>
                <select
                    style={styles.input}
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                >
                  <option>Visiting Camper</option>
                  <option>Dinner</option>
                  <option>Family Night</option>
                  <option>Awards Ceremony</option>
                  <option>Talent Show</option>
                  <option>Vendor Delivery</option>
                  <option>Service Call</option>
                </select>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Camper or Contact Name</label>
                <input
                    style={styles.input}
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                />
              </div>
            </div>

            <div style={styles.photoColumn}>
              <input
                id="photoInput"
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: "none" }}
                onChange={handlePhotoChange}
              />

              <div style={styles.photoPlaceholder}>
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Visitor Preview"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "18px",
                    }}
                  />
                ) : (
                  "Photo Preview"
                )}
              </div>

              <button
                style={styles.photoButton}
                onClick={() => document.getElementById("photoInput").click()}
              >
                Take Visitor Photo
              </button>
            </div>
          </div>

          <button
            style={styles.printButton}
            onClick={handleCheckIn}
            disabled={busy}
          >
            {busy ? "Printing Badge..." : "Print Visitor Badge"}
          </button>

        </div>
      </div>
    );
  }

  // Check-out Screen
  if (screen === "checkout") {
    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("home")}
        >
          ← Home
        </button>

        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Visitor Check-Out</h1>

          <p style={styles.instructions}>
            Enter the visitor’s name to locate an active badge.
          </p>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>First Name</label>
            <input
              style={styles.input}
              value={checkoutFirstName}
              onChange={(event) =>
                setCheckoutFirstName(event.target.value)
              }
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Last Name</label>
            <input
              style={styles.input}
              value={checkoutLastName}
              onChange={(event) =>
                setCheckoutLastName(event.target.value)
              }
            />
          </div>

          <button
            style={styles.photoButton}
            onClick={handleFindVisitor}
          >
            Find Visitor
          </button>

          {checkoutResults.map((visitor) => (
            <div
              key={visitor.id}
              style={styles.resultCard}
            >
              <h3>
                {visitor.first_name} {visitor.last_name}
              </h3>

              <p>{visitor.visitor_type}</p>

              <button
                style={styles.printButton}
                onClick={() => handleCheckout(visitor.id)}
              >
                Check Out Visitor
              </button>
            </div>
          ))}

        </div>
      </div>
    );
  }

  // Staff Screen
  if (screen === "staff") {
    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("home")}
        >
          ← Home
        </button>

        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Staff Dashboard</h1>

          <p style={styles.instructions}>
            {activeVisitors.length} active visitor(s) currently on campus.
          </p>

          <div style={{ marginBottom: "24px" }}>
            <button
              style={styles.photoButton}
              onClick={loadActiveVisitors}
            >
              Refresh Visitors
            </button>

            <button
              style={styles.printButton}
              onClick={handleBulkCheckout}
            >
              Bulk Checkout
            </button>
          </div>

          {activeVisitors.map((visitor) => (
            <div
              key={visitor.id}
              style={styles.resultCard}
            >
              <h3>
                {visitor.first_name} {visitor.last_name}
              </h3>

              <p>
                <strong>Type:</strong> {visitor.visitor_type}
              </p>

              <p>
                <strong>Purpose:</strong> {visitor.purpose}
              </p>

              <p>
                <strong>Contact:</strong> {visitor.host_name}
              </p>

              <p>
                <strong>Checked In:</strong>{" "}
                {new Date(visitor.check_in_time).toLocaleString()}
              </p>

              <button
                style={styles.photoButton}
                onClick={() => handleReprintBadge(visitor.id)}
              >
                Reprint Badge
              </button>

              <button
                style={styles.photoButton}
                onClick={() => handleCheckout(visitor.id)}
              >
                Check Out Visitor
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // App() Return
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <h1 style={styles.title}>Palmetto Bible Camp</h1>
        <p style={styles.subtitle}>Visitor Kiosk</p>
      </div>

      <div style={styles.cardContainer}>
        <button
          style={styles.primaryCard}
          onClick={() => setScreen("checkin")}
        >
          Check In
        </button>

        <button
          style={styles.secondaryCard}
          onClick={() => setScreen("checkout")}
        >
          Check Out
        </button>
      </div>

      <button
        style={styles.staffButton}
        onClick={async () => {
          await loadActiveVisitors();
          setScreen("staff");
        }}
      >
        Staff Login
      </button>

    </div>
  );

// End of App()
}





const styles = {
  backButton: {
    background: "white",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    cursor: "pointer",
    left: "20px",
    padding: "12px 18px",
    position: "absolute",
    top: "20px",
  },

  cardContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "24px",
    justifyContent: "center",
  },

  contentContainer: {
    alignItems: "center",
    display: "flex",
    gap: "40px",
    justifyContent: "space-between",
    width: "100%",
  },

  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "12px",
  },

  formColumn: {
    flex: 1,
  },

  formContainer: {
    backgroundColor: "white",
    borderRadius: "24px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    maxWidth: "900px",
    padding: "40px",
    width: "100%",
  },

  formTitle: {
    color: "#111827",
    fontSize: "2.5rem",
    marginBottom: "12px",
    marginTop: 0,
  },

  hero: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    marginBottom: "80px",
    textAlign: "center",
  },

  input: {
    backgroundColor: "#f9fafb",
    border: "1px solid #d1d5db",
    borderRadius: "14px",
    fontSize: "1.2rem",
    height: "64px",
    padding: "0 20px",
  },

  instructions: {
    color: "#6b7280",
    fontSize: "1rem",
    marginBottom: "32px",
    marginTop: "0px",
    textAlign: "center",
  },

  label: {
    color: "#374151",
    fontSize: "1rem",
    fontWeight: 600,
    marginBottom: "8px",
  },

  page: {
    alignItems: "center",
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    fontFamily: "Inter, Arial, sans-serif",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "40px",
  },

  photoButton: {
    backgroundColor: "#2563eb",
    border: "none",
    borderRadius: "16px",
    color: "white",
    cursor: "pointer",
    fontSize: "1.25rem",
    fontWeight: 600,
    height: "70px",
    width: "320px",
  },

  photoCard: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    marginBottom: "30px",
    marginTop: "0",
  },

  photoColumn: {
    width: "420px",
  },

  photoPlaceholder: {
    alignItems: "center",
    backgroundColor: "#e5e7eb",
    borderRadius: "18px",
    color: "#6b7280",
    display: "flex",
    fontSize: "1.2rem",
    height: "500px",
    justifyContent: "center",
    width: "420px",
  },

  primaryCard: {
    background: "#2563eb",
    border: "none",
    borderRadius: "24px",
    color: "white",
    cursor: "pointer",
    fontSize: "2rem",
    fontWeight: 700,
    height: "180px",
    width: "320px",
  },

  printButton: {
    width: "100%",
    border: "none",
    borderRadius: "16px",
    color: "black",
    cursor: "pointer",
    fontSize: "2rem",
    fontWeight: 700,
    height: "90px",
    marginTop: "24px",
  },

  resultCard: {
    backgroundColor: "#f9fafb",
    border: "1px solid #d1d5db",
    borderRadius: "16px",
    marginTop: "16px",
    padding: "20px",
  },

  screenTitle: {
    color: "#111827",
    fontSize: "3rem",
  },

  secondaryCard: {
    background: "#10b981",
    border: "none",
    borderRadius: "24px",
    color: "white",
    cursor: "pointer",
    fontSize: "2rem",
    fontWeight: 700,
    height: "180px",
    width: "320px",
  },

  staffButton: {
    background: "none",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: "1rem",
    marginTop: "40px",
  },

  subtitle: {
    color: "#6b7280",
    fontSize: "1.4rem",
    fontWeight: 400,
    letterSpacing: "0.02em",
    margin: 0,
  },

  title: {
    color: "#111827",
    fontSize: "3.75rem",
    fontWeight: 700,
    lineHeight: 1,
    margin: 0,
  },

};