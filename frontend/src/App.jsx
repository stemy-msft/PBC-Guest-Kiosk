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
} from "./api";

// Theme Definitions
const themes = {
  defaultLight: {
    background: "#f8fafc",
    placeholderBackground: "#e5e7eb",

    surface: "#ffffff",
    surfaceSecondary: "#f9fafb",

    textPrimary: "#111827",
    textSecondary: "#6b7280",

    primary: "#2563eb",
    primaryText: "#ffffff",

    success: "#16a34a",
    successText: "#ffffff",

    label: "#374151",

    neutral: "#6b7280",
    neutralText: "#ffffff",

    buttonColor: "#2563eb",
    buttonText: "#ffffff",

    border: "#d1d5db",

    fontFamily: "Inter, Arial, sans-serif",

    danger: "#dc2626",
    dangerText: "#ffffff",
  },
  defaultDark: {
    background: "#111827",
    placeholderBackground: "#374151",

    surface: "#1f2937",
    surfaceSecondary: "#2d3748",

    textPrimary: "#f9fafb",
    textSecondary: "#d1d5db",

    primary: "#3b82f6",
    primaryText: "#ffffff",

    success: "#22c55e",
    successText: "#ffffff",

    label: "#e5e7eb",

    neutral: "#6b7280",
    neutralText: "#ffffff",

    buttonColor: "#3b82f6",
    buttonText: "#ffffff",

    border: "#4b5563",

    fontFamily: "Inter, Arial, sans-serif",

    danger: "#ef4444",
    dangerText: "#ffffff",
  },  
  campGreen: {
    background: "#f4f8f2",
    placeholderBackground: "#dbe8d4",

    surface: "#ffffff",
    surfaceSecondary: "#f7faf5",

    textPrimary: "#1f2937",
    textSecondary: "#4b5563",

    primary: "#2f855a",
    primaryText: "#ffffff",

    success: "#38a169",
    successText: "#ffffff",

    label: "#2d3748",

    neutral: "#718096",
    neutralText: "#ffffff",

    buttonColor: "#2f855a",
    buttonText: "#ffffff",

    border: "#cbd5c0",

    fontFamily: "Inter, Arial, sans-serif",

    danger: "#e53e3e",
    dangerText: "#ffffff",
  },  
  lakeBlue: {
    background: "#eef7fb",
    placeholderBackground: "#dbeaf2",

    surface: "#ffffff",
    surfaceSecondary: "#f5fbfe",

    textPrimary: "#1e293b",
    textSecondary: "#64748b",

    primary: "#0284c7",
    primaryText: "#ffffff",

    success: "#0891b2",
    successText: "#ffffff",

    label: "#334155",

    neutral: "#64748b",
    neutralText: "#ffffff",

    buttonColor: "#0284c7",
    buttonText: "#ffffff",

    border: "#cbd5e1",

    fontFamily: "Inter, Arial, sans-serif",

    danger: "#dc2626",
    dangerText: "#ffffff",
  },
  darkCampfire: {
    background: "#111827",
    placeholderBackground: "#374151",

    surface: "#1f2937",
    surfaceSecondary: "#2d3748",

    textPrimary: "#f9fafb",
    textSecondary: "#d1d5db",

    primary: "#f59e0b",
    primaryText: "#111827",

    success: "#22c55e",
    successText: "#ffffff",

    label: "#e5e7eb",

    neutral: "#6b7280",
    neutralText: "#ffffff",

    buttonColor: "#f59e0b",
    buttonText: "#111827",

    border: "#4b5563",

    fontFamily: "Inter, Arial, sans-serif",

    danger: "#ef4444",
    dangerText: "#ffffff",
  },
  retroTerminal: {
    background: "#0d1117",
    placeholderBackground: "#161b22",

    surface: "#161b22",
    surfaceSecondary: "#21262d",

    textPrimary: "#58ff8a",
    textSecondary: "#8b949e",

    primary: "#39ff14",
    primaryText: "#000000",

    success: "#00ff9d",
    successText: "#000000",

    label: "#58ff8a",

    neutral: "#6e7681",
    neutralText: "#ffffff",

    buttonColor: "#39ff14",
    buttonText: "#000000",

    border: "#30363d",

    fontFamily: "Consolas, monospace",

    danger: "#ff4d4d",
    dangerText: "#ffffff",
  },
  amberTerminal: {
    background: "#120d05",
    placeholderBackground: "#2a1c08",

    surface: "#1a1206",
    surfaceSecondary: "#241807",

    textPrimary: "#ffbf47",
    textSecondary: "#d6a04a",

    primary: "#ffb000",
    primaryText: "#1a1206",

    success: "#f59e0b",
    successText: "#1a1206",

    label: "#ffc857",

    neutral: "#8b6a32",
    neutralText: "#ffffff",

    buttonColor: "#ffb000",
    buttonText: "#1a1206",

    border: "#664400",

    fontFamily: "Courier New, monospace",

    danger: "#ff6b35",
    dangerText: "#ffffff",
  },
  clemsonTigers: {
    background: "#fefaf5",
    placeholderBackground: "#f2e8dc",

    surface: "#ffffff",
    surfaceSecondary: "#f7f2fb",

    textPrimary: "#522d80",
    textSecondary: "#6b5b7a",

    primary: "#f56600",      // Clemson Orange
    primaryText: "#ffffff",

    success: "#522d80",      // Regalia Purple
    successText: "#ffffff",

    label: "#522d80",

    neutral: "#8b7a9b",
    neutralText: "#ffffff",

    buttonColor: "#f56600",
    buttonText: "#ffffff",

    border: "#d9cfc3",

    fontFamily: "Inter, Arial, sans-serif",

    danger: "#c2410c",
    dangerText: "#ffffff",

    logoOverlay: "/themes/clemson-paw.png",
  },


};

