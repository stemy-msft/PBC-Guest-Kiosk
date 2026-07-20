import { useEffect, useRef, useState } from "react";
import {
  bulkCheckout,
  checkInAgain,
  checkoutVisitor,
  clearCompletedPrintJobs,
  clearFailedPrintJobs,
  createPrintJob,
  createPrintStation,
  createVisitor,
  deletePrintJob,
  disablePrintStation,
  findVisitors,
  generateBadge,
  getPrintAgents,
  getPrintJobs,
  getPrintStations,
  getPendingPrintJobs,
  getUsers,
  getUser,
  createUser,
  updateUser,
  resetPassword,
  updateUserStatus,
  getActiveVisitors,
  getVisitorHistory,
  getVisitor,
  login,
  searchVisitors,
  updatePrintStation,
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

// Temp const for setting up Print Station code



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
  const [editingPrintStation, setEditingPrintStation] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastName, setLastName] = useState("");
  const [newPrintStation, setNewPrintStation] = useState({
    name: "",
    slug: "",
    print_server_host: "",
    enabled: true,
  });
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    display_name: "",
    email: "",
    role: "CheckInStaff",
  });
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const PRINT_STATION = getPrintStationSlug();
  const [printStations, setPrintStations] = useState([]);
  const [printJobs, setPrintJobs] = useState([]);
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
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showPrintStationModal, setShowPrintStationModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successTitle, setSuccessTitle] = useState("");
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("");
  const [videoDevices, setVideoDevices] = useState([]);
  const videoRef = useRef(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [visitCount, setVisitCount] = useState(0);
  const [visitorHistory, setVisitorHistory] = useState([]);
  const [visitorType, setVisitorType] = useState("Parent");


  const [printAgents, setPrintAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showAssignAgentModal, setShowAssignAgentModal] = useState(false);
  



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

  // Print queue screen refresh every 5 seconds    
  useEffect(() => {
    if (screen !== "print-queue" || !isAuthenticated) {
      return;
    }

    console.log("Starting print queue auto refresh");

    loadPrintJobs();

    const interval = setInterval(() => {
      loadPrintJobs();
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

  // Load when the screen changes to "users" or "print-jobs" or "print-stations" or "print-agents"
useEffect(() => {
  if (screen === "users") {
    loadUsers();
  }
  if (screen === "print-jobs") {
    loadPrintJobs();
  }
  if (screen === "print-stations") {
    loadPrintStations();
  }
  if (screen === "print-agents") {
    loadPrintAgents();
  }
}, [screen]);



    
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

  async function handleCreateUser() {
    try {
      await createUser(newUser);

      setShowCreateUser(false);

      setNewUser({
        username: "",
        password: "",
        display_name: "",
        email: "",
        role: "CheckInStaff",
      });

      await loadUsers();
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

  async function handleResetPassword(user) {
    const newPassword = prompt(
      `Enter temporary password for ${user.username}`
    );

    if (!newPassword) {
      return;
    }

    try {
      await resetPassword(user.id, newPassword);

      alert("Password reset successfully.");
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

  async function loadPrintStations() {
    try {
      const data = await getPrintStations();
      setPrintStations(data);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function loadUsers() {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleToggleUser(user) {
    try {
      await updateUserStatus(user.id, !user.enabled);
      await loadUsers();
    } catch (error) {
      console.error(error);
      alert(error.message);
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

  async function handleClearCompletedJobs() {
    const confirmed = window.confirm(
      "Delete all completed print jobs?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await clearCompletedPrintJobs();

      await loadPrintJobs();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleClearFailedJobs() {
    const confirmed = window.confirm(
      "Delete all failed print jobs?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await clearFailedPrintJobs();

      await loadPrintJobs();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }


  async function handleDeletePrintJob(jobId) {
    const confirmed = window.confirm(
      `Delete Print Job #${job}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deletePrintJob(job.id);

      // Immediately reload the queue
      await loadPrintJobs();

    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleReprintJob(job) {
    try {
      await createPrintJob(job.visitor_id, PRINT_STATION);
      await loadPrintJobs();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }  

  async function handleReprintBadge(visitorId) {
    try {
      await createPrintJob(visitorId, PRINT_STATION);

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
      await createPrintJob(checkedInVisitorId, PRINT_STATION);

      alert("Badge sent to printer.");

    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  function isStationOnline(station) {
    if (!station.last_seen) {
      return false;
    }

    const ageSeconds =
      (Date.now() - new Date(station.last_seen).getTime()) / 1000;

    return ageSeconds < 60;
  }

  async function loadPrintAgents() {
    try {
      const data = await getPrintAgents();
      setPrintAgents(data);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function loadPrintJobs() {
    try {
      const jobs = await getPrintJobs();
      setPrintJobs(jobs);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function queuePrintJob(visitorId) {
    return await createPrintJob(visitorId, PRINT_STATION);
  }  

  function getPrintStationSlug() {
    const params = new URLSearchParams(window.location.search);

    return params.get("station") || "dining-hall";
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

      await createPrintJob(visitor.id, PRINT_STATION);

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

      await createPrintJob(visitor.id, PRINT_STATION);

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
    }, 300);
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


  // Administration Screen
  if (screen === "administration") {
    return (
      

      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("staff")}
        >
          ← Staff Dashboard
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "1400px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <h1
            style={{
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Administration
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            <div style={styles.resultCard}>
              <h2>User Administration</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                Manage user accounts, permissions, and passwords.
              </p>

              <button
                style={styles.staffActionButton}
                onClick={() => setScreen("users")}
              >
                User Management
              </button>
            </div>

            <div style={styles.resultCard}>
              <h2>Print Stations</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                Configure print stations and printer routing.
              </p>

              <button
                style={styles.staffActionButton}
                onClick={() => setScreen("print-stations")}
              >
                Print Stations
              </button>
            </div>


<div style={styles.resultCard}>
  <h2>Print Agents</h2>

  <p
    style={{
      marginBottom: "16px",
      color: theme.textSecondary,
    }}
  >
    Manage registered print servers and station assignments.
  </p>

  <button
    style={styles.staffActionButton}
    onClick={async () => {
      await loadPrintAgents();
      setScreen("print-agents");
    }}
  >
    Print Agents
  </button>
</div>



            <div style={styles.resultCard}>
              <h2>System Settings</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                View application configuration and runtime settings.
              </p>

              <button
                style={styles.staffActionButton}
                onClick={() => setScreen("settings")}
              >
                Open Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

// Print Agents Screen
if (screen === "print-agents") {
  return (
    <div style={styles.page}>
      <button
        style={styles.backButton}
        onClick={() => setScreen("administration")}
      >
        ← Administration
      </button>

      <div
        style={{
          width: "100%",
          maxWidth: "1400px",
          margin: "0 auto",
          paddingTop: "80px",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            marginBottom: "24px",
          }}
        >
          Print Agents
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(400px, 1fr))",
            gap: "20px",
          }}
        >
          {printAgents.map((agent) => (
            <div
              key={agent.id}
              style={{
                backgroundColor: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: "16px",
                padding: "20px",
              }}
            >
              <h3>{agent.hostname}</h3>

              <div>
                <strong>Printer:</strong>{" "}
                {agent.printer_name || "Unknown"}
              </div>

              <div>
                <strong>IP Address:</strong>{" "}
                {agent.last_ip || "Unknown"}
              </div>

              <div>
                <strong>Version:</strong>{" "}
                {agent.agent_version || "Unknown"}
              </div>

              <div>
                <strong>Assigned Station:</strong>{" "}
                {agent.station_name || "UNASSIGNED"}
              </div>

              <div>
                <strong>Last Seen:</strong>{" "}
                {agent.last_seen
                  ? new Date(agent.last_seen).toLocaleString()
                  : "Never"}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "16px",
                }}
              >
                <button
                  style={styles.staffActionButton}
                  onClick={() => {
                    setSelectedAgent(agent);
                    setShowAssignAgentModal(true);
                  }}
                >
                  Assign Station
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

  // Print Queue Screen
  if (screen === "print-queue") {
    
    const pendingJobs = printJobs.filter(
      (job) => job.status === "Pending"
    ).length;

    const printingJobs = printJobs.filter(
      (job) => job.status === "Printing"
    ).length;

    const completedJobs = printJobs.filter(
      (job) => job.status === "Completed"
    ).length;

    const failedJobs = printJobs.filter(
      (job) => job.status === "Failed"
    ).length;    
    
    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("staff")}
        >
          ← Staff Dashboard
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "1400px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <h1
            style={{
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Print Queue
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
          
            <div style={styles.userStats}>
              <h2>{pendingJobs}</h2>
              <p>Pending</p>
            </div>

            <div style={styles.userStats}>
              <h2>{printingJobs}</h2>
              <p>Printing</p>
            </div>

            <div style={styles.userStats}>
              <h2>{completedJobs}</h2>
              <p>Completed</p>
            </div>

            <div style={styles.userStats}>
              <h2>{failedJobs}</h2>
              <p>Failed</p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <button
              style={styles.staffActionButton}
              onClick={loadPrintJobs}
            >
              Refresh
            </button>

            <button
              style={styles.staffActionButton}
              onClick={handleClearCompletedJobs}
            >
              Clear Completed Jobs
            </button>

            <button
              style={styles.staffActionButton}
              onClick={handleClearFailedJobs}
            >
              Clear Failed Jobs
            </button>

          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(450px, 1fr))",
              gap: "20px",
            }}
          >
            {printJobs.map((job) => (
              <div
                key={job.id}
                style={{
                  backgroundColor: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "16px",
                  padding: "20px",
                }}
              >
                <h3>
                  {job.visitor_name}
                </h3>

                <p
                  style={{
                    color: theme.textSecondary,
                    marginBottom: "12px",
                  }}
                >
                  Print Job #{job.id}
                </p>

                <p>
                  <strong>Visitor:</strong> {job.visitor_name}
                </p>

                <p>
                  <strong>Visitor Type:</strong> {job.visitor_type}
                </p>

                <p>
                  <strong>Station:</strong>{" "}
                  {job.station_name || "Unknown"}
                </p>

                <div style={{ marginBottom: "8px" }}>
                  <strong>Status:</strong>{" "}
                  <span
                    style={{
                      color:
                        job.status === "Completed"
                          ? theme.success
                          : job.status === "Failed"
                          ? theme.danger
                          : theme.primary,
                      fontWeight: "bold",
                    }}
                  >
                    {job.status}
                  </span>
                </div>

                <div style={{ marginBottom: "8px" }}>
                  <strong>Printer:</strong>{" "}
                  {job.printer_name || "Unknown"}
                </div>

                <p>
                  <strong>Created:</strong>{" "}
                  {new Date(job.created_time).toLocaleString()}
                </p>

                {job.completed_date && (
                  <p>
                    <strong>Completed:</strong>{" "}
                    {new Date(job.completed_date).toLocaleString()}
                  </p>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "16px",
                  }}
                >
                  <button
                    style={styles.staffActionButton}
                    onClick={() => handleVisitorSelect(job.visitor_id)}
                  >
                    View Visitor
                  </button>

                  <button
                    style={styles.staffActionButton}
                    onClick={() => handleReprintJob(job)}
                  >
                    Reprint Badge
                  </button>

                  <button
                    style={styles.staffActionButton}
                    onClick={() => handleDeletePrintJob(job.id)}
                  >
                    Delete Job
                  </button>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Print Stations Screen
  if (screen === "print-stations") {

    const enabledStations = printStations.filter(
      (station) => station.enabled
    ).length;

    const disabledStations = printStations.filter(
      (station) => !station.enabled
    ).length;

    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("administration")}
        >
          ← Administration
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "1400px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <h1
            style={{
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Print Stations
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={styles.userStats}>
              <h2>{printStations.length}</h2>
              <p>Total Stations</p>
            </div>

            <div style={styles.userStats}>
              <h2>{enabledStations}</h2>
              <p>Enabled</p>
            </div>

            <div style={styles.userStats}>
              <h2>{disabledStations}</h2>
              <p>Disabled</p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              marginBottom: "24px",
            }}
          >
            <button
              style={styles.staffActionButton}
              onClick={loadPrintStations}
            >
              Refresh
            </button>

            <button
              style={styles.staffActionButton}
              onClick={() => {
                setEditingPrintStation(null);

                setNewPrintStation({
                  name: "",
                  slug: "",
                  print_server_host: "",
                  enabled: true,
                });

                setShowPrintStationModal(true);
              }}
            >
              Add Print Station
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
              gap: "20px",
            }}
          >
            {printStations.map((station) => (
              <div
                key={station.id}
                style={{
                  backgroundColor: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "16px",
                  padding: "20px",
                }}
              >
                <h3>{station.name}</h3>

                <div style={{ marginBottom: "6px" }}>
                  <strong>Status:</strong>{" "}
                  <span
                    style={{
                      color: isStationOnline(station)
                        ? theme.success
                        : theme.danger,
                      fontWeight: "bold",
                    }}
                  >
                    {isStationOnline(station)
                      ? "ONLINE"
                      : "OFFLINE"}
                  </span>
                </div>

                <p>
                  <strong>Slug:</strong> {station.slug}
                </p>

                <div style={{ marginBottom: "6px" }}>
                  <strong>Print Host:</strong>{" "}
                  {station.print_server_host || "Not Configured"}
                </div>

                <div style={{ marginBottom: "6px" }}>
                  <strong>IP Address:</strong>{" "}
                  {station.last_ip || "Unknown"}
                </div>

                <div style={{ marginBottom: "6px" }}>
                  <strong>Agent Version:</strong>{" "}
                  {station.agent_version || "Unknown"}
                </div>

                <div style={{ marginBottom: "6px" }}>
                  <strong>Last Seen:</strong>{" "}
                  {station.last_seen
                    ? new Date(station.last_seen).toLocaleString()
                    : "Never"}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "16px",
                  }}
                >
                  <button
                    style={styles.staffActionButton}
                    onClick={() => {
                      setEditingPrintStation(station);

                      setNewPrintStation({
                        name: station.name || "",
                        slug: station.slug || "",
                        print_server_host: station.print_server_host || "",
                        enabled: station.enabled,
                      });

                      setShowPrintStationModal(true);
                    }}
                  >
                    Edit
                  </button>

                  <button
                    style={{
                      ...styles.staffActionButton,
                      backgroundColor: theme.danger,
                    }}
                    onClick={async () => {
                      const confirmed = window.confirm(
                        `Disable print station '${station.name}'?`
                      );

                      if (!confirmed) {
                        return;
                      }

                      try {
                        await disablePrintStation(station.id);
                        await loadPrintStations();
                      } catch (error) {
                        console.error(error);
                        alert(error.message);
                      }
                    }}
                  >
                    Disable
                  </button>
                </div>
                
              </div>
            ))}
          </div>

          {showPrintStationModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  backgroundColor: theme.surface,
                  color: theme.textPrimary,
                  borderRadius: "16px",
                  padding: "24px",
                  width: "600px",
                  maxWidth: "90%",
                }}
              >
                <h2>
                  {editingPrintStation
                    ? "Edit Print Station"
                    : "Create Print Station"}
                </h2>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>
                    Station Name
                  </label>

                  <input
                    style={styles.input}
                    value={newPrintStation.name}
                    onChange={(e) =>
                      setNewPrintStation({
                        ...newPrintStation,
                        name: e.target.value,
                      })
                    }
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>
                    Station Slug
                  </label>

                  <input
                    style={styles.input}
                    value={newPrintStation.slug}
                    onChange={(e) =>
                      setNewPrintStation({
                        ...newPrintStation,
                        slug: e.target.value,
                      })
                    }
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>
                    Print Server Host
                  </label>

                  <input
                    style={styles.input}
                    value={newPrintStation.print_server_host}
                    onChange={(e) =>
                      setNewPrintStation({
                        ...newPrintStation,
                        print_server_host: e.target.value,
                      })
                    }
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>
                    Enabled
                  </label>

                  <select
                    style={styles.input}
                    value={newPrintStation.enabled ? "true" : "false"}
                    onChange={(e) =>
                      setNewPrintStation({
                        ...newPrintStation,
                        enabled: e.target.value === "true",
                      })
                    }
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    marginTop: "20px",
                  }}
                >
                  <button
                    style={styles.staffActionButton}
                    onClick={async () => {
                      try {
                        if (editingPrintStation) {
                          await updatePrintStation(
                            editingPrintStation.id,
                            newPrintStation
                          );
                        } else {
                          await createPrintStation(
                            newPrintStation
                          );
                        }

                        await loadPrintStations();

                        setShowPrintStationModal(false);
                        setEditingPrintStation(null);
                      } catch (error) {
                        console.error(error);
                        alert(error.message);
                      }
                    }}
                  >
                    Save
                  </button>

                  <button
                    style={styles.staffActionButton}
                    onClick={() => {
                      setShowPrintStationModal(false);
                      setEditingPrintStation(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

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

  // Settings Screen
  if (screen === "settings") {
    return (
      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("staff")}
        >
          ← Staff Dashboard
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "1400px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <h1
            style={{
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Settings
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))",
              gap: "20px",
            }}
          >

            <div style={styles.resultCard}>
              <h2>System</h2>

              <p
                style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
              >
                <strong>Theme Definitions:</strong> <code>frontend/src/constants/themes.js</code>
              </p>


              <p>
                <strong>Theme:</strong> Camp Green
              </p>

              <p>
                <strong>Auto Refresh:</strong> 5 Seconds
              </p>

              <p>
                <strong>Authentication:</strong> Database / JWT
              </p>
            </div>

            <div style={styles.resultCard}>
              <h2>Visitor Types</h2>

              <p
                style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
              >
                <strong>Source:</strong> <code>frontend/src/constants/options.js</code>
              </p>

              {VISITOR_TYPES.map((type) => (
                <div key={type}>
                  • {type}
                </div>
              ))}
            </div>

            <div style={styles.resultCard}>
              <h2>Visit Purposes</h2>

              <p
                style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
              >
                <strong>Source:</strong> <code>frontend/src/constants/options.js</code>
              </p>

              {VISIT_PURPOSES.map((purpose) => (
                <div key={purpose}>
                  • {purpose}
                </div>
              ))}
            </div>

            <div style={styles.resultCard}>
              <h2>Required Check-In Fields</h2>

              <p
                style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
              >
                <strong>Source:</strong> <code>frontend/src/constants/fields.js</code>
              </p>

              {REQUIRED_CHECKIN_FIELDS.map((field) => (
                <div key={field}>
                  • {field}
                </div>
              ))}
            </div>

            <div style={styles.resultCard}>
              <h2>Required Returning Visitor Fields</h2>

              <p
                style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
              >
                <strong>Source:</strong> <code>frontend/src/constants/fields.js</code>
              </p>

              {REQUIRED_RETURNING_CHECKIN_FIELDS.map((field) => (
                <div key={field}>
                  • {field}
                </div>
              ))}
            </div>

          </div>
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
              onClick={() => setScreen("visitor-search")}
            >
              Visitor Search
            </button>

            <button
              style={styles.staffActionButton}
              onClick={() => setScreen("print-queue")}
            >
              Print Queue
            </button>

            <button
              style={styles.staffActionButton}
              onClick={() => setScreen("administration")}
            >
              Administration
            </button>

            <button
              style={styles.staffActionButton}
              onClick={() => setScreen("settings")}
            >
              Settings
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

  // User Management Screen
  if (screen === "users") {

    const totalUsers = users.length;

    const enabledUsers = users.filter(
      (user) => user.enabled
    ).length;

    const disabledUsers = users.filter(
      (user) => !user.enabled
    ).length;

    const adminUsers = users.filter(
      (user) => user.role === "Administrator"
    ).length;  

    return (

      <div style={styles.page}>
        <button
          style={styles.backButton}
          onClick={() => setScreen("administration")}
        >
          ← Staff Dashboard
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "1400px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <h1
            style={{
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            User Management
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={styles.userStats}>
              <h2>{totalUsers}</h2>
              <p>Total Users</p>
            </div>

            <div style={styles.userStats}>
              <h2>{enabledUsers}</h2>
              <p>Enabled</p>
            </div>

            <div style={styles.userStats}>
              <h2>{disabledUsers}</h2>
              <p>Disabled</p>
            </div>

            <div style={styles.userStats}>
              <h2>{adminUsers}</h2>
              <p>Administrators</p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              marginBottom: "24px",
              flexWrap: "wrap",
            }}
          >

            <button
              style={styles.staffActionButton}
              onClick={() => {
                setEditingUser(null);

                setNewUser({
                  username: "",
                  password: "",
                  display_name: "",
                  email: "",
                  role: "CheckInStaff",
                });

                setShowCreateUser(true);
              }}
            >
              Create User
            </button>


            <button
              style={styles.staffActionButton}
              onClick={loadUsers}
            >
              Refresh
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
              gap: "20px",
            }}
          >
            {users.map((user) => (
              <div
                key={user.id}
                style={{
                  backgroundColor: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "16px",
                  padding: "20px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 8px 0",
                    color: theme.textPrimary,
                  }}
                >
                  {user.display_name || user.username}
                </h3>

                <div
                  style={{
                    color: theme.textSecondary,
                    marginBottom: "12px",
                  }}
                >
                  @{user.username}
                </div>

                <div style={{ marginBottom: "6px" }}>
                  <strong>Role:</strong> {user.role}
                </div>

                <div style={{ marginBottom: "6px" }}>
                  <strong>Status:</strong>{" "}
                  <span
                    style={{
                      color: user.enabled
                        ? theme.success
                        : theme.danger,
                      fontWeight: "bold",
                    }}
                  >
                    {user.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                <div style={{ marginBottom: "6px" }}>
                  <strong>Email:</strong>{" "}
                  {user.email || "Not Configured"}
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <strong>Last Login:</strong>{" "}
                  {user.last_login
                    ? new Date(user.last_login).toLocaleString()
                    : "Never"}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >

                  <button
                    style={styles.staffActionButton}
                    onClick={() => {
                      setEditingUser(user);

                      setNewUser({
                        username: user.username || "",
                        password: "",
                        display_name: user.display_name || "",
                        email: user.email || "",
                        role: user.role || "CheckInStaff",
                      });

                      setShowCreateUser(true);
                    }}
                  >
                    Edit
                  </button>

                  <button
                    style={styles.staffActionButton}
                    onClick={() => handleResetPassword(user)}
                  >
                    Reset Password
                  </button>

                  <button
                    style={{
                      ...styles.staffActionButton,
                      backgroundColor: user.enabled
                        ? theme.danger
                        : theme.success,
                    }}
                    onClick={() => handleToggleUser(user)}
                  >
                    {user.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

  {showCreateUser && (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: theme.surface,
          color: theme.textPrimary,
          borderRadius: "16px",
          padding: "24px",
          width: "500px",
          maxWidth: "90%",
        }}
      >
        <h2>
          {editingUser ? "Edit User" : "Create User"}
        </h2>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={newUser.username}
            disabled={!!editingUser}
            onChange={(e) =>
              setNewUser({
                ...newUser,
                username: e.target.value,
              })
            }
          />
        </div>

        {!editingUser && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              style={styles.input}
              value={newUser.password}
              onChange={(e) =>
                setNewUser({
                  ...newUser,
                  password: e.target.value,
                })
              }
            />
          </div>
        )}

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Display Name</label>
          <input
            style={styles.input}
            value={newUser.display_name}
            onChange={(e) =>
              setNewUser({
                ...newUser,
                display_name: e.target.value,
              })
            }
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            value={newUser.email}
            onChange={(e) =>
              setNewUser({
                ...newUser,
                email: e.target.value,
              })
            }
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Role</label>
          <select
            style={styles.input}
            value={newUser.role}
            onChange={(e) =>
              setNewUser({
                ...newUser,
                role: e.target.value,
              })
            }
          >
            <option value="Administrator">
              Administrator
            </option>
            <option value="CheckInStaff">
              Check-In Staff
            </option>
          </select>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "20px",
          }}
        >
          <button
            style={styles.staffActionButton}
            onClick={async () => {
              try {
                if (editingUser) {
                  await updateUser(
                    editingUser.id,
                    {
                      display_name: newUser.display_name,
                      email: newUser.email,
                      role: newUser.role,
                    }
                  );
                } else {
                  await createUser(newUser);
                }

                await loadUsers();

                setShowCreateUser(false);
                setEditingUser(null);
              } catch (error) {
                console.error(error);
                alert(error.message);
              }
            }}
          >
            Save
          </button>

          <button
            style={styles.staffActionButton}
            onClick={() => {
              setShowCreateUser(false);
              setEditingUser(null);
            }}
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


