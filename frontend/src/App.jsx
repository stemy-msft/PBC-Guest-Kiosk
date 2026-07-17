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
  getVisitorHistory,
  getVisitor,
  login,
  searchVisitors,
  uploadPhoto,
  updateVisitor,
} from "./api";

// This loads the configurable options in the app
import { VISITOR_TYPES, VISIT_PURPOSES } from "./constants/options";

// This loads the field definitions for the check-in form
import { FIELD_KEYS, REQUIRED_CHECKIN_FIELDS, REQUIRED_RETURNING_CHECKIN_FIELDS, getMissingRequiredFieldLabels } from "./constants/fields";

// Import the styles from styles.js  
import { getStyles } from "./constants/styles";

// Import the themese from themes.js
import { themes } from "./constants/themes";

// Change this to switch themes
const theme = themes.campGreen; // Change this to switch themes

// This will add some retro feel to CRT themes
const isCrtTheme =
  theme === themes.retroTerminal ||
  theme === themes.amberTerminal;

const styles = getStyles(theme, isCrtTheme);


export default function App() {

  const [activeVisitors, setActiveVisitors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const canvasRef = useRef(null);
  const [checkedInVisitorId, setCheckedInVisitorId] = useState(null);
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
    host_type: "",
    host_name: "",
    vehicle_plate: "",
    phone: "",
    email: "",
    notes: "",
    expected_departure_time: null,
  });
  const [screen, setScreen] = useState("home");
  const [screenHistory, setScreenHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [successTitle, setSuccessTitle] = useState("");

  const [username, setUsername] = useState("");
  const [videoDevices, setVideoDevices] = useState([]);
  const videoRef = useRef(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [visitCount, setVisitCount] = useState(0);
  const [visitorHistory, setVisitorHistory] = useState([]);
  const [visitorType, setVisitorType] = useState("Parent");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Staff screen refresh every 5 seconds
  useEffect(() => {
    if (screen !== "staff" || !isAuthenticated) {
      return;
    }

    console.log("Starting staff auto refresh");

    const interval = setInterval(() => {
      console.log("Refreshing visitors");
      loadActiveVisitors();
    }, 5000);

    return () => clearInterval(interval);
  }, [screen, isAuthenticated]);

  // Load authentication state from localStorage on mount
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

  // Handle camera stream when camera is open
  useEffect(() => {
    if (cameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;

      videoRef.current.play().catch((error) => {
        console.error("Video play error:", error);
      });
    }
  }, [cameraOpen, cameraStream]);

  // Populate returning visitor details when selectedVisitor changes
  useEffect(() => {
    if (!selectedVisitor) {
      return;
    }
    populateReturningVisitor(selectedVisitor);
  }, [selectedVisitor]);


    
  // Functions in App()

  function getPhotoUrl(photoPath) {
    if (!photoPath) {
      return null;
    }

    return `${import.meta.env.VITE_API_BASE}/${photoPath.replaceAll("\\", "/")}`;
  }

  function goBack() {
    if (screenHistory.length === 0) {
      return;
    }

    const previousScreen =
      screenHistory[screenHistory.length - 1];

    setScreenHistory((history) =>
      history.slice(0, -1)
    );

    setScreen(previousScreen);
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
      const historyData = await getVisitorHistory(visitorId);

      setVisitCount(historyData.visit_count);
      setVisitorHistory(historyData.history);
      setSelectedVisitor(visitor);

      setScreen("visitor-detail");
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

      setActiveVisitors((current) => {
        const currentJson = JSON.stringify(current);
        const newJson = JSON.stringify(visitors);

        return currentJson === newJson
          ? current
          : visitors;
      });
    } catch (error) {
      console.error(error);
    }
  }

  function navigateTo(screenName) {
    setScreenHistory((previous) => [...previous, screen]);
    setScreen(screenName);
  }

  async function handleUpdateVisitorDetails() {
    try {
      setBusy(true);
      const updatedVisitor = await updateVisitor(
        selectedVisitor.id,
        {
          first_name: returningVisitor.first_name,
          last_name: returningVisitor.last_name,
          visitor_type: returningVisitor.visitor_type,
          purpose: returningVisitor.purpose,
          host_name: returningVisitor.host_name,
          vehicle_plate: returningVisitor.vehicle_plate,
          phone: returningVisitor.phone,
          email: returningVisitor.email,
          notes: returningVisitor.notes,
          expected_departure_time: returningVisitor.expected_departure_time,
        }
      );

      setSelectedVisitor(updatedVisitor);
      populateReturningVisitor(updatedVisitor);

      alert("Visitor updated successfully.");
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  function populateReturningVisitor(visitor) {
    if (!visitor) {
      return;
    }

    const hydratedVisitor = {
      first_name: visitor.first_name ?? "",
      last_name: visitor.last_name ?? "",
      visitor_type: visitor.visitor_type ?? "",
      purpose: visitor.purpose ?? "",
      host_type: visitor.host_type ?? "",
      host_name: visitor.host_name ?? "",
      vehicle_plate: visitor.vehicle_plate ?? "",
      phone: visitor.phone ?? "",
      email: visitor.email ?? "",
      notes: visitor.notes ?? "",
      expected_departure_time: visitor.expected_departure_time ?? null,
    };

    setReturningVisitor(hydratedVisitor);
  }


  // Badge Functions
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

  function handlePhotoChange(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }  

  async function handlePrintReturningBadge() {
    try {
      if (!checkedInVisitorId) {
        alert("Please check in the visitor first.");
        return;
      }

      setBusy(true);

      await generateBadge(checkedInVisitorId);
      await createPrintJob(checkedInVisitorId);

      alert("Badge sent to printer.");

    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }
  // End Badge Functions


  // Checkin Functions

async function handleCheckIn() {
  const checkInValues = {
    [FIELD_KEYS.FIRST_NAME]: firstName,
    [FIELD_KEYS.LAST_NAME]: lastName,
    [FIELD_KEYS.VISITOR_TYPE]: visitorType,
    [FIELD_KEYS.PURPOSE]: purpose,
    [FIELD_KEYS.HOST_NAME]: contactName,
    [FIELD_KEYS.VEHICLE_PLATE]: vehiclePlate,
    [FIELD_KEYS.PHONE]: phone,
    [FIELD_KEYS.EMAIL]: email,
    [FIELD_KEYS.PHOTO]: photoFile,
  };

  const missingFields = getMissingRequiredFieldLabels(
    checkInValues,
    REQUIRED_CHECKIN_FIELDS
  );

  if (missingFields.length > 0) {
    alert(
      "Please complete the following required fields:\n\n" +
      missingFields.join("\n")
    );
    return;
  }

  try {
    setBusy(true);

    const visitor = await createVisitor({
      first_name: firstName,
      last_name: lastName,
      visitor_type: visitorType,
      church: null,
      phone: phone,
      email: email,
      purpose: purpose,
      host_type: "",
      host_name: contactName,
      vehicle_plate: vehiclePlate,
      notes: null,
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
        setVehiclePlate("");
        setEmail("");
        setPhone("");

        setScreen("home");
      }, 5000);
    } catch (error) {
      console.error(error);
      setBusy(false);
      alert(error.message);
    }
  }

  function handleCheckInAgain(visitor) {
    populateReturningVisitor(visitor);

    setReturningPhotoFile(null);
    setReturningPhotoPreview(null);
    setCheckedInVisitorId(null);

    setScreen("returning-checkin");
  }

  async function handleCheckInReturningVisitor() {
  try {
    setBusy(true);

    const visitor = await checkInAgain(
      selectedVisitor.id,
      {
        visitor_type: returningVisitor.visitor_type,
        purpose: returningVisitor.purpose,
        host_name: returningVisitor.host_name,
        email: returningVisitor.email,
        vehicle_plate: returningVisitor.vehicle_plate,
        phone: returningVisitor.phone,
        notes: returningVisitor.notes,
        reuse_existing_photo: !returningPhotoFile,
      }
    );

    if (returningPhotoFile) {
      await uploadPhoto(visitor.id, returningPhotoFile);
    }

    const updatedVisitor = await getVisitor(visitor.id);
    const historyData = await getVisitorHistory(visitor.id);

    setSelectedVisitor(updatedVisitor);
    setVisitCount(historyData.visit_count);
    setVisitorHistory(historyData.history);

    setCheckedInVisitorId(visitor.id);

    alert("Visitor checked in successfully.");

  } catch (error) {
    if (error.message.includes("already checked in")) {
      alert(
        "This visitor already has an active visit. Please check them out before creating another visit."
      );
      return;
    }

    console.error(error);
    alert(error.message);
    } finally {
      setBusy(false);
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
          email: returningVisitor.email,
          vehicle_plate: returningVisitor.vehicle_plate,
          phone: returningVisitor.phone,
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
        if (error.message.includes("already checked in")) {
          alert(
            "This visitor already has an active visit. "
            + "Please check them out before creating another visit."
          );
          return;
        }
      console.error(error);
      setBusy(false);
      alert(error.message);
    }
  }

  function validateCheckIn() {
    const missing = [];

    if (
      REQUIRED_CHECKIN_FIELDS.includes("first_name") &&
      !firstName.trim()
    ) {
      missing.push("First Name");
    }

    if (
      REQUIRED_CHECKIN_FIELDS.includes("last_name") &&
      !lastName.trim()
    ) {
      missing.push("Last Name");
    }

    if (
      REQUIRED_CHECKIN_FIELDS.includes("host_name") &&
      !contactName.trim()
    ) {
      missing.push("Camper or Contact Name");
    }

    if (
      REQUIRED_CHECKIN_FIELDS.includes("photo") &&
      !photoFile
    ) {
      missing.push("Visitor Photo");
    }

    return missing;
  }

  // End Checkin Functions


  // Checkout Functions
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

async function handleVisitorCheckout(visitorId) {
  try {
    await checkoutVisitor(visitorId);

    await loadActiveVisitors();

    if (searchQuery) {
      const results = await searchVisitors(searchQuery);
      setSearchResults(results);
    }

    const updatedVisitor = await getVisitor(visitorId);
    const historyData = await getVisitorHistory(visitorId);

    setSelectedVisitor(updatedVisitor);
    setVisitCount(historyData.visit_count);
    setVisitorHistory(historyData.history);

  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}
  // End Checkout Functions


  // Camera Functions
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

  async function loadCamerasDEPRECATED() {
    try {
      // Deprecated?
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
  // End Camera Functions


  // Check-in Screen
  if (screen === "checkin") {
    return (
      <div style={styles.page}>

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}


        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

        <button
          style={styles.backButton}
          onClick={() => navigateTo("home")}
        >
          ← Home
        </button>

        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Visitor Check-In</h1>
          <p style={styles.instructions}>
            Complete the form and take a visitor photo before printing a badge.
          </p>

          <div style={styles.checkinContentContainer}>

            {/* Data Column */}
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
                <label style={styles.label}>Camper or Contact Name</label>
                <input
                    style={styles.input}
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Visitor Type</label>
                <select
                    style={styles.input}
                    value={visitorType}
                    onChange={(event) => setVisitorType(event.target.value)}
                >
                  {VISITOR_TYPES.map((visitorTypeOption) => (
                    <option key={visitorTypeOption} value={visitorTypeOption}>
                      {visitorTypeOption}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Purpose</label>
                <select
                    style={styles.input}
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                >
                  {VISIT_PURPOSES.map((purposeOption) => (
                    <option key={purposeOption} value={purposeOption}>
                      {purposeOption}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Vehicle License Plate</label>
                <input
                  style={styles.input}
                  value={vehiclePlate}
                  onChange={(event) =>
                    setVehiclePlate(event.target.value.toUpperCase())
                  }
                />
              </div>   

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Phone</label>
                <input
                  style={styles.input}
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                />
              </div>   

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                />
              </div>

            </div>
         

            {/* Photo Column */}
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

              <p
                style={{
                  marginTop: 8,
                  marginBottom: 12,
                }}
              >
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
                </p>
            </div>
          </div>

          <button
            style={styles.printButton}
            onClick={handleCheckIn}
            disabled={busy}
          >
            {busy ? "Printing Badge..." : "Check-in"}
          </button>

        </div>
      </div>
    );
  }

  // Check-out Screen
  if (screen === "checkout") {
    return (
      <div style={styles.page}>

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}


        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

        <button
          style={styles.backButton}
          onClick={() => navigateTo("home")}
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3>
                  {visitor.first_name} {visitor.last_name}
                </h3>

                <span
                  style={{
                    backgroundColor: visitor.check_out_time
                      ? "#6b7280"
                      : "#16a34a",
                    color: "white",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "0.8rem",
                    fontWeight: "bold",
                  }}
                >
                  {visitor.check_out_time
                    ? "CHECKED OUT"
                    : "ACTIVE"}
                </span>
              </div>

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

          {/* Theme Overlay */}
          {theme.logoOverlay && (
            <img
              src={theme.logoOverlay}
              alt=""
              style={styles.themeOverlay}
            />
          )}

          {/* CRT Theme Effects */}
          {isCrtTheme && (
            <>
              <div style={styles.crtOverlay} />
              <div style={styles.crtScanline} />
              <div style={styles.crtFlicker} />
            </>
          )}

          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>Authentication Required</h1>

            <p style={styles.instructions}>
              Please sign in to access the staff dashboard.
            </p>

            <button
              style={styles.printButton}
              onClick={() => navigateTo("staff-login")}
            >
              Go To Login
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.page}>

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}

        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

        <button
          style={styles.backButton}
          onClick={() => navigateTo("home")}
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

          {/* Dashboard Buttons */}
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
                navigateTo("visitor-search");
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
                navigateTo("home");
              }}
            >
              Logout
            </button>

            <button
              style={styles.printButton}
              onClick={handleBulkCheckout}
            >
              Bulk Checkout Active Visitors
            </button>

            <h3 style={styles.screenTitle}>Active Visitors</h3>

          </div>

          {/* Active Visitors List */}
          {activeVisitors.map((visitor) => (
            <div key={visitor.id} style={styles.resultCard}>

              {/* Container for columns */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr 140px",
                  alignItems: "start",
                }}
              >

                {/* Column 1 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "left",
                    alignItems: "center",
                  }}
                > 
                  {visitor.photo_path ? (
                    <img
                      src={getPhotoUrl(visitor.photo_path)}
                      alt="Visitor"
                      style={{
                        width: "164px",
                        height: "164px",
                        objectFit: "cover",
                        borderRadius: "10px",
                        border: "1px solid #d1d5db",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "10px",
                        border: "1px solid #d1d5db",
                        backgroundColor: "#f3f4f6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        color: "#6b7280",
                      }}
                    >
                      No Photo
                    </div>
                  )}
                </div>

                {/* End Column 1 */}

                {/* Column 2 */}
                <div
                  style={{
                      textAlign: "center",
                      marginTop: "10px",
                  }}
                >
                    <h2>
                      {visitor.first_name} {visitor.last_name}
                    </h2>

                    <p>{visitor.visitor_type}</p>

                    <p style={{ marginBottom: "12px" }}>
                      Checked in:{" "}
                      {new Date(visitor.check_in_time).toLocaleString()}
                      
                    </p>

                    <button
                      style={styles.staffActionButton}
                      onClick={() => handleVisitorSelect(visitor.id)}
                    >
                      View Details
                    </button>
                </div>
                {/* End Column 2 */}

                {/* Column 3 */}
                <div>
                  <span
                    style={{
                      backgroundColor: visitor.check_out_time
                        ? "#6b7280"
                        : "#16a34a",
                      color: "#ffffff",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      textAlign: "right",
                      marginBottom: "12px",
                    }}
                  >
                    {visitor.check_out_time
                      ? "CHECKED OUT"
                      : "ACTIVE"}
                  </span>

                  <p style={{ marginTop: "12px", marginBottom: "12px" }}>
                    Visitor ID: {visitor.id}
                  </p>
                </div>
                {/* End Column 3 */}

              </div>

              {/* End container for columns */}
              </div>
          ))}
        </div>
      </div>
    );
  }

  // Visitor Search Screen
  if (screen === "visitor-search") {
    return (
      <div style={styles.page}>

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}


        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

        <button
          style={styles.backButton}
          onClick={() => navigateTo("staff")}
        >
          ← Staff Dashboard
        </button>

        {/* Styles.formContainer */}
        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>
            Search Visitors
          </h1>

          {searchResults.length > 0 && (
            <p style={styles.instructions}>
              {searchResults.length} visitor(s) found
            </p>
          )}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Search for visitors by any Name, Contact, Email, Phone, or Vehicle
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
            <div key={visitor.id} style={styles.resultCard}>

              {/* Container for columns */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr 140px",
                  alignItems: "start",
                }}
              >

                {/* Column 1 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "left",
                    alignItems: "center",
                  }}
                > 
                  {visitor.photo_path ? (
                    <img
                      src={getPhotoUrl(visitor.photo_path)}
                      alt="Visitor"
                      style={{
                        width: "164px",
                        height: "164px",
                        objectFit: "cover",
                        borderRadius: "10px",
                        border: "1px solid #d1d5db",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "10px",
                        border: "1px solid #d1d5db",
                        backgroundColor: "#f3f4f6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        color: "#6b7280",
                      }}
                    >
                      No Photo
                    </div>
                  )}
                </div>

                {/* End Column 1 */}

                {/* Column 2 */}
                <div
                  style={{
                      textAlign: "center",
                      marginTop: "10px",
                  }}
                >
                    <h2>
                      {visitor.first_name} {visitor.last_name}
                    </h2>

                    <p>{visitor.visitor_type}</p>

                    <p style={{ marginBottom: "12px" }}>
                      Checked in:{" "}
                      {new Date(visitor.check_in_time).toLocaleString()}
                      
                    </p>

                    <button
                      style={styles.staffActionButton}
                      onClick={() => handleVisitorSelect(visitor.id)}
                    >
                      View Details
                    </button>
                </div>
                {/* End Column 2 */}

                {/* Column 3 */}
                <div>
                  <span
                    style={{
                      backgroundColor: visitor.check_out_time
                        ? "#6b7280"
                        : "#16a34a",
                      color: "#ffffff",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "0.8rem",
                      fontWeight: "bold",
                      textAlign: "right",
                      marginBottom: "12px",
                    }}
                  >
                    {visitor.check_out_time
                      ? "CHECKED OUT"
                      : "ACTIVE"}
                  </span>

                  <p style={{ marginTop: "12px", marginBottom: "12px" }}>
                    Visitor ID: {visitor.id}
                  </p>
                </div>
                {/* End Column 3 */}

              </div>

              {/* End container for columns */}
              </div>
          ))}
        </div>
        {/* End styles.formContainer */}

      </div>
    );
  }

  // Visitor Details Screen
  if (screen === "visitor-detail") {
    return (
      <div style={styles.page}>

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}

        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

        <button
          style={styles.backButton}
          onClick={() => navigateTo("staff")}
        >
          ← Staff Dashboard
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
              {selectedVisitor.first_name} {selectedVisitor.last_name}
            </h2>

            <div
              style={{
                display: "inline-block",
                backgroundColor: selectedVisitor.check_out_time
                  ? "#6b7280"
                  : "#16a34a",
                color: "#ffffff",
                padding: "6px 12px",
                borderRadius: "999px",
                fontWeight: "bold",
                marginBottom: "12px",
              }}
            >
              {selectedVisitor.check_out_time
                ? "CHECKED OUT"
                : "CURRENTLY CHECKED IN"}
            </div>

            <h3 style={{ marginTop: "24px" }}>
              Visitor Summary
            </h3>


            <div style={styles.fieldGroup_oneColumn}>
              <p>
                <strong>Visit Count:</strong> {visitCount}
              </p>

              <p>
                <strong>Checked In:</strong>{" "}
                {new Date(
                  selectedVisitor.check_in_time
                ).toLocaleString()}
              </p>

              {selectedVisitor.check_out_time && (
                <p>
                  <strong>Checked Out:</strong>{" "}
                  {new Date(
                    selectedVisitor.check_out_time
                  ).toLocaleString()}
                </p>
              )}
            </div>

            {/* Visitor Details Grid */}
            <div style={styles.grid_details_readonly}>

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
                <strong>Vehicle License Plate:</strong>{" "}
                {selectedVisitor.vehicle_plate}
              </p>
              
              <p>
                <strong>Phone:</strong>{" "}
                {selectedVisitor.phone}
              </p>

              <p>
                <strong>Email:</strong>{" "}
                {selectedVisitor.email}
              </p>

              {/* Notes Field - single column */}
              <div style={styles.fieldGroup_oneColumn}>
                <p> <strong>Notes:</strong>{""} </p>
                <p> {selectedVisitor.notes} </p>
              </div>

            </div>


            <h3 style={{ marginTop: "48px" }}>
              Update Visitor Details
            </h3>

            <div style={styles.grid_details}>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>First Name</label>
                <input
                  style={styles.input_details}
                  value={selectedVisitor.first_name || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      first_name: e.target.value,
                    })
                  }
                />
              </div>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>Last Name</label>
                <input
                  style={styles.input_details}
                  value={selectedVisitor.last_name || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      last_name: e.target.value,
                    })
                  }
                />
              </div>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>Visitor Type</label>
                            <select
                  style={styles.input_details}
                  value={selectedVisitor.visitor_type || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      visitor_type: e.target.value,
                    })
                  }
                >
                  {VISITOR_TYPES.map((visitorTypeOption) => (
                    <option key={visitorTypeOption} value={visitorTypeOption}>
                      {visitorTypeOption}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>Purpose</label>
                            <select
                  style={styles.input_details}
                  value={selectedVisitor.purpose || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      purpose: e.target.value,
                    })
                  }
                >
                  {VISIT_PURPOSES.map((visitPurposeOption) => (
                    <option key={visitPurposeOption} value={visitPurposeOption}>
                      {visitPurposeOption}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>Contact</label>
                <input
                  style={styles.input_details}
                  value={selectedVisitor.host_name || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      host_name: e.target.value,
                    })
                  }
                />
              </div>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>Vehicle Plate</label>
                <input
                  style={styles.input_details}
                  value={selectedVisitor.vehicle_plate || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      vehicle_plate: e.target.value,
                    })
                  }
                />
              </div>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>Phone</label>
                <input
                  style={styles.input_details}
                  value={selectedVisitor.phone || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      phone: e.target.value,
                    })
                  }
                />
              </div>

              <div style={styles.fieldGroup_details}>
                <label style={styles.label_details}>Email</label>
                <input
                  style={styles.input_details}
                  value={selectedVisitor.email || ""}
                  onChange={(e) =>
                    setSelectedVisitor({
                      ...selectedVisitor,
                      email: e.target.value,
                    })
                  }
                />
              </div>



              {/* Notes Field */}
              <div style={styles.fieldGroup_oneColumn}>
                <label style={styles.label_details}>Notes:</label>
                    <textarea
                      style={styles.input_notes}
                      value={selectedVisitor.notes || ""}
                      onChange={(e) => setSelectedVisitor({ ...selectedVisitor, notes: e.target.value })}
                    />
              </div>

            </div>

            {/* UPDATE VISITOR DETAILS button saves changes to visitor details */}
            <p>
              <button
                style={styles.staffActionButton}
                onClick={() => handleUpdateVisitorDetails(selectedVisitor)}
              >
                Update Visitor Details
              </button>
            </p>

            <h3 style={{ marginTop: "24px" }}>
              Visit History
            </h3>

            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                border: "1px solid #d1d5db",
                borderRadius: "12px",
                padding: "12px",
                marginTop: "8px",
              }}
            >
              {visitorHistory.map((visit) => (
                <div
                  key={visit.id}
                  style={{
                    borderBottom: "1px solid #e5e7eb",
                    paddingBottom: "8px",
                    marginBottom: "8px",
                  }}
                >
                  <div>
                    <strong>
                      {new Date(
                        visit.check_in_time
                      ).toLocaleString()}
                    </strong>
                  </div>

                  <div
                    style={{
                      color: visit.check_out_time
                        ? "#6b7280"
                        : "#16a34a",
                      fontWeight: "bold",
                    }}
                  >
                    {visit.check_out_time
                      ? "Checked Out"
                      : "ACTIVE"}
                  </div>
                </div>
              ))}

              {visitorHistory.length === 0 && (
                <p>No visit history found.</p>
              )}
            </div>
          </div>

          <div style={styles.dashboardButtonRow}>

            {/* Reprint Button */}
            <button
              style={styles.staffActionButton}
              onClick={() =>
                handleReprintBadge(selectedVisitor.id)
              }
            >
              Reprint Badge
            </button>
            {/* End Reprint Button */} 

            {/* Conditional Checkout or Check-In Again button based on visitor's check-out status */}
            {selectedVisitor.check_out_time ? (
              <button
                style={styles.staffActionButton}
                onClick={() => handleCheckInAgain(selectedVisitor)}
              >
                Check In Again
              </button>
            ) : (
              <button
                style={styles.staffActionButton}
                onClick={() => handleVisitorCheckout(selectedVisitor.id)}
              >
                Check Out
              </button>
            )}
            {/* End Conditional Checkout or Check-In Again button based on visitor's check-out status */}

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

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}


        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

        <button
          style={styles.backButton}
          onClick={() => navigateTo("visitor-detail")}
        >
          ← Visitor Details
        </button>

        <div style={styles.formContainer}>
          <h1 style={styles.formTitle}>Returning Visitor Check-In</h1>

          <p style={styles.instructions}>
            Review visitor information and make updates before printing a new badge.
          </p>

          <div style={styles.contentContainer}>


            {/* Data Column */}
            <div style={styles.formColumn}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>First Name</label>
                  <input
                      style={styles.input}
                      value={returningVisitor.first_name}
                      onChange={(event) => setReturningVisitor({...returningVisitor, first_name: event.target.value})}
                  />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Last Name</label>
                <input
                    style={styles.input}
                    value={returningVisitor.last_name}
                    onChange={(event) => setReturningVisitor({...returningVisitor, last_name: event.target.value})}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Camper or Contact Name</label>
                <input
                    style={styles.input}
                    value={returningVisitor.host_name}
                    onChange={(event) => setReturningVisitor({...returningVisitor, host_name: event.target.value})}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Visitor Type</label>
                <select
                    style={styles.input}
                    value={visitorType}
                    onChange={(event) => setVisitorType(event.target.value)}
                >
                  {VISITOR_TYPES.map((visitorTypeOption) => (
                    <option key={visitorTypeOption} value={visitorTypeOption}>
                      {visitorTypeOption}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Purpose</label>
                <select
                    style={styles.input}
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                >
                  {VISIT_PURPOSES.map((purposeOption) => (
                    <option key={purposeOption} value={purposeOption}>
                      {purposeOption}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Vehicle License Plate</label>
                <input
                  style={styles.input}
                  value={returningVisitor.vehicle_plate}
                  onChange={(event) =>
                    setReturningVisitor({...returningVisitor, vehicle_plate: event.target.value.toUpperCase()})
                  }
                />
              </div>   

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Phone</label>
                <input
                  style={styles.input}
                  value={returningVisitor.phone}
                  onChange={(event) =>
                    setReturningVisitor({...returningVisitor, phone: event.target.value})
                  }
                />
              </div>   

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Email</label>
                <input
                  style={styles.input}
                  value={returningVisitor.email}
                  onChange={(event) =>
                    setReturningVisitor({...returningVisitor, email: event.target.value}  )
                  }
                />
              </div>
            </div>

            {/* Photo Column */}
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

              <p
                style={{
                  marginTop: 8,
                  marginBottom: 12,
                }}
              >
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
              </p>
            </div>
          </div>

          <div style={styles.dashboardButtonRow}>
            <button
              style={styles.staffActionButton}
              onClick={handleCheckInReturningVisitor}
              disabled={checkedInVisitorId || busy}
            >
              {busy ? "Checking In..." 
                : checkedInVisitorId 
                  ? "Visitor Checked In" 
                  : "Check In Visitor"
              }
            </button>

            <button
              style={styles.staffActionButton}
              onClick={handlePrintReturningBadge}
              disabled={!checkedInVisitorId || busy}
            >
              {busy ? "Printing..." : "Print Visitor Badge"}

            </button>
          </div>

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

  // Staff Login Screen
  if (screen === "staff-login") {
    return (
      <div style={styles.page}>

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}

        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

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

        {/* Theme Overlay */}
        {theme.logoOverlay && (
          <img
            src={theme.logoOverlay}
            alt=""
            style={styles.themeOverlay}
          />
        )}

        {/* CRT Theme Effects */}
        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}
    
      <div style={styles.hero}>
        <h1 style={styles.title}>Palmetto Bible Camp</h1>
        <p style={styles.subtitle}>Visitor Kiosk</p>
      </div>

      <div style={styles.cardContainer}>
        <button
          style={styles.primaryCard}
          onClick={() => navigateTo("checkin")}
        >
          Check In
        </button>

        <button
          style={styles.secondaryCard}
          onClick={() => navigateTo("checkout")}
        >
          Check Out
        </button>
      </div>

      <button
        style={styles.staffButton}
        onClick={() => navigateTo("staff-login")}
      >
        Staff Login
      </button>

    </div>
  );

// End of App()
}