// Change this to switch themes
const theme = themes.campGreen; 

// This will set the logo overlay for the theme if it exists

// This will add some retro feel to CRT themes
const isCrtTheme =
  theme === themes.retroTerminal ||
  theme === themes.amberTerminal;



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
    host_name: "",
    vehicle_plate: "",
    phone: "",
    email: "",
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
      setActiveVisitors(visitors);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  function navigateTo(screenName) {
    setScreenHistory((previous) => [...previous, screen]);
    setScreen(screenName);
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
    setReturningVisitor({
      first_name: visitor.first_name,
      last_name: visitor.last_name,
      visitor_type: visitor.visitor_type,
      purpose: visitor.purpose,
      host_name: visitor.host_name,
      vehicle_plate: visitor.vehicle_plate,
      phone: visitor.phone,
      email: visitor.email,
      notes: visitor.notes,
    });

    setReturningPhotoFile(null);

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
                  onClick={() => handleVisitorSelect(visitor.id)}
                >
                  View Details
                </button>

                <button
                  style={styles.staffActionButton}
                  onClick={() => handleVisitorCheckout(visitor.id)}
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
                      Last Visit:{" "}
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

  // Visitor Details
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

            <p>
              <strong>Visit Count:</strong> {visitCount}
            </p>

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
                    value={returningVisitor.visitor_type}
                    onChange={(event) => setReturningVisitor({...returningVisitor, visitor_type: event.target.value})}
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
                    onChange={(event) => setReturningVisitor({...returningVisitor, purpose: event.target.value})}
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

  // Staff Login
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


// Styles
const styles = {
  backButton: {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    color: theme.textPrimary,
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
    left: "20px",
    minWidth: "120px",
    padding: "16px 24px",
    position: "fixed",
    top: "20px",
    index: 1000,
  },

  cardContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "24px",
    justifyContent: "center",
  },

  checkinContentContainer: {
    alignItems: "flex-start",
    display: "flex",
    gap: "40px",
    justifyContent: "space-between",
    width: "100%",
  },

  contentContainer: {
    alignItems: "center",
    display: "flex",
    gap: "40px",
    justifyContent: "space-between",
    width: "100%",
  },  

  crtFlicker: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    background: "rgba(255,191,71,0.04)",
    zIndex: 9997,
    animation: "flicker 0.25s infinite",
  },

  crtOverlay: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    backgroundImage:
      "repeating-linear-gradient(to bottom, rgba(255,191,71,0.08) 0px, rgba(255,191,71,0.08) 1px, transparent 2px, transparent 4px)",
    zIndex: 9998,
  },

  crtScanline: {
    position: "fixed",
    top: "-20px",
    left: 0,
    right: 0,
    height: "2px",
    background: "rgba(255,191,71,0.15)",
    boxShadow: "0 0 8px rgba(255,191,71,0.4)",
    pointerEvents: "none",
    zIndex: 9999,
    animation: "scanline 8s linear infinite, flicker 0.15s infinite",
  },

  dashboardButtonRow: {
    display: "flex",
    gap: "16px",
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: "24px",
  },

  detailName: {
    color: theme.textPrimary,
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
    backgroundColor: theme.surface,
    borderRadius: "24px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    maxWidth: "900px",
    padding: "40px",
    width: "100%",
  },

  formTitle: {
    color: theme.textPrimary,
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
    backgroundColor: theme.surfaceSecondary,
    border: `1px solid ${theme.border}`,
    borderRadius: "14px",
    color: theme.textPrimary,
    fontSize: "1.2rem",
    height: "64px",
    padding: "0 20px",
    caretColor: theme.textPrimary,
  },

  instructions: {
    color: theme.textSecondary,
    fontSize: "1rem",
    marginBottom: "32px",
    marginTop: "0px",
    textAlign: "center",
  },

  label: {
    color: theme.label,
    fontSize: "1rem",
    fontWeight: 600,
    marginBottom: "8px",
  },

  page: {
    alignItems: "center",
    background: theme.background,
    color: theme.textPrimary,
    textShadow:
      isCrtTheme
        ? "0 0 4px rgba(255,191,71,0.5)"
        : "none",
    display: "flex",
    flexDirection: "column",
    fontFamily: theme.fontFamily,
    justifyContent: "center",
    minHeight: "100vh",
    padding: "40px",
  },

  photoButton: {
    backgroundColor: theme.primary,
    border: "none",
    borderRadius: "16px",
    color: theme.primaryText,
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
    backgroundColor: theme.placeholderBackground,
    borderRadius: "18px",
    color: theme.textSecondary,
    display: "flex",
    fontSize: "1.2rem",
    height: "500px",
    justifyContent: "center",
    width: "420px",
  },

  primaryCard: {
    background: theme.primary,
    border: "none",
    borderRadius: "24px",
    color: theme.primaryText,
    cursor: "pointer",
    fontSize: "2rem",
    fontWeight: 700,
    height: "180px",
    width: "320px",
  },

  printButton: {
    width: "100%",
    backgroundColor: theme.primary,
    border: "none",
    borderRadius: "16px",
    color: theme.buttonText,
    cursor: "pointer",
    fontSize: "2rem",
    fontWeight: 700,
    height: "90px",
    marginTop: "24px",
  },

  resultCard: {
    backgroundColor: theme.surfaceSecondary,
    border: `1px solid ${theme.border}`,
    borderRadius: "16px",
    marginTop: "16px",
    padding: "20px",
  },

  screenTitle: {
    color: theme.textPrimary,
    fontSize: "3rem",
  },

  secondaryCard: {
    background: theme.success,
    border: "none",
    borderRadius: "24px",
    color: theme.successText,
    cursor: "pointer",
    fontSize: "2rem",
    fontWeight: 700,
    height: "180px",
    width: "320px",
  },

  staffActionButton: {
    backgroundColor: theme.primary,
    border: "none",
    borderRadius: "16px",
    color: theme.buttonText,
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
    color: theme.textSecondary,
    cursor: "pointer",
    fontSize: "1rem",
    marginTop: "40px",
  },

  subtitle: {
    color: theme.textSecondary,
    fontSize: "1.4rem",
    fontWeight: 400,
    letterSpacing: "0.02em",
    margin: 0,
  },

  themeOverlay: {
    position: "fixed",
    inset: 0,
    width: "100vw",
    height: "100vh",
    objectFit: "contain",
    opacity: 0.15,
    pointerEvents: "none",
    zIndex: 1,
  },

  title: {
    color: theme.textPrimary,
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
    border: `1px solid ${theme.border}`,
    marginBottom: "20px",
    backgroundColor: theme.placeholderBackground,
  }, 
};





