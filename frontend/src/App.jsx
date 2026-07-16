import { useEffect, useRef, useState } from "react";
import {
  bulkCheckout,
  checkInAgain,
  checkoutVisitor,
  createPrintJob,
  createVisitor,
  findVisitors,
  generateBadge,
  getActiveVisitors,
  getVisitor,
  login,
  searchVisitors,
  uploadPhoto,
} from "./api";

export default function App() {

  const [activeVisitors, setActiveVisitors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const canvasRef = useRef(null);
  const [checkoutFirstName, setCheckoutFirstName] = useState("");
  const [checkoutLastName, setCheckoutLastName] = useState("");
  const [checkoutResults, setCheckoutResults] = useState([]);
  const [contactName, setContactName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [purpose, setPurpose] = useState("Visiting Camper");
  const [returningPhotoFile, setReturningPhotoFile] = useState(null);
  const [returningPhotoPreview, setReturningPhotoPreview] = useState(null);
  const [returningVisitor, setReturningVisitor] = useState({
    first_name: "",
    last_name: "",
    visitor_type: "",
    purpose: "",
    host_name: "",
  });
  const [screen, setScreen] = useState("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [successTitle, setSuccessTitle] = useState("");
  const [username, setUsername] = useState("");
  const [videoDevices, setVideoDevices] = useState([]);
  const videoRef = useRef(null);
  const [visitorType, setVisitorType] = useState("Parent");



  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const savedUsername = localStorage.getItem("username");

    if (token) {
      setIsAuthenticated(true);

      if (savedUsername) {
        setUsername(savedUsername);
      }

      setScreen("staff");
      loadActiveVisitors();
    }
  }, []);

  useEffect(() => {
    if (cameraOpen && cameraStream && videoRef.current) {
      console.log("Attaching stream");

      videoRef.current.srcObject = cameraStream;

      videoRef.current.play().catch((error) => {
        console.error("Video play error:", error);
      });
    }
  }, [cameraOpen, cameraStream]);


  function capturePhoto() {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
          console.log("video or canvas missing");
          return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
          if (!blob) {
              return;
          }

          const file = new File(
              [blob],
              "visitor-photo.jpg",
              { type: "image/jpeg" }
          );

          const previewUrl = URL.createObjectURL(file);

          setReturningPhotoFile(file);
          setReturningPhotoPreview(previewUrl);

          closeCamera();
      }, "image/jpeg", 0.95);
  }

  function closeCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    setCameraStream(null);
    setCameraOpen(false);
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
      setBusy(true);

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

      setScreen("success");

      setTimeout(() => {
        setFirstName("");
        setLastName("");
        setVisitorType("Parent");
        setPurpose("Visiting Camper");
        setContactName("");
        setPhotoFile(null);
        setPhotoPreview(null);
        setBusy(false);

        setScreen("home");
      }, 5000);
    } catch (error) {
      console.error(error);
      setBusy(false);
      alert(error.message);
    }
  }

  function handleCheckInAgain(visitor) {
    setReturningVisitor({
      first_name: visitor.first_name,
      last_name: visitor.last_name,
      visitor_type: visitor.visitor_type,
      purpose: visitor.purpose,
      host_name: visitor.host_name,
    });

    setReturningPhotoFile(null);

    setScreen("returning-checkin");
  }

  async function handleGuestCheckout(visitorId) {
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

async function handleSubmitReturningVisitor() {
  try {
    setBusy(true);

    const visitor = await checkInAgain(
      selectedVisitor.id,
      {
        visitor_type: returningVisitor.visitor_type,
        purpose: returningVisitor.purpose,
        host_name: returningVisitor.host_name,
        reuse_existing_photo: !returningPhotoFile,
      }
    );

    if (returningPhotoFile) {
      await uploadPhoto(visitor.id, returningPhotoFile);
    }

    await generateBadge(visitor.id);

    await createPrintJob(visitor.id);

    setSuccessTitle("Visitor Checked In");
    setSuccessMessage(
      "Returning visitor badge has been sent to the printer."
    );

    setScreen("success");

    setTimeout(() => {
      setBusy(false);
      setScreen("staff");
    }, 3000);

  } catch (error) {
    console.error(error);
    setBusy(false);
    alert(error.message);
  }
}

  async function handleVisitorSearch() {
    try {
      const results = await searchVisitors(searchQuery);

      setSearchResults(results);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleVisitorSelect(visitorId) {
    try {
      const visitor = await getVisitor(visitorId);

      setSelectedVisitor(visitor);
      setScreen("visitor-detail");
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

  async function handleStaffCheckout(visitorId) {
    try {
      await checkoutVisitor(visitorId);

      await loadActiveVisitors();

    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleStaffLogin() {
    try {
      const result = await login(username, password);

      localStorage.setItem("access_token", result.access_token);
      localStorage.setItem("username", username);

      setIsAuthenticated(true);

      await loadActiveVisitors();

      setScreen("staff");
    } catch (error) {
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

  async function loadCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameras = devices.filter(
        (device) => device.kind === "videoinput"
      );

      setVideoDevices(cameras);

      if (cameras.length > 0) {
        const preferred =
          cameras.find((c) => c.label.includes("LifeCam")) ||
          cameras.find((c) => c.label.includes("Surface Camera")) ||
          cameras[0];

        setSelectedCamera(preferred.deviceId);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function openCamera() {
    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        document
          .getElementById("returningPhotoInput")
          ?.click();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      console.error(error);

      document
        .getElementById("returningPhotoInput")
        ?.click();
    }
  }

  async function switchCamera(deviceId) {
    if (!deviceId) {
      return;
    }

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }

      setSelectedCamera(deviceId);
      setCameraStream(null);

      await new Promise((resolve) => setTimeout(resolve, 250));

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: {
            exact: deviceId,
          },
        },
        audio: false,
      });

      setCameraStream(stream);
    } catch (error) {
      console.error("Camera switch failed:", error);

      alert(
        "That camera could not be started. It may already be in use or unavailable. Please choose another camera."
      );
    }
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
                onClick={() => {
                  const supportsGetUserMedia =
                    navigator.mediaDevices &&
                    typeof navigator.mediaDevices.getUserMedia === "function";

                  if (supportsGetUserMedia) {
                    openCamera();
                  } else {
                    document.getElementById("photoInput").click();
                  }
                }}
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
                onClick={() => handleGuestCheckout(visitor.id)}
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
    if (!isAuthenticated) {
      return (
        <div style={styles.page}>
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>Authentication Required</h1>

            <p style={styles.instructions}>
              Please sign in to access the staff dashboard.
            </p>

            <button
              style={styles.printButton}
              onClick={() => setScreen("staff-login")}
            >
              Go To Login
            </button>
          </div>
        </div>
      );
    }

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
            <strong>Logged in as {username}</strong>
            <br />
            {activeVisitors.length} active visitor(s) currently on campus.
          </p>

          <div style={styles.dashboardButtonRow}>
            <button
              style={styles.staffActionButton}
              onClick={loadActiveVisitors}
            >
              Refresh Visitors
            </button>

            <button
              style={styles.staffActionButton}
              onClick={() => {
                setSearchResults([]);
                setSearchQuery("");
                setScreen("visitor-search");
              }}
            >
              Visitor Search
            </button>

            <button
              style={styles.staffActionButton}
              onClick={() => {
                localStorage.removeItem("access_token");
                localStorage.removeItem("username");
                setIsAuthenticated(false);
                setScreen("home");
              }}
            >
              Logout
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

              <div style={styles.visitorActionRow}>
                <button
                  style={styles.staffActionButton}
                  onClick={() => handleReprintBadge(visitor.id)}
                >
                  Reprint Badge
                </button>

                <button
                  style={styles.staffActionButton}
                  onClick={() => handleStaffCheckout(visitor.id)}
                >
                  Check Out Visitor
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Visitor Search
  if (screen === "visitor-search") {
    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("staff")}
        >
          ← Staff Dashboard
        </button>

        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Visitor Search</h1>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Search Visitor
            </label>

            <input
              style={styles.input}
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
            />
          </div>

          <button
            style={styles.photoButton}
            onClick={handleVisitorSearch}
          >
            Search
          </button>

          {searchResults.map((visitor) => (
            <div
              key={visitor.id}
              style={styles.resultCard}
            >
              <h3>
                {visitor.first_name}{" "}
                {visitor.last_name}
              </h3>

              <p>{visitor.visitor_type}</p>

              <button
                style={styles.staffActionButton}
                onClick={() =>
                  handleVisitorSelect(visitor.id)
                }
              >
                View Details
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }


  // Visitor Details
  if (screen === "visitor-detail") {
    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("visitor-search")}
        >
          ← Search Results
        </button>

        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Visitor Details</h1>

          <div style={styles.resultCard}>

            {selectedVisitor.photo_path && (
              <img
                src={`${import.meta.env.VITE_API_BASE}/${selectedVisitor.photo_path}`}
                alt="Visitor"
                style={styles.visitorPhoto}
              />
            )}

            <h2 style={styles.detailName}>
              {selectedVisitor.first_name}{" "}
              {selectedVisitor.last_name}
            </h2>

            <p>
              <strong>Visitor Type:</strong>{" "}
              {selectedVisitor.visitor_type}
            </p>

            <p>
              <strong>Purpose:</strong>{" "}
              {selectedVisitor.purpose}
            </p>

            <p>
              <strong>Contact:</strong>{" "}
              {selectedVisitor.host_name}
            </p>

            <p>
              <strong>Checked In:</strong>{" "}
              {new Date(
                selectedVisitor.check_in_time
              ).toLocaleString()}
            </p>
          </div>

          <div style={styles.dashboardButtonRow}>
            <button
              style={styles.staffActionButton}
              onClick={() =>
                handleReprintBadge(selectedVisitor.id)
              }
            >
              Reprint Badge
            </button>

            <button
              style={styles.staffActionButton}
              onClick={() => handleCheckInAgain(selectedVisitor)}
            >
              Check In Again
            </button>

          </div>
        </div>
      </div>
    );
  }

// Returning Visitor Check-In Screen
if (screen === "returning-checkin") {
  const existingPhotoUrl = selectedVisitor?.photo_path
    ? `${import.meta.env.VITE_API_BASE || ""}/${selectedVisitor.photo_path.replaceAll("\\", "/")}`
    : null;

  const displayedPhoto = returningPhotoPreview || existingPhotoUrl;

  return (
    <div style={styles.page}>
      <button
        style={styles.backButton}
        onClick={() => setScreen("visitor-detail")}
      >
        ← Visitor Details
      </button>

      <div style={styles.formContainer}>
        <h1 style={styles.formTitle}>Returning Visitor Check-In</h1>

        <p style={styles.instructions}>
          Review visitor information and make updates before printing a new badge.
        </p>

        <div style={styles.contentContainer}>
          <div style={styles.formColumn}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>First Name</label>
              <input
                style={styles.input}
                value={returningVisitor.first_name}
                readOnly
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Last Name</label>
              <input
                style={styles.input}
                value={returningVisitor.last_name}
                readOnly
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Visitor Type</label>
              <select
                style={styles.input}
                value={returningVisitor.visitor_type}
                onChange={(event) =>
                  setReturningVisitor({
                    ...returningVisitor,
                    visitor_type: event.target.value,
                  })
                }
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
                value={returningVisitor.purpose}
                onChange={(event) =>
                  setReturningVisitor({
                    ...returningVisitor,
                    purpose: event.target.value,
                  })
                }
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
                value={returningVisitor.host_name}
                onChange={(event) =>
                  setReturningVisitor({
                    ...returningVisitor,
                    host_name: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div style={styles.photoColumn}>
            <input
              id="returningPhotoInput"
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (!file) {
                  return;
                }

                const previewUrl = URL.createObjectURL(file);

                setReturningPhotoFile(file);
                setReturningPhotoPreview(previewUrl);

                console.log("returningPhotoPreview set:", previewUrl);
              }}
            />

            <div style={styles.photoPlaceholder}>
              {displayedPhoto ? (
                <img
                  src={displayedPhoto}
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
              onClick={() => {
                const supportsGetUserMedia =
                  navigator.mediaDevices &&
                  typeof navigator.mediaDevices.getUserMedia === "function";

                if (supportsGetUserMedia) {
                  openCamera();
                } else {
                  document.getElementById("returningPhotoInput").click();
                }
              }}
            >
              Retake Visitor Photo
            </button>
          </div>
        </div>

        <button
          style={styles.printButton}
          onClick={handleSubmitReturningVisitor}
          disabled={busy}
        >
          {busy ? "Printing Badge..." : "Print Visitor Badge"}
        </button>
      </div>

      {cameraOpen && (
        <div style={styles.cameraOverlay}>
          <div style={styles.cameraPanel}>
            <h2 style={styles.formTitle}>Take Visitor Photo</h2>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Camera</label>
              <select
                style={styles.input}
                value={selectedCamera}
                onChange={(event) => switchCamera(event.target.value)}
              >
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Camera"}
                  </option>
                ))}
              </select>
            </div>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={styles.cameraVideo}
            />

            <canvas
              ref={canvasRef}
              style={{ display: "none" }}
            />

            <div style={styles.dashboardButtonRow}>
              <button
                style={styles.staffActionButton}
                onClick={capturePhoto}
              >
                Capture Photo
              </button>

              <button
                style={styles.staffActionButton}
                onClick={closeCamera}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


  // Staff Login
  if (screen === "staff-login") {
    return (
      <div style={styles.page}>
        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Staff Login</h1>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button
            style={styles.printButton}
            onClick={handleStaffLogin}
          >
            Sign In
          </button>
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
        onClick={() => setScreen("staff-login")}
      >
        Staff Login
      </button>

    </div>
  );

// End of App()
}



// Styles
const styles = {
  backButton: {
    background: "white",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    color: "#111827",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    left: "20px",
    minWidth: "120px",
    padding: "16px 24px",
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

  dashboardButtonRow: {
    display: "flex",
    gap: "16px",
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: "24px",
  },

  detailName: {
    color: "#111827",
    fontSize: "2rem",
    fontWeight: 700,
    marginTop: 0,
    marginBottom: "16px",
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
    color: "#111827",
    fontSize: "1.2rem",
    height: "64px",
    padding: "0 20px",
    caretColor: "#111827",
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

  staffActionButton: {
    backgroundColor: "#2563eb",
    border: "none",
    borderRadius: "16px",
    color: "white",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    height: "56px",
    minWidth: "180px",
    flex: "1 1 220px",
    padding: "0 24px",
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

  visitorActionRow: {
  display: "flex",
  justifyContent: "center",
  gap: "16px",
  flexWrap: "wrap",
  marginTop: "16px",
  },

  visitorPhoto: {
    width: "240px",
    height: "320px",
    objectFit: "cover",
    borderRadius: "16px",
    border: "1px solid #d1d5db",
    marginBottom: "20px",
    backgroundColor: "#e5e7eb",
  }, 


};