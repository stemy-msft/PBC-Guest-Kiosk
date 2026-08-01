import { useEffect, useRef, useState } from "react";
import { version as APP_VERSION_RAW } from "../package.json";
import {
  mapReportingSummary,
  resolveRequiredReturningCheckinFields,
} from "./lib/viewModel";
import {
  assignPrintAgent,
  deletePrintAgent,
  bulkCheckout,
  changePassword,
  checkInAgain,
  checkoutVisitor,
  clearCompletedPrintJobs,
  clearFailedPrintJobs,
  createPrintJob,
  reprintBadge,
  createPrintStation,
  createUser,
  createVisitor,
  deletePrintJob,
  reassignPrintJobStation,
  deletePrintStation,
  downloadPrintStationQr,
  exportActiveVisitors,
  findVisitors,
  generateBadge,
  getActiveVisitors,
  getDashboardStats,
  getPrintAgents,
  getPrintJobs,
  getPrintJobStatus,
  getPrintStations,
  getReportingSummary,
  getSettings,
  getThemes,
  getUsers,
  getVisitor,
  getVisitorHistory,
  login,
  printAgentTestLabel,
  printStationQrLabel,
  resetPassword,
  saveSettings,
  searchVisitors,
  setPrintAgentEnabled,
  createTheme,
  updateTheme,
  deleteTheme,
  uploadThemeLogo,
  deleteThemeLogo,
  updatePrintStation,
  uploadPhoto,
  updateUser,
  updateUserStatus,
  updateVisitor,
} from "./api";



// This loads the configurable options in the app
import { VISITOR_TYPES, VISIT_PURPOSES } from "./constants/options";

// This loads the field definitions for the check-in form
import {
  FIELD_KEYS,
  REQUIRED_CHECKIN_FIELDS,
  REQUIRED_RETURNING_CHECKIN_FIELDS,
  getMissingRequiredFieldLabels,
} from "./constants/fields";

// Import the styles from styles.js  
import { getStyles } from "./constants/styles";

// Import the themese from themes.js
import { themes } from "./constants/themes";

// Theme Editor configuration (font options + editable color fields)
import { FONT_OPTIONS, THEME_COLOR_FIELDS, CUSTOM_FONT_VALUE } from "./constants/themeEditor";


// M9.2 Batch 2: render a server-computed job age (seconds) as a short,
// human-readable duration for the print queue.
function formatJobAge(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) {
    return "unknown";
  }
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

// Derive a single operator-facing health verdict from the dashboard stats so the
// summary-first dashboard can replace nine diagnostic cards with one card.
// All inputs already come from the existing dashboard endpoint (no backend change).
function deriveSystemHealth(stats) {
  if (!stats) {
    return { state: "healthy", label: "All Clear", items: [] };
  }
  const offlineAgents = stats.offline_agents ?? 0;
  const stationsNeedingAttention = stats.stations_needing_attention ?? 0;
  const stationsWithStuckJobs = stats.stations_with_stuck_jobs ?? 0;
  const jobsRequiringAttention = stats.jobs_requiring_attention ?? 0;
  const staleStations = stats.stale_stations ?? 0;
  const oldest = stats.oldest_pending_age_seconds;

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const items = [];
  if (offlineAgents > 0) items.push(`${plural(offlineAgents, "agent")} offline`);
  if (stationsNeedingAttention > 0)
    items.push(`${plural(stationsNeedingAttention, "station")} need attention`);
  if (stationsWithStuckJobs > 0)
    items.push(`${plural(stationsWithStuckJobs, "station")} with stuck jobs`);
  if (jobsRequiringAttention > 0)
    items.push(`${plural(jobsRequiringAttention, "job")} need attention`);
  if (staleStations > 0) items.push(`${plural(staleStations, "station")} stale`);
  if (typeof oldest === "number") items.push(`oldest pending ${formatJobAge(oldest)}`);

  let state = "healthy";
  if (stationsNeedingAttention > 0) {
    state = "critical";
  } else if (
    jobsRequiringAttention > 0 ||
    stationsWithStuckJobs > 0 ||
    staleStations > 0 ||
    offlineAgents > 0
  ) {
    state = "attention";
  }
  const label =
    state === "critical" ? "Critical" : state === "attention" ? "Warning" : "All Clear";
  return { state, label, items };
}


export default function App() {

  // State variables

  // Single source of truth: package.json version. The SemVer prerelease
  // "1.0.0-rc.1" is shown human-facing as "1.0.0 RC1".
  const APP_VERSION = APP_VERSION_RAW.replace("-rc.", " RC");
  const APP_NAME = "PBC Guest Kiosk";

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 

  // Tablet range (e.g. iPad): wide enough to avoid the phone layout but still
  // narrower than desktop, so the desktop layout should not be shown as-is.
  const [isTablet, setIsTablet] = useState(
    window.innerWidth >= 768 && window.innerWidth < 1024
  );
  const [activeVisitors, setActiveVisitors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraTarget, setCameraTarget] = useState("new");
  const canvasRef = useRef(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [editingPrintStation, setEditingPrintStation] = useState(null);
  const [newPrintStation, setNewPrintStation] = useState({name: "",slug: "",enabled: true,});
  const PRINT_STATION = getPrintStationSlug();
  const [printAgents, setPrintAgents] = useState([]);
  const [printStations, setPrintStations] = useState([]);
  const [printStationsLoaded, setPrintStationsLoaded] = useState(false);
  const [printJobs, setPrintJobs] = useState([]);
  const [purpose, setPurpose] = useState("Visiting Camper");
  const [reportingSummary, setReportingSummary] = useState(null);
  const [screen, setScreen] = useState("home");
  const [screenHistory, setScreenHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const searchQueryRef = useRef("");
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [assignStationId, setAssignStationId] = useState("");
  const [reprintStationId, setReprintStationId] = useState("");
  // Per-job destination chosen when redirecting a pending print job, keyed by job id.
  const [redirectStationByJob, setRedirectStationByJob] = useState({});
  // M9.2 Batch 4 progressive disclosure: dashboard advanced-diagnostics toggle,
  // and per-card expansion maps for print jobs and stations (keyed by id).
  const [showAdvancedDiagnostics, setShowAdvancedDiagnostics] = useState(false);
  const [expandedJobIds, setExpandedJobIds] = useState({});
  const [expandedStationIds, setExpandedStationIds] = useState({});
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [detailSnapshot, setDetailSnapshot] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [showAssignAgentModal, setShowAssignAgentModal] = useState(false);
  const [showPrintStationModal, setShowPrintStationModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successTitle, setSuccessTitle] = useState("");
  // Guest print-status experience: after a kiosk check-in we poll the public
  // print-job status endpoint so the visitor sees real confirmation.
  const [activePrintJobId, setActivePrintJobId] = useState(null);
  const [printStatus, setPrintStatus] = useState(null);
  const [printPollExpired, setPrintPollExpired] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const videoRef = useRef(null);

  const [systemSettings, setSystemSettings] = useState(null);
  const [editingSettings, setEditingSettings] = useState(null);
  const [userThemes, setUserThemes] = useState({});
  const [editingTheme, setEditingTheme] = useState(null);


    // User State variables
    const [confirmPassword, setConfirmPassword] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [editingUser, setEditingUser] = useState(null);
    const [newPassword, setNewPassword] = useState("");
    const [newUser, setNewUser] = useState({
      username: "",
      password: "",
      display_name: "",
      email: "",
      role: "CheckInStaff",
    });
    const [password, setPassword] = useState("");
    const [profileUser, setProfileUser] = useState(null);
    const [profileForm, setProfileForm] = useState({
      display_name: "",
      email: "",
    });
    const [role, setRole] = useState("");
    const [showCreateUser, setShowCreateUser] = useState(false);
    const [users, setUsers] = useState([]);
    const [username, setUsername] = useState("");


    // Visitor State variables
    const [checkedInVisitorId, setCheckedInVisitorId] = useState(null);
    const [checkoutFirstName, setCheckoutFirstName] = useState("");
    const [checkoutLastName, setCheckoutLastName] = useState("");
    const [checkoutResults, setCheckoutResults] = useState([]);
    const [contactName, setContactName] = useState("");
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
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
    const [selectedVisitor, setSelectedVisitor] = useState(null);
    const [vehiclePlate, setVehiclePlate] = useState("");
    const [visitCount, setVisitCount] = useState(0);
    const [visitorHistory, setVisitorHistory] = useState([]);
    const [visitorType, setVisitorType] = useState("Parent");
    const [showAccountMenu, setShowAccountMenu] = useState(false);

    const refreshSeconds = systemSettings?.auto_refresh_seconds ?? 5;
    const [showCompletedJobs, setShowCompletedJobs] = useState(false);



  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load session expired message from sessionStorage on mount
  useEffect(() => {
      const message = sessionStorage.getItem("session_expired_message");

      if (message) {
          alert(message);
          sessionStorage.removeItem("session_expired_message");
      }
  }, []);   

  // Load system settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Keep the browser tab title in sync with the configurable Site Title
  // setting, falling back to the app name when it is unset.
  useEffect(() => {
    const title = systemSettings?.site_title?.trim();
    document.title = title || APP_NAME;
  }, [systemSettings?.site_title, APP_NAME]);

  // Load Camera devices on mount
  useEffect(() => {
    loadCameras();
  }, []);
  
  // Staff screen refresh every 5 seconds
  useEffect(() => {
    if (screen !== "staff" || !isAuthenticated) {
      return;
    }

    // Refresh immediately on entering the dashboard so newly checked-in
    // visitors and stats appear without waiting for the interval tick.
    loadActiveVisitors();
    loadDashboardStats();

    const interval = setInterval(() => {
      loadActiveVisitors();
      loadDashboardStats();
    }, refreshSeconds * 1000);

    return () => clearInterval(interval);
  }, [screen, isAuthenticated]);

  // Print queue screen refresh every 5 seconds    
  useEffect(() => {
    if (screen !== "print-queue" || !isAuthenticated) {
      return;
    }

    loadPrintJobs();

    const interval = setInterval(() => {
      loadPrintJobs();
    }, 5000);

    return () => clearInterval(interval);
  }, [screen, isAuthenticated]);

  // Guest print-status polling. While the visitor is on the "printing" screen
  // after check-in, poll the public status endpoint until the badge reaches a
  // terminal state (or we give up after a grace period and point them to the
  // Welcome Desk). The endpoint returns only { status, station_name }.
  useEffect(() => {
    if (screen !== "printing" || !activePrintJobId) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const MAX_POLL_MS = 45000;

    async function poll() {
      try {
        const result = await getPrintJobStatus(activePrintJobId);
        if (cancelled) {
          return;
        }
        setPrintStatus(result);
        if (["Completed", "Failed", "Cancelled"].includes(result.status)) {
          clearInterval(interval);
          return;
        }
      } catch {
        // Transient error: keep the friendly "printing" message and retry.
      }
      if (!cancelled && Date.now() - startedAt > MAX_POLL_MS) {
        setPrintPollExpired(true);
        clearInterval(interval);
      }
    }

    const interval = setInterval(poll, 2500);
    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [screen, activePrintJobId]);

  // Auto-return the kiosk to home once printing reaches a terminal state (or we
  // stop polling), so the next guest gets a clean screen without staff action.
  useEffect(() => {
    if (screen !== "printing") {
      return;
    }

    const status = printStatus?.status;
    const terminal =
      status === "Completed" || status === "Failed" || status === "Cancelled";

    if (activePrintJobId && !terminal && !printPollExpired) {
      return;
    }

    const delay = terminal || printPollExpired ? 7000 : 5000;
    const timer = setTimeout(() => {
      resetGuestCheckIn();
    }, delay);

    return () => clearTimeout(timer);
    // resetGuestCheckIn is a stable in-component helper; re-including it would
    // reset the auto-return timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, printStatus, printPollExpired, activePrintJobId]);

  function resetGuestCheckIn() {
    setFirstName("");
    setLastName("");
    setVisitorType(visitorTypes[0] || "");
    setPurpose(visitPurposes[0] || "");
    setContactName("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setBusy(false);
    setVehiclePlate("");
    setEmail("");
    setPhone("");
    setActivePrintJobId(null);
    setPrintStatus(null);
    setPrintPollExpired(false);
    setScreen("home");
  }

  // Load authentication state from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const savedUsername = localStorage.getItem("username");
    const savedRole = localStorage.getItem("role");

    if (token) {
      setIsAuthenticated(true);

      if (savedUsername) {
        setUsername(savedUsername);
      }

      if (savedRole) {
        setRole(savedRole);
      }

      setScreen("staff");
      loadActiveVisitors();
    }
  }, []);

  // Load camera stream into video element when camera is open
  useEffect(() => {

    if (cameraOpen && cameraStream && videoRef.current) {

      videoRef.current.srcObject = cameraStream;

      videoRef.current
        .play()
        .catch((error) => {
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

  // Keep a ref copy of the search query so screen-change refreshes can read
  // the latest value without adding it as an effect dependency.
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Load data when screens change
  useEffect(() => {
    if (screen === "users") {
      loadUsers();
    }

    if (screen === "print-jobs") {
      loadPrintJobs();
    }

    if (screen === "print-stations") {
      loadPrintStations();
      loadPrintAgents();
    }

    if (screen === "print-agents") {
      loadPrintStations();
      loadPrintAgents();
    }

    if (screen === "reporting") {
      loadReportingSummary();
    }

    if (screen === "settings") {
      loadSettings();
    }

    if (screen === "visitor-search" && searchQueryRef.current.trim()) {
      // Re-run the last search on entry so check-in status stays current.
      // Reads the query from a ref so this effect keeps only [screen] as a dep.
      (async () => {
        try {
          const results = await searchVisitors(searchQueryRef.current);
          setSearchResults(results);
          setHasSearched(true);
        } catch (error) {
          console.error(error);
        }
      })();
    }

  }, [screen]);

  // Load station configuration for kiosk users
  useEffect(() => {
    loadPrintStations();
    loadUserThemes();
  }, []);


// Runtime settings loaded from config/system_settings.json.
// Constants are only used as safe fallbacks if settings fail to load.
const defaultThemeName = "campGreen";

// Shipped (built-in) themes are read-only; user-created themes are merged on
// top so a selected custom theme resolves the same way as a built-in one.
const allThemes = { ...themes, ...userThemes };

const themeName = systemSettings?.theme || defaultThemeName;

const theme =
  allThemes[themeName] ||
  allThemes[defaultThemeName] ||
  Object.values(allThemes)[0];

const visitorTypes =
  Array.isArray(systemSettings?.visitor_types) &&
  systemSettings.visitor_types.length > 0
    ? systemSettings.visitor_types
    : VISITOR_TYPES;

const visitPurposes =
  Array.isArray(systemSettings?.visit_purposes) &&
  systemSettings.visit_purposes.length > 0
    ? systemSettings.visit_purposes
    : VISIT_PURPOSES;

const requiredCheckinFields =
  Array.isArray(systemSettings?.required_checkin_fields)
    ? systemSettings.required_checkin_fields
    : REQUIRED_CHECKIN_FIELDS;

const requiredReturningCheckinFields = resolveRequiredReturningCheckinFields(
  systemSettings,
  REQUIRED_RETURNING_CHECKIN_FIELDS
);

// This will add some retro feel to CRT themes.
const isCrtTheme = theme.crt === true || theme.crt === "true";

const styles = getStyles(theme, isCrtTheme);

  // Enforce the CRT monospace font across the entire UI while a CRT theme is
  // active. Form controls (button, input, select, textarea) do not inherit
  // font-family, so the theme font otherwise only reaches plain text. A scoped
  // stylesheet with !important covers those controls too, and is removed when
  // switching to a non-CRT theme so other themes are unaffected.
  useEffect(() => {
    const styleId = "crt-font-enforcement";
    let styleEl = document.getElementById(styleId);

    if (isCrtTheme) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent =
        `body, body * { font-family: ${theme.fontFamily} !important; }`;
    } else if (styleEl) {
      styleEl.remove();
    }
  }, [isCrtTheme, theme.fontFamily]);


    
  // Functions in App()


  function renderVersionFooter() {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "10px",
          right: "14px",
          fontSize: "0.75rem",
          color: theme.textSecondary,
          opacity: 0.75,
          zIndex: 1000,
          pointerEvents: "none",
        }}
      >
        {APP_NAME} v{APP_VERSION}
      </div>
    );
  }  

  function getPhotoUrl(photoPath) {
    if (!photoPath) {
      return null;
    }

    return `${import.meta.env.VITE_API_BASE || ""}/${photoPath.replaceAll("\\", "/")}`;
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

  async function handleDeletePrintStation(station) {
    const confirmed = window.confirm(
      `Delete print station '${station.name}'?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await deletePrintStation(station.id);

      await loadPrintStations();

      alert(result.message);
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
    if (!searchQuery.trim()) {
      return;
    }

    try {
      const results = await searchVisitors(searchQuery);

      setSearchResults(results);
      setHasSearched(true);
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
      setDetailSnapshot(visitorFingerprint(visitor));

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
  
  async function handleSaveSettings() {
    try {
      const saved = await saveSettings(editingSettings);

      const refreshed = await getSettings();

      setSystemSettings(refreshed);
      setEditingSettings(refreshed);

      alert("Settings saved successfully.");

      setScreen("settings");
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function loadUserThemes() {
    try {
      const data = await getThemes();
      setUserThemes(data || {});
    } catch (error) {
      console.error(error);
    }
  }

  // A theme name is "built-in" when it ships in themes.js; those are read-only.
  function isBuiltinTheme(id) {
    return Object.prototype.hasOwnProperty.call(themes, id);
  }

  function startNewTheme() {
    setEditingTheme({
      id: "",
      originalId: null,
      isNew: true,
      tokens: { ...themes[defaultThemeName] },
    });
  }

  function startEditTheme(id) {
    setEditingTheme({
      id,
      originalId: id,
      isNew: false,
      tokens: { ...allThemes[id] },
    });
  }

  function startCopyTheme(sourceId) {
    setEditingTheme({
      id: "",
      originalId: null,
      isNew: true,
      tokens: { ...allThemes[sourceId] },
    });
  }

  function updateThemeToken(key, value) {
    setEditingTheme((current) =>
      current
        ? { ...current, tokens: { ...current.tokens, [key]: value } }
        : current
    );
  }

  async function handleSaveTheme() {
    if (!editingTheme) {
      return;
    }
    try {
      if (editingTheme.isNew) {
        await createTheme(editingTheme.id, editingTheme.tokens);
      } else {
        await updateTheme(editingTheme.originalId, editingTheme.tokens);
      }
      await loadUserThemes();
      setEditingTheme(null);
      alert("Theme saved successfully.");
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleThemeLogoUpload(file) {
    if (!editingTheme || !file) {
      return;
    }
    if (editingTheme.isNew) {
      alert("Save the theme first, then add a logo.");
      return;
    }
    try {
      const result = await uploadThemeLogo(editingTheme.originalId, file);
      const saved = result[editingTheme.originalId];
      updateThemeToken("logoOverlay", saved.logoOverlay);
      await loadUserThemes();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleThemeLogoRemove() {
    if (!editingTheme || editingTheme.isNew) {
      return;
    }
    try {
      await deleteThemeLogo(editingTheme.originalId);
      updateThemeToken("logoOverlay", "");
      await loadUserThemes();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleDeleteTheme(id) {
    if (!window.confirm(`Delete the theme "${id}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteTheme(id);
      await loadUserThemes();
      // If the deleted theme was the active one, fall back to the default.
      if (systemSettings?.theme === id) {
        const refreshed = await saveSettings({
          ...systemSettings,
          theme: defaultThemeName,
        });
        setSystemSettings(refreshed);
        setEditingSettings(refreshed);
      }
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleStaffLogin() {
    try {
      const result = await login(username, password);

      localStorage.setItem("access_token",result.access_token);
      localStorage.setItem("username",result.username);
      localStorage.setItem("role",result.role);

      setUsername(result.username);
      setRole(result.role);
      setIsAuthenticated(true);

      await loadActiveVisitors();
      await loadDashboardStats();

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

  async function loadPrintAgents() {
    try {
      const data = await getPrintAgents();
      setPrintAgents(data);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function loadPrintStations() {
    try {
      const data = await getPrintStations();

      setPrintStations(data);

      // Default the staff reprint destination to this device's URL station
      // the first time stations load; leave any explicit choice untouched.
      // The slug is derived locally (not from a component-scope value) so this
      // loader stays a stable reference for the effects that call it.
      setReprintStationId((current) => {
        if (current) {
          return current;
        }
        const segments = window.location.pathname
          .split("/")
          .filter(Boolean);
        const slug = segments.length
          ? decodeURIComponent(segments[segments.length - 1])
          : "";
        const urlStation = data.find(
          (station) => station.slug === slug
        );
        return urlStation ? String(urlStation.id) : current;
      });
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setPrintStationsLoaded(true);
    }
  }

  async function loadSettings() {
    try {
      const data = await getSettings();

      setSystemSettings(data);
      setEditingSettings(data);
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
    // Release the camera stream so it does not stay active after leaving a
    // photo-capture screen (e.g. returning check-in).
    closeCamera();
    setScreenHistory((previous) => [...previous, screen]);
    setScreen(screenName);
  }

  // Fingerprint of the editable visitor fields, used to detect unsaved edits.
  function visitorFingerprint(visitor) {
    if (!visitor) {
      return "";
    }
    return JSON.stringify({
      first_name: visitor.first_name ?? "",
      last_name: visitor.last_name ?? "",
      visitor_type: visitor.visitor_type ?? "",
      purpose: visitor.purpose ?? "",
      host_name: visitor.host_name ?? "",
      vehicle_plate: visitor.vehicle_plate ?? "",
      phone: visitor.phone ?? "",
      email: visitor.email ?? "",
      notes: visitor.notes ?? "",
      expected_departure_time: visitor.expected_departure_time ?? null,
    });
  }

  function handleLeaveVisitorDetail() {
    if (
      detailSnapshot &&
      visitorFingerprint(selectedVisitor) !== detailSnapshot
    ) {
      const leave = window.confirm(
        "You have unsaved changes to this visitor. Leave without saving? " +
          'Click Cancel to stay, then use "Update Visitor Details" to save.'
      );
      if (!leave) {
        return;
      }
    }
    navigateTo("staff");
  }

  function handleLeaveReturningCheckin() {
    if (returningPhotoFile && !checkedInVisitorId) {
      const leave = window.confirm(
        "You retook the visitor photo but haven't checked them in yet, so " +
          "the new photo won't be saved. Leave anyway? Click Cancel to stay " +
          "and check the visitor in."
      );
      if (!leave) {
        return;
      }
    }
    navigateTo("visitor-detail");
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
      setDetailSnapshot(visitorFingerprint(updatedVisitor));

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

  async function loadDashboardStats() {
    try {
      const data = await getDashboardStats();
      setDashboardStats(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadReportingSummary() {
    try {
      const data = await getReportingSummary();
      setReportingSummary(data);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handlePrintStationQrLabel(station) {
  const confirmed = window.confirm(
    `Print a QR code label for '${station.name}'?\n\nThis will print to the station's assigned printer.`
  );

  if (!confirmed) {
    return;
  }

  try {
    const result = await printStationQrLabel(station.id);

    alert(result.message);

    await loadPrintJobs();
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}


  // Account Menu Functions

  async function handleChangePassword() {
    if (!currentPassword) {
      alert("Current password is required.");
      return;
    }

    if (!newPassword) {
      alert("New password is required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("New password and confirmation do not match.");
      return;
    }

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      alert("Password changed successfully.");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setScreen("staff");
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
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
  
  function handleOpenChangePassword() {
    setShowAccountMenu(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setScreen("change-password");
  }

  async function handleOpenMyProfile() {
    try {
      const data = await getUsers();

      const currentProfileUser = data.find(
        (user) =>
          user.username.toLowerCase() === username.toLowerCase()
      );

      if (!currentProfileUser) {
        alert("Your user profile could not be found.");
        return;
      }

      setProfileUser(currentProfileUser);
      setProfileForm({
        display_name: currentProfileUser.display_name || "",
        email: currentProfileUser.email || "",
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setShowAccountMenu(false);
      setScreen("my-profile");
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleSaveMyProfile() {
    if (!profileUser) {
      alert("No profile is loaded.");
      return;
    }

    try {
      await updateUser(
        profileUser.id,
        {
          display_name: profileForm.display_name,
          email: profileForm.email,
        }
      );

      alert("Profile updated successfully.");

      setProfileUser({
        ...profileUser,
        display_name: profileForm.display_name,
        email: profileForm.email,
      });

      setScreen("staff");
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  function renderAccountMenu() {
    if (!username) return null;

    return (
      <div
        style={{
          position: "fixed",
          top: "12px",
          right: "12px",
          zIndex: 9999,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            backgroundColor: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: "16px",
            padding: "16px",
            minWidth: "150px",
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <button
            type="button"
            style={styles.accountMenuButton}
            onClick={() =>
              setShowAccountMenu(!showAccountMenu)
            }
          >
            <div style={{ fontWeight: "bold" }}>
              {username}
            </div>

            <div
              style={{
                fontSize: "12px",
                color: theme.neutraltext,
              }}
            >
              {role}
            </div>
          </button>

          {showAccountMenu && (
            <>
              <button
                type="button"
                style={styles.accountMenuButton}
                onClick={handleOpenMyProfile}
              >
                Edit My Profile
              </button>

              <button
                type="button"
                style={styles.accountMenuButton}
                onClick={handleOpenChangePassword}
              >
                Change Password
              </button>

              <button
                type="button"
                style={styles.accountMenuButton}
                onClick={() => {
                  setShowAccountMenu(false);
                  setScreen("help");
                }}
              >
                Help
              </button>

              <div
                style={{
                  height: "1px",
                  backgroundColor: theme.border,
                  margin: "4px 0",
                }}
              />

              <button
                type="button"
                style={styles.accountMenuDangerButton}
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");

    setIsAuthenticated(false);
    setUsername("");
    setRole("");
    setShowAccountMenu(false);

    setScreen("home");
  }



  // Badge Functions

  function getAssignedAgentsForStation(station) {
    return printAgents.filter(
      (agent) => agent.station_id === station.id
    );
  }

  function getCurrentPrintStation() {
    return (
      printStations.find(
        (station) => station.slug === PRINT_STATION
      ) || null
    );
  }

  function getPrintStationStatus(station) {
    // M9.2 Batch 1: trust the backend's authoritative station status rather than
    // recomputing it (and re-deriving agent liveness) on the client.
    const status = station && station.status;

    if (status === "maintenance" || (station && !station.enabled)) {
      return {
        label: "MAINTENANCE",
        color: "#f59e0b",
      };
    }

    if (status === "online") {
      return {
        label: "ONLINE",
        color: theme.success,
      };
    }

    if (status === "stale") {
      return {
        label: "STALE",
        color: "#f59e0b",
      };
    }

    return {
      label: "OFFLINE",
      color: theme.danger,
    };
  }

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
      `Delete Print Job #${jobId}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deletePrintJob(jobId);

      await loadPrintJobs();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleReprintJob(job) {
    try {
      await reprintBadge(
        job.visitor_id,
        reprintStationId ? Number(reprintStationId) : null
      );
      await loadPrintJobs();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }  

  async function handleRedirectPrintJob(job) {
    const stationId = redirectStationByJob[job.id];

    if (!stationId) {
      alert("Select a destination station first.");
      return;
    }

    try {
      await reassignPrintJobStation(job.id, Number(stationId));
      setRedirectStationByJob((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });
      await loadPrintJobs();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleReprintBadge(visitorId) {
    try {
      await reprintBadge(
        visitorId,
        reprintStationId ? Number(reprintStationId) : null
      );

      alert("A new visitor badge has been sent to the printer.");
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
    console.log("handlePrintReturningBadge fired");
    try {
      if (!checkedInVisitorId) {
        alert("Please check in the visitor first.");
        return;
      }

      setBusy(true);

      await generateBadge(checkedInVisitorId);
      await reprintBadge(
        checkedInVisitorId,
        reprintStationId ? Number(reprintStationId) : null
      );

      alert("Badge sent to printer.");

    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setBusy(false);
    }
  }

  function isAgentOnline(agent) {
    // M9.2 Batch 1: the backend is the single source of truth for liveness.
    // Consuming the server-computed flag removes the previous timezone-dependent
    // client calculation (which skewed by the browser's UTC offset).
    return Boolean(agent && agent.online);
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
    return await createPrintJob(visitorId);
  }  

  function getPrintStationSlug() {
    // Station context is read from the URL path only (never a query param):
    // the last path segment of the kiosk/QR URL is the station slug. An
    // unresolved station must fail closed rather than route to a default.
    const segments = window.location.pathname.split("/").filter(Boolean);

    return segments.length
      ? decodeURIComponent(segments[segments.length - 1])
      : "";
  }

  async function handlePrintAgentTest(agent) {
    const confirmed = window.confirm(
      `Print a test label for '${agent.hostname}'?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await printAgentTestLabel(agent.id);

      alert(result.message);

      await loadPrintJobs();
      await loadPrintAgents();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }


  async function handleSetAgentEnabled(agent, enabled) {
    const action = enabled ? "Approve" : "Disable";
    const confirmed = window.confirm(
      `${action} print agent '${agent.hostname}'?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await setPrintAgentEnabled(agent.id, enabled);
      await loadPrintAgents();
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  async function handleDeleteAgent(agent) {
    const confirmed = window.confirm(
      `Remove print agent '${agent.hostname}'? This deletes its registration ` +
        `and credentials. Any badges it was printing return to the queue.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deletePrintAgent(agent.id);
      await loadPrintAgents();
    } catch (error) {
      console.error(error);
      alert(error.message);
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
    requiredCheckinFields
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
      station: PRINT_STATION,
    });

      if (photoFile) {
        console.log("Uploading photo...");
        await uploadPhoto(visitor.id, photoFile);

        console.log("Generating badge...");
        await generateBadge(visitor.id);
      }

      console.log("Creating print job...");
      const job = await createPrintJob(visitor.id);

      // Drive the guest print-status screen: capture the job id so we can poll
      // the public status endpoint, and reset any prior status state.
      setActivePrintJobId(job?.id ?? null);
      setPrintStatus(null);
      setPrintPollExpired(false);

      setSuccessTitle("Check-In Complete");
      setSuccessMessage(
        "Your visitor badge is being printed. Please wear it while on campus."
      );

      setBusy(false);
      setScreen("printing");
    } catch (error) {
      console.error(error);
      setBusy(false);
      alert(error.message);
    }
  }

  function handleCheckInAgain(visitor) {
    console.log("handleCheckInAgain called with visitor:", visitor);
    populateReturningVisitor(visitor);

    console.log("Returning visitor state set to:", returningVisitor);
    setReturningPhotoFile(null);

    console.log("Returning photo file state set to null");
    setReturningPhotoPreview(null);

    console.log("Returning photo preview state set to null");
    setCheckedInVisitorId(null);

    setScreen("returning-checkin");
  }

  async function handleCheckInReturningVisitor() {
  try {
    setBusy(true);

    const visitor = await checkInAgain(
      selectedVisitor.id,
      {
        first_name: returningVisitor.first_name,
        last_name: returningVisitor.last_name,
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

    await generateBadge(visitor.id);
    await reprintBadge(
      visitor.id,
      reprintStationId ? Number(reprintStationId) : null
    );

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
      requiredCheckinFields.includes("first_name") &&
      !firstName.trim()
    ) {
      missing.push("First Name");
    }

    if (
      requiredCheckinFields.includes("last_name") &&
      !lastName.trim()
    ) {
      missing.push("Last Name");
    }

    if (
      requiredCheckinFields.includes("host_name") &&
      !contactName.trim()
    ) {
      missing.push("Camper or Contact Name");
    }

    if (
      requiredCheckinFields.includes("photo") &&
      !photoFile
    ) {
      missing.push("Visitor Photo");
    }

    return missing;
  }

  // End Checkin Functions


  // Checkout Functions
  async function handleExportActiveVisitors() {
    // Emergency roster download for evacuation / roll-call.
    try {
      await exportActiveVisitors();
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
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }

        const file = new File(
          [blob],
          "visitor-photo.jpg",
          {
            type: "image/jpeg",
          }
        );

        const previewUrl = URL.createObjectURL(file);

        if (cameraTarget === "returning") {
          setReturningPhotoFile(file);
          setReturningPhotoPreview(previewUrl);
        } else {
          setPhotoFile(file);
          setPhotoPreview(previewUrl);
        }

        closeCamera();
      },
      "image/jpeg",
      0.95
    );
  }

  function closeCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    setCameraStream(null);
    setCameraOpen(false);
  }

  async function loadCameras() {
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

  async function openCamera(target = "new", fallbackInputId = "photoInput") {
    try {
      setCameraTarget(target);

      // Prefer the in-app camera (getUserMedia) on every device: launching the
      // OS camera via a native file input can tear down the mobile WebView and
      // remount the app to the home screen, losing check-in progress. Only fall
      // back to the native input when getUserMedia is unavailable.
      if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        document.getElementById(fallbackInputId)?.click();
        return;
      }

      const videoConstraint = selectedCamera
        ? {
            deviceId: {
              exact: selectedCamera,
            },
          }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });

      setCameraStream(stream);
      setCameraOpen(true);
    } catch (error) {
      console.error("Camera failed:", error);
      console.error("Error name:", error?.name);
      console.error("Error message:", error?.message);

      document
        .getElementById(fallbackInputId)
        ?.click();
    }
  }

  function renderCameraModal() {
    if (!cameraOpen) {
      return null;
    }

    return (
      <div style={styles.cameraOverlay}>
        <div style={styles.cameraPanel}>
          <h2 style={styles.formTitle}>Take Visitor Photo</h2>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Camera</label>

            <select
              style={styles.input}
              value={selectedCamera}
              onChange={(event) =>
                switchCamera(event.target.value)
              }
            >
              {videoDevices.map((device) => (
                <option
                  key={device.deviceId}
                  value={device.deviceId}
                >
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
              type="button"
              style={styles.staffActionButton}
              onClick={capturePhoto}
            >
              Capture Photo
            </button>

            <button
              type="button"
              style={styles.staffActionButton}
              onClick={closeCamera}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
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



  {/* Start Screen Switching Blocks */}

  // Administration Screen
  if (screen === "administration") {
    if (role !== "Administrator") {
      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>Access Denied</h1>
            <p style={styles.instructions}>
              Administrator privileges are required to access this screen.
            </p>
            <button
              type="button"
              style={styles.staffActionButton}
              onClick={() => setScreen("staff")}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return (
      
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}

        <button
          type="button"
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
              color: theme.textPrimary,
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Administration
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(1, 1fr)"
                : "repeat(4, 1fr)",
              gap: "20px",
            }}
          >
            <div style={styles.administrationCard}>
              <h2 style={{ color: theme.textSecondary }}>User Management</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                Manage user accounts, permissions, and passwords.
              </p>

              <button
                type="button"
                style={styles.administrationActionButton}
                onClick={() => setScreen("users")}
              >
                User Management
              </button>
            </div>

            <div style={styles.administrationCard}>
              <h2 style={{ color: theme.textSecondary }}>Print Stations</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                Configure print stations and printer routing.
              </p>

              <button
                type="button"
                style={styles.administrationActionButton}
                onClick={() => setScreen("print-stations")}
              >
                Print Stations
              </button>
            </div>

            <div style={styles.administrationCard}>
              <h2 style={{ color: theme.textSecondary }}>Print Agents</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                Manage registered print servers and station assignments.
              </p>

              <button
                type="button"
                style={styles.administrationActionButton}
                onClick={async () => {
                  await loadPrintStations();
                  await loadPrintAgents();
                  setScreen("print-agents");
                }}
              >
                Print Agents
              </button>
            </div>

            <div style={styles.administrationCard}>
              <h2 style={{ color: theme.textSecondary }}>System Settings</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                View application configuration and runtime settings.
              </p>

              <button
                type="button"
                style={styles.administrationActionButton}
                onClick={() => setScreen("settings")}
              >
                Open Settings
              </button>
            </div>

            <div style={styles.administrationCard}>
              <h2 style={{ color: theme.textSecondary }}>Theme Editor</h2>

              <p
                style={{
                  marginBottom: "16px",
                  color: theme.textSecondary,
                }}
              >
                Create and customize color themes and fonts.
              </p>

              <button
                type="button"
                style={styles.administrationActionButton}
                onClick={() => {
                  setEditingTheme(null);
                  setScreen("theme-editor");
                }}
              >
                Open Theme Editor
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Theme Editor Screen
  if (screen === "theme-editor") {
    if (role !== "Administrator") {
      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>Access Denied</h1>
            <p style={styles.instructions}>
              Administrator privileges are required to access this screen.
            </p>
            <button
              type="button"
              style={styles.staffActionButton}
              onClick={() => setScreen("staff")}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    // ----- Editor mode: creating or editing a single theme -----
    if (editingTheme) {
      const t = editingTheme.tokens;
      const fontInList = FONT_OPTIONS.some(
        (option) => option.value === t.fontFamily
      );
      const previewCaption = {
        fontSize: "11px",
        color: t.textSecondary,
        fontFamily: t.fontFamily,
        margin: "2px 0 0",
        opacity: 0.85,
      };

      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          {renderAccountMenu()}

          <button
            type="button"
            style={styles.backButton}
            onClick={() => setEditingTheme(null)}
          >
            ← Theme List
          </button>

          <div
            style={{
              width: "100%",
              maxWidth: "1200px",
              margin: "0 auto",
              paddingTop: "80px",
            }}
          >
            <h1
              style={{
                color: theme.textPrimary,
                textAlign: "center",
                marginBottom: "24px",
              }}
            >
              {editingTheme.isNew
                ? "New Theme"
                : `Edit Theme: ${editingTheme.originalId}`}
            </h1>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr",
                gap: "24px",
                alignItems: "start",
              }}
            >
              {/* Editor form */}
              <div style={styles.resultCard}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Theme Name</label>
                  <input
                    style={styles.input}
                    value={editingTheme.id}
                    disabled={!editingTheme.isNew}
                    placeholder="e.g. Sunset Camp"
                    onChange={(e) =>
                      setEditingTheme((current) => ({
                        ...current,
                        id: e.target.value,
                      }))
                    }
                  />
                  {!editingTheme.isNew && (
                    <p
                      style={{
                        marginTop: "6px",
                        fontSize: "13px",
                        color: theme.textSecondary,
                      }}
                    >
                      To rename, create a copy under a new name.
                    </p>
                  )}
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Font</label>
                  <select
                    style={styles.input}
                    value={fontInList ? t.fontFamily : CUSTOM_FONT_VALUE}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateThemeToken(
                        "fontFamily",
                        value === CUSTOM_FONT_VALUE
                          ? fontInList
                            ? ""
                            : t.fontFamily
                          : value
                      );
                    }}
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value={CUSTOM_FONT_VALUE}>Custom…</option>
                  </select>
                  {!fontInList && (
                    <>
                      <input
                        style={{ ...styles.input, marginTop: "8px" }}
                        value={t.fontFamily}
                        placeholder="e.g. 'Roboto', Arial, sans-serif"
                        onChange={(e) =>
                          updateThemeToken("fontFamily", e.target.value)
                        }
                      />
                      <p
                        style={{
                          marginTop: "6px",
                          fontSize: "13px",
                          color: theme.textSecondary,
                        }}
                      >
                        Type any CSS font-family. To use a custom font offline,
                        drop its .woff2 in frontend/public/fonts/ and add a
                        matching @font-face rule in frontend/src/index.css.
                        Otherwise the font must already be installed on the
                        kiosk to render.
                      </p>
                    </>
                  )}
                </div>

                <div style={styles.fieldGroup}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      color: theme.label,
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!t.crt}
                      onChange={(e) =>
                        updateThemeToken("crt", e.target.checked)
                      }
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    CRT / terminal effect
                  </label>
                  <p
                    style={{
                      marginTop: "6px",
                      fontSize: "13px",
                      color: theme.textSecondary,
                    }}
                  >
                    Enforces the theme font across every control and enables the
                    retro monospace terminal styling.
                  </p>
                </div>

                <div style={styles.fieldGroup}>
                  <label
                    style={{
                      display: "block",
                      color: theme.label,
                      fontWeight: 600,
                    }}
                  >
                    Logo overlay (optional)
                  </label>
                  {t.logoOverlay ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginTop: "8px",
                      }}
                    >
                      <img
                        src={t.logoOverlay}
                        alt="Logo overlay preview"
                        style={{
                          width: "64px",
                          height: "64px",
                          objectFit: "contain",
                          borderRadius: "8px",
                          border: `1px solid ${theme.border}`,
                          backgroundColor: theme.surfaceSecondary,
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleThemeLogoRemove}
                        disabled={editingTheme.isNew}
                        style={{
                          border: `1px solid ${theme.border}`,
                          backgroundColor: theme.surface,
                          color: theme.textPrimary,
                          borderRadius: "10px",
                          padding: "8px 14px",
                          cursor: editingTheme.isNew ? "not-allowed" : "pointer",
                        }}
                      >
                        Remove logo
                      </button>
                    </div>
                  ) : null}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={editingTheme.isNew}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      handleThemeLogoUpload(file);
                      e.target.value = "";
                    }}
                    style={{ marginTop: "10px", color: theme.textPrimary }}
                  />
                  <p
                    style={
                      editingTheme.isNew
                        ? {
                            marginTop: "10px",
                            padding: "10px 12px",
                            fontSize: "14px",
                            fontWeight: 600,
                            color: theme.buttonText,
                            backgroundColor: theme.primary,
                            border: `1px solid ${theme.primary}`,
                            borderRadius: "8px",
                          }
                        : {
                            marginTop: "6px",
                            fontSize: "13px",
                            color: theme.textSecondary,
                          }
                    }
                  >
                    {editingTheme.isNew
                      ? "⚠ Save the theme first, then upload a logo."
                      : "PNG, JPEG, or WebP up to 2 MB. Re-encoded to a transparent PNG and scaled to 512px."}
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: "12px 20px",
                    marginTop: "12px",
                  }}
                >
                  {THEME_COLOR_FIELDS.map((field) => (
                    <div key={field.key}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: theme.label,
                          marginBottom: "4px",
                        }}
                      >
                        {field.label}
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <input
                          type="color"
                          value={t[field.key] || "#000000"}
                          onChange={(e) =>
                            updateThemeToken(field.key, e.target.value)
                          }
                          style={{
                            width: "44px",
                            height: "36px",
                            border: `1px solid ${theme.border}`,
                            borderRadius: "8px",
                            background: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        />
                        <input
                          value={t[field.key] || ""}
                          onChange={(e) =>
                            updateThemeToken(field.key, e.target.value)
                          }
                          style={{
                            flex: 1,
                            height: "36px",
                            padding: "0 10px",
                            borderRadius: "8px",
                            border: `1px solid ${theme.border}`,
                            backgroundColor: theme.surfaceSecondary,
                            color: theme.textPrimary,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    marginTop: "24px",
                  }}
                >
                  <button
                    type="button"
                    style={styles.staffActionButton}
                    onClick={handleSaveTheme}
                  >
                    Save Theme
                  </button>
                  <button
                    type="button"
                    style={{
                      backgroundColor: theme.surface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: "16px",
                      color: theme.textPrimary,
                      cursor: "pointer",
                      fontSize: "1rem",
                      fontWeight: 600,
                      height: "56px",
                      minWidth: "140px",
                      flex: "1 1 160px",
                      padding: "0 24px",
                      marginTop: "12px",
                    }}
                    onClick={() => setEditingTheme(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Live preview */}
              <div
                style={{
                  position: "sticky",
                  top: "20px",
                }}
              >
                <label style={styles.label}>Preview</label>
                <div
                  style={{
                    marginTop: "8px",
                    borderRadius: "16px",
                    border: `1px solid ${t.border}`,
                    background: t.background,
                    color: t.textPrimary,
                    fontFamily: t.fontFamily,
                    padding: "24px",
                  }}
                >
                  <h2
                    style={{
                      color: t.textPrimary,
                      fontFamily: t.fontFamily,
                      fontSize: "1.85rem",
                      marginTop: 0,
                      marginBottom: 0,
                    }}
                  >
                    {editingTheme.id || "Theme Preview"}
                  </h2>
                  <p style={previewCaption}>Heading — Text (Primary) on Background</p>

                  <div
                    style={{
                      background: t.surface,
                      border: `1px solid ${t.border}`,
                      borderRadius: "12px",
                      padding: "16px",
                      marginTop: "14px",
                      marginBottom: "16px",
                    }}
                  >
                    <p style={previewCaption}>Card — Surface + Border</p>

                    <p
                      style={{
                        color: t.textPrimary,
                        fontSize: "1.05rem",
                        margin: "10px 0 0",
                        fontFamily: t.fontFamily,
                      }}
                    >
                      Primary body text.
                    </p>
                    <p style={previewCaption}>Text (Primary)</p>

                    <p
                      style={{
                        color: t.textSecondary,
                        fontSize: "1.05rem",
                        margin: "12px 0 0",
                        fontFamily: t.fontFamily,
                      }}
                    >
                      Secondary / helper text.
                    </p>
                    <p style={previewCaption}>Text (Secondary)</p>

                    <label
                      style={{
                        display: "block",
                        color: t.label,
                        fontSize: "1rem",
                        fontWeight: 600,
                        margin: "14px 0 0",
                        fontFamily: t.fontFamily,
                      }}
                    >
                      Field label
                    </label>
                    <p style={previewCaption}>Label</p>
                    <input
                      readOnly
                      value="Sample input"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        height: "48px",
                        padding: "0 14px",
                        marginTop: "6px",
                        fontSize: "1rem",
                        borderRadius: "10px",
                        border: `1px solid ${t.border}`,
                        backgroundColor: t.surfaceSecondary,
                        color: t.textPrimary,
                        fontFamily: t.fontFamily,
                      }}
                    />
                    <p style={previewCaption}>
                      Input — Surface (Secondary) + Text (Primary)
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "14px",
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      {
                        label: "Primary",
                        bg: t.primary,
                        fg: t.primaryText,
                        caption: "Primary + Primary Text",
                      },
                      {
                        label: "Button",
                        bg: t.buttonColor,
                        fg: t.buttonText,
                        caption: "Button + Button Text",
                      },
                      {
                        label: "Success",
                        bg: t.success,
                        fg: t.successText,
                        caption: "Success + Success Text",
                      },
                      {
                        label: "Neutral",
                        bg: t.neutral,
                        fg: t.neutralText,
                        caption: "Neutral + Neutral Text",
                      },
                      {
                        label: "Danger",
                        bg: t.danger,
                        fg: t.dangerText,
                        caption: "Danger + Danger Text",
                      },
                    ].map((b) => (
                      <div
                        key={b.label}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "2px",
                        }}
                      >
                        <button
                          type="button"
                          style={{
                            border: "none",
                            borderRadius: "14px",
                            padding: "14px 26px",
                            fontSize: "1.05rem",
                            cursor: "default",
                            backgroundColor: b.bg,
                            color: b.fg,
                            fontFamily: t.fontFamily,
                            fontWeight: 600,
                          }}
                        >
                          {b.label}
                        </button>
                        <p
                          style={{ ...previewCaption, textAlign: "center" }}
                        >
                          {b.caption}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ----- List mode: choose a theme to edit, copy, or delete -----
    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}

        <button
          type="button"
          style={styles.backButton}
          onClick={() => setScreen("administration")}
        >
          ← Administration
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "900px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <h1
            style={{
              color: theme.textPrimary,
              textAlign: "center",
              marginBottom: "12px",
            }}
          >
            Theme Editor
          </h1>

          <p
            style={{
              textAlign: "center",
              color: theme.textSecondary,
              marginBottom: "24px",
            }}
          >
            Built-in themes are read-only. Copy one to create a customizable
            version, or start a new theme from scratch.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "28px",
            }}
          >
            <button
              type="button"
              style={styles.staffActionButton}
              onClick={startNewTheme}
            >
              + Create New Theme
            </button>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {Object.keys(allThemes).map((id) => {
              const builtin = isBuiltinTheme(id);
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "14px 18px",
                    borderRadius: "12px",
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.surfaceSecondary,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: `1px solid ${theme.border}`,
                        backgroundColor: allThemes[id].primary,
                        display: "inline-block",
                      }}
                    />
                    <strong style={{ color: theme.textPrimary }}>{id}</strong>
                    {builtin && (
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: theme.neutralText,
                          backgroundColor: theme.neutral,
                          borderRadius: "999px",
                          padding: "2px 10px",
                        }}
                      >
                        Built-in
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    {!builtin && (
                      <button
                        type="button"
                        style={styles.administrationActionButton}
                        onClick={() => startEditTheme(id)}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      style={styles.administrationActionButton}
                      onClick={() => startCopyTheme(id)}
                    >
                      Copy
                    </button>
                    {!builtin && (
                      <button
                        type="button"
                        style={styles.accountMenuDangerButton}
                        onClick={() => handleDeleteTheme(id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Change Password Screen
  if (screen === "change-password") {

    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}

        <button
          style={styles.backButton}
          onClick={() => setScreen("staff")}
        >
          ← Back
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "700px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>
              Change Password
            </h1>

            <p style={styles.instructions}>
              Update your account password.
            </p>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                Current Password
              </label>

              <input
                type="password"
                style={styles.input}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                } }
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                New Password
              </label>

              <input
                type="password"
                style={styles.input}
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(e.target.value)
                }
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>
                Confirm New Password
              </label>

              <input
                type="password"
                style={styles.input}
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                style={styles.staffActionButton}
                onClick={handleChangePassword}
              >
                Change Password
              </button>

              <button
                type="button"
                style={styles.staffActionButton}
                onClick={() => setScreen("staff")}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check-in Screen
  if (screen === "checkin") {

    const currentPrintStation = getCurrentPrintStation();
    if (
      printStationsLoaded &&
      !currentPrintStation
    ) {
      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>
              Invalid Check-In Station
            </h1>

            <p style={styles.instructions}>
              The check-in station specified in the
              QR code does not exist.
            </p>

            <p style={styles.instructions}>
              Please contact a staff member for
              assistance.
            </p>
          </div>
        </div>
      );
    }    

    if (!printStationsLoaded) {
      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>
              Loading Check-In Station
            </h1>

            <p style={styles.instructions}>
              Please wait while the station configuration is loaded.
            </p>
          </div>
        </div>
      );
    }

    if (
      currentPrintStation &&
      !currentPrintStation.enabled
    ) {
      const alternateStations = printStations.filter(
        (station) =>
          station.enabled &&
          station.slug !== currentPrintStation.slug
      );

      return (
        <div style={styles.page}>
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>
              {currentPrintStation.name}
            </h1>

            <p style={styles.instructions}>
              This check-in station is temporarily unavailable.
            </p>

            {alternateStations.length > 0 && (
              <div style={styles.resultCard}>
                <h3>Available Check-In Locations</h3>

                {alternateStations.map((station) => (
                  <div key={station.id}>
                    • {station.name}
                  </div>
                ))}
              </div>
            )}

            <p
              style={{
                marginTop: "20px",
                color: theme.textSecondary,
              }}
            >
              Please see a staff member for assistance.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div style={{ ...styles.page, padding: isMobile ? "24px 16px" : styles.page.padding }}>
        {renderVersionFooter()}
        

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
          type="button"
          style={styles.backButton}
          onClick={() => navigateTo("home")}
        >
          ← Home
        </button>

        <div style={{ ...styles.formContainer, padding: isMobile ? "24px 16px" : styles.formContainer.padding }}>
          <h1 style={{ ...styles.formTitle, fontSize: isMobile ? "1.9rem" : styles.formTitle.fontSize }}>Visitor Check-In</h1>
          <p style={styles.instructions}>
            Complete the form and take a visitor photo before printing a badge.
          </p>

          <div style={{ ...styles.checkinContentContainer, gap: isMobile ? "20px" : styles.checkinContentContainer.gap }}>

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
                  {visitorTypes.map((visitorTypeOption) => (
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
                  {visitPurposes.map((purposeOption) => (
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
                  type="button"
                  style={styles.photoButton}
                  onClick={() =>
                    openCamera("new", "photoInput")
                  }
                >
                  Take Visitor Photo
                </button>

              </p>
            </div>
          </div>

          <button
            type="button"
            style={styles.printButton}
            onClick={handleCheckIn}
            disabled={busy}
          >
            {busy ? "Printing Badge..." : "Check-in"}
          </button>

        </div>

        {/* Super Important Camera Code */}
        {renderCameraModal()}

      </div>
    );
  }

  // Check-out Screen
  if (screen === "checkout") {
    return (
      <div style={styles.page}>
        {renderVersionFooter()}

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
          type="button"
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
            type="button"
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
                type="button"
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

  // Edit Settings Screen
  if (screen === "edit-settings") {
    if (role !== "Administrator") {
      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          {renderAccountMenu()}
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>Access Denied</h1>
            <p style={styles.instructions}>
              Administrator privileges are required to access this screen.
            </p>
            <button
              type="button"
              style={styles.staffActionButton}
              onClick={() => setScreen("staff")}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          {renderAccountMenu()}
          <button
            type="button"
            style={styles.backButton}
            onClick={() => setScreen("settings")}
          >
            ← Settings
          </button>

          <div
            style={{
              display: "grid",
              gap: "20px",
            }}
          >
            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                General Settings
              </h2>

              {/* Site Title */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Site Title</label>
                <input
                  style={styles.input}
                  value={editingSettings.site_title ?? ""}
                  onChange={(e) =>
                    setEditingSettings({
                      ...editingSettings,
                      site_title: e.target.value,
                    })
                  }
                />
                <p
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: theme.textSecondary,
                  }}
                >
                  Shown in the browser tab. Example: PBC Guest Kiosk
                </p>
              </div>

              {/* Theme */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Theme</label>
                <select
                  style={styles.input}
                  value={editingSettings.theme}
                  onChange={(e) =>
                    setEditingSettings({
                      ...editingSettings,
                      theme: e.target.value,
                    })
                  }
                >
                  {Object.keys(allThemes).map((themeName) => (
                    <option key={themeName} value={themeName}>
                      {themeName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Auto Refresh */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Auto Refresh Seconds</label>
                <input
                  type="number"
                  style={styles.input}
                  value={editingSettings.auto_refresh_seconds}
                  onChange={(e) =>
                    setEditingSettings({
                      ...editingSettings,
                      auto_refresh_seconds: Number(e.target.value),
                    })
                  }
                />
              </div>
              
              {/* Base Check-in URL */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Base Check-in URL</label>
                <input
                  style={styles.input}
                  value={editingSettings.base_checkin_url}
                  onChange={(e) =>
                    setEditingSettings({
                      ...editingSettings,
                      base_checkin_url: e.target.value,
                    })
                  }
                />
                <p
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: theme.textSecondary,
                  }}
                >
                  Example: http://192.168.0.210:5173
                </p>
              </div>
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Security
              </h2>

              {/* Account lockout threshold */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>
                  Failed Logins Before Lockout
                </label>
                <input
                  type="number"
                  min="0"
                  style={styles.input}
                  value={editingSettings.login_lockout_threshold ?? 5}
                  onChange={(e) =>
                    setEditingSettings({
                      ...editingSettings,
                      login_lockout_threshold: Number(e.target.value),
                    })
                  }
                />
                <p
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: theme.textSecondary,
                  }}
                >
                  Consecutive failed sign-ins before an account is locked. Set
                  to 0 to disable lockout.
                </p>
              </div>

              {/* Account lockout duration */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Lockout Duration (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  style={styles.input}
                  value={editingSettings.login_lockout_minutes ?? 15}
                  onChange={(e) =>
                    setEditingSettings({
                      ...editingSettings,
                      login_lockout_minutes: Number(e.target.value),
                    })
                  }
                />
                <p
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: theme.textSecondary,
                  }}
                >
                  How long a locked account stays locked before it can sign in
                  again.
                </p>
              </div>
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Visitor
              </h2>

              {/* Visitor Types */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Types</label>

                {editingSettings.visitor_types.map((type, index) => (
                  <div
                    key={index}
                    style={styles.settingsListRow}
                  >
                    <input
                      style={styles.input}
                      value={type}
                      onChange={(e) => {
                        const updated = [...editingSettings.visitor_types];
                        updated[index] = e.target.value;

                        setEditingSettings({
                          ...editingSettings,
                          visitor_types: updated,
                        });
                      }}
                    />

                    <button
                      type="button"
                      style={styles.settingsDeleteButton}
                      onClick={() =>
                        setEditingSettings({
                          ...editingSettings,
                          visitor_types: editingSettings.visitor_types.filter(
                            (_, i) => i !== index
                          ),
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  style={styles.settingsAddButton}
                  onClick={() =>
                    setEditingSettings({
                      ...editingSettings,
                      visitor_types: [
                        ...editingSettings.visitor_types,
                        "",
                      ],
                    })
                  }
                >
                  Add Visitor Type
                </button>
              </div>
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Visit
              </h2>

              {/* Visit Purposes */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Purposes</label>

                {editingSettings.visit_purposes.map((purpose, index) => (
                  <div
                    key={index}
                    style={styles.settingsListRow}
                  >
                    <input
                      style={styles.input}
                      value={purpose}
                      onChange={(e) => {
                        const updated = [...editingSettings.visit_purposes];
                        updated[index] = e.target.value;

                        setEditingSettings({
                          ...editingSettings,
                          visit_purposes: updated,
                        });
                      }}
                    />

                    <button
                      type="button"
                      style={styles.settingsDeleteButton}
                      onClick={() =>
                        setEditingSettings({
                          ...editingSettings,
                          visit_purposes: editingSettings.visit_purposes.filter(
                            (_, i) => i !== index
                          ),
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  style={styles.settingsAddButton}
                  onClick={() =>
                    setEditingSettings({
                      ...editingSettings,
                      visit_purposes: [
                        ...editingSettings.visit_purposes,
                        "",
                      ],
                    })
                  }
                >
                  Add Visit Purpose
                </button>
              </div>

            </div>

            {/* Required Check-in Fields */}        
            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Initial Check-in
              </h2>

              {/* Required Check-In Fields */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>
                  Required Check-in Fields
                </label>

                {editingSettings.required_checkin_fields.map(
                  (field, index) => (
                    <div
                      key={index}
                      style={styles.settingsListRow}
                    >
                      <input
                        style={styles.input}
                        value={field}
                        onChange={(e) => {
                          const updated = [
                            ...editingSettings.required_checkin_fields,
                          ];

                          updated[index] = e.target.value;

                          setEditingSettings({
                            ...editingSettings,
                            required_checkin_fields: updated,
                          });
                        }}
                      />

                      <button
                        type="button"
                        style={styles.settingsDeleteButton}
                        onClick={() =>
                          setEditingSettings({
                            ...editingSettings,
                            required_checkin_fields:
                              editingSettings.required_checkin_fields.filter(
                                (_, i) => i !== index
                              ),
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  )
                )}

                <button
                  type="button"
                  style={styles.settingsAddButton}
                  onClick={() =>
                    setEditingSettings({
                      ...editingSettings,
                      required_checkin_fields: [
                        ...editingSettings.required_checkin_fields,
                        "",
                      ],
                    })
                  }
                >
                  Add Required Check-in Field
                </button>
              </div>

            </div>

            {/* Returning Visitor Fields */}
            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Returning Check-in
              </h2>

              {/* Required Returning Fields */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>
                  Required Returning Check-in Fields
                </label>

                {editingSettings.required_returning_checkin_fields.map(
                  (field, index) => (
                    <div
                      key={index}
                      style={styles.settingsListRow}
                    >
                      <input
                        style={styles.input}
                        value={field}
                        onChange={(e) => {
                          const updated = [
                            ...editingSettings.required_returning_checkin_fields,
                          ];

                          updated[index] = e.target.value;

                          setEditingSettings({
                            ...editingSettings,
                            required_returning_checkin_fields: updated,
                          });
                        }}
                      />

                      <button
                        type="button"
                        style={styles.settingsDeleteButton}
                        onClick={() =>
                          setEditingSettings({
                            ...editingSettings,
                            required_returning_checkin_fields:
                              editingSettings.required_returning_checkin_fields.filter(
                                (_, i) => i !== index
                              ),
                          })
                        }
                      >
                        Delete
                      </button>
                    </div>
                  )
                )}

                <button
                  type="button"
                  style={styles.settingsAddButton}
                  onClick={() =>
                    setEditingSettings({
                      ...editingSettings,
                      required_returning_checkin_fields: [
                        ...editingSettings.required_returning_checkin_fields,
                        "",
                      ],
                    })
                  }
                >
                  Add Required Returning Field
                </button>
              </div>
          </div>

          {/* Save and Cancel Buttons */}
          <div style={styles.resultCard}>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <button
                style={styles.staffActionButton}
                onClick={handleSaveSettings}
              >
                Save Settings
              </button>

              <button
                style={styles.staffActionButton}
                onClick={() => setScreen("settings")}
              >
                Cancel
              </button>
            </div>
          </div>

        </div>
      </div>
    )
  }

  // Help Screen
  if (screen === "help") {
    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}

        <button
          style={styles.backButton}
          onClick={() => setScreen("staff")}
        >
          ← Staff Dashboard
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "1200px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <h1
            style={{
              textAlign: "center",
              marginBottom: "12px",
              color: theme.textPrimary,
            }}
          >
            Guest Kiosk Help
          </h1>

          <p style={styles.instructions}>
            Operational documentation for camp staff, registration teams,
            and administrators.
          </p>

          <div
            style={{
              display: "grid",
              gap: "20px",
            }}
          >
            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                System Overview
              </h2>

              <div style={styles.helpContent}>
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  The Guest Kiosk system is used to check visitors into
                  camp, print visitor badges, maintain visitor history,  
                  generate QR codes, and manage badge printing throughout
                  the property.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Staff members primarily use Check-In, Visitor Search,
                  Check-Out, Reporting, and Badge Reprint functions.
                </p>
              </div>              
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                User Roles
              </h2>

              <h3>Visitor</h3>

              <div style={styles.helpContent}>              
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  A visitor is any person being checked into camp.
                </p>
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Examples include parents, vendors, volunteers,
                  maintenance personnel, guests, and church visitors.
                </p>

                <h3>Check-In Staff</h3>
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Check-In Staff can:
                </p>

                <ul style={styles.helpList}>
                  <li>Check visitors in</li>
                  <li>Check visitors out</li>
                  <li>Search for visitors</li>
                  <li>View visitor details</li>
                  <li>Reprint badges</li>
                  <li>View reports</li>
                </ul>

                <h3>Administrator</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Administrators have full access to the system.
                </p>

                <ul style={styles.helpList}>
                  <li>Create and manage users</li>
                  <li>Reset passwords</li>
                  <li>Configure print stations</li>
                  <li>Manage print agents</li>
                  <li>Modify system settings</li>
                  <li>Generate QR codes</li>
                  <li>View and manage print queues</li>
                </ul>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Administrator accounts should only be assigned
                  to trusted camp leadership and technical staff.
                </p>
              </div>
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Printing Architecture
              </h2>

              <div style={styles.helpContent}>
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  The printing system consists of three parts:
                </p>

                <ol style={styles.helpList}>
                  <li>Print Stations</li>
                  <li>Print Agents</li>
                  <li>Print Queue</li>
                </ol>

                <h3>Print Stations</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  A Print Station is a logical destination where badges
                  should print.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Examples:
                </p>

                <ul style={styles.helpList}>
                  <li>Dining Hall</li>
                  <li>Front Gate</li>
                  <li>Upper Room</li>
                  <li>Registration Center</li>
                </ul>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  A Print Station is NOT a printer.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  It represents the location where badges should be routed.
                </p>

                <h3>Print Agents</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  A Print Agent is software running on a Raspberry Pi
                  or computer attached to a physical printer.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Print Agents:
                </p>

                <ul style={styles.helpList}>
                  <li>Receive print jobs</li>
                  <li>Print badges</li>
                  <li>Report online status</li>
                  <li>Communicate with the kiosk server</li>
                </ul>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  If a Print Agent is offline, printing will stop even if
                  the Print Station still exists.
                </p>

                <h3>Print Queue</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Every badge enters the Print Queue before printing.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Lifecycle:
                </p>

                <pre
                  style={{
                    backgroundColor: theme.surfaceSecondary,
                    padding: "16px",
                    borderRadius: "12px",
                    overflowX: "auto",
                  }}
                >
    {`Visitor Check-In
  ↓
    Badge Generated
  ↓
    Print Queue
  ↓
    Print Agent
  ↓
    Printer`}
                </pre>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Administrators can review:
                </p>

                <ul style={styles.helpList}>
                  <li>Pending jobs</li>
                  <li>Completed jobs</li>
                  <li>Failed jobs</li>
                </ul>
              </div>
            </div>


            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Print Stations and Slugs
              </h2>

              <div style={styles.helpContent}>
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Every Print Station includes a unique slug.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Example:
                </p>

                <pre
                  style={{
                    backgroundColor: theme.surfaceSecondary,
                    padding: "16px",
                    borderRadius: "12px",
                  }}
                >
    {`Station Name: Dining Hall
    Slug: dining-hall`}
                </pre>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Slugs are used for:
                </p>

                <ul style={styles.helpList}>
                  <li>QR codes</li>
                  <li>Kiosk routing</li>
                  <li>Print routing</li>
                </ul>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Slugs should be unique and generally should not be changed
                  after deployment.
                </p>
              </div>
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                QR Codes
              </h2>

              <div style={styles.helpContent}>
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Each Print Station can generate its own QR code.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  When a visitor scans the QR code, the kiosk automatically
                  routes check-ins to the correct station.
                </p>

                <pre
                  style={{
                    backgroundColor: theme.surfaceSecondary,
                    padding: "16px",
                    borderRadius: "12px",
                  }}
                >
    {`Dining Hall QR
  ↓
    station=dining-hall
  ↓
    Badge routed to Dining Hall printer`}
                </pre>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  After changing station slugs or the Base Check-In URL,
                  QR codes should be regenerated.
                </p>
              </div>
            </div>


            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                System Settings
              </h2>

              <h3>Theme</h3>

              <div style={styles.helpContent}>
                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Themes control the appearance and branding of the system.
                </p>

                <h3>Auto Refresh Seconds</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Controls how often dashboards automatically refresh.
                </p>

                <ul style={styles.helpList}>
                  <li>Lower values = more frequent updates</li>
                  <li>Higher values = less server activity</li>
                </ul>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Recommended: 5 seconds
                </p>

                <h3>Base Check-In URL</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Used when generating QR codes.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  If this value changes, QR codes should be regenerated.
                </p>

                <h3>Visitor Types</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Examples:
                </p>

                <ul style={styles.helpList}>
                  <li>Parent</li>
                  <li>Guest</li>
                  <li>Volunteer</li>
                  <li>Vendor</li>
                  <li>Staff</li>
                </ul>

                <h3>Visit Purposes</h3>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Defines the reason a visitor is on campus.
                </p>

                <p style={{
                  maxWidth: "800px",
                  margin: "0 auto 16px auto",
                  textAlign: "center",
                }}>
                  Examples:
                </p>

                <ul style={styles.helpList}>
                  <li>Visiting Camper</li>
                  <li>Dinner</li>
                  <li>Family Night</li>
                  <li>Awards Ceremony</li>
                  <li>Talent Show</li>
                  <li>Vendor Delivery</li>
                  <li>Service Call</li>
                  <li>Other</li>
                </ul>

              </div>
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Common Problems
              </h2>


              <div style={styles.helpContent}>
                <h3>Badge Not Printing</h3>

                <ol style={styles.helpList}>
                  <li>Verify Print Station is enabled</li>
                  <li>Verify Print Agent is online</li>
                  <li>Verify printer is powered on</li>
                  <li>Review Print Queue for failed jobs</li>
                </ol>

                <h3>Visitor Cannot Check In</h3>

                <ol style={styles.helpList}>
                  <li>Verify required fields are completed</li>
                  <li>Verify camera/photo requirements</li>
                  <li>Verify network connectivity</li>
                </ol>

                <h3>QR Code Routes To Wrong Printer</h3>

                <ol style={styles.helpList}>
                  <li>Verify Print Station slug</li>
                  <li>Verify QR code was regenerated</li>
                  <li>Verify Base Check-In URL</li>
                </ol>
              </div>
            </div>

            <div style={styles.resultCard}>
              <h2 style={styles.settingsSectionTitle}>
                Operational Best Practices
              </h2>

              <div style={styles.helpContent}>
                <ul style={styles.helpList}>
                  <li>Use individual staff accounts</li>
                  <li>Do not share Administrator accounts</li>
                  <li>Test badge printing before major events</li>
                  <li>Monitor Print Queue during registration</li>
                  <li>Check Print Agent status daily</li>
                  <li>Keep a backup printer available</li>
                  <li>Review failed print jobs regularly</li>
                  <li>Regenerate QR codes after major routing changes</li>
                </ul>
              </div>
            </div>            
          </div>
        </div>
      </div>
    );
  }  

  // My Profile Screen
  if (screen === "my-profile") {
    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}

        <button
          type="button"
          style={styles.backButton}
          onClick={() => setScreen("staff")}
        >
          ← Staff Dashboard
        </button>

        <div
          style={{
            width: "100%",
            maxWidth: "700px",
            margin: "0 auto",
            paddingTop: "80px",
          }}
        >
          <div style={styles.formContainer}>
            <h1 style={styles.formTitle}>My Profile</h1>

            <p style={styles.instructions}>
              Update your display name and email address.
            </p>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Username</label>
              <input
                style={{
                  ...styles.input,
                  opacity: 0.75,
                  cursor: "not-allowed",
                }}
                value={profileUser?.username || username || ""}
                disabled
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Role</label>
              <input
                style={{
                  ...styles.input,
                  opacity: 0.75,
                  cursor: "not-allowed",
                }}
                value={profileUser?.role || role || ""}
                disabled
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Display Name</label>
              <input
                style={styles.input}
                value={profileForm.display_name}
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    display_name: event.target.value,
                  })
                }
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                value={profileForm.email}
                onChange={(event) =>
                  setProfileForm({
                    ...profileForm,
                    email: event.target.value,
                  })
                }
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "24px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                style={styles.staffActionButton}
                onClick={handleSaveMyProfile}
              >
                Save Profile
              </button>

              <button
                type="button"
                style={styles.staffActionButton}
                onClick={() => setScreen("staff")}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Print Agents Screen
  if (screen === "print-agents") {
    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}
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
            boxSizing: "border-box",
          }}
        >
          <h1
            style={{
              color: theme.textPrimary,
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
                "repeat(auto-fill, minmax(300px, 1fr))",
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
                  <strong>Status:</strong>{" "}
                  {agent.enabled ? "Approved" : "Pending Approval"}
                </div>

                <div>
                  <strong>Last Seen:</strong>{" "}
                  {agent.last_seen
                    ? new Date(agent.last_seen).toLocaleString()
                    : "Never"}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    marginTop: "16px",
                  }}
                >
                  <button
                    style={styles.staffActionButton}
                    onClick={() =>
                      handleSetAgentEnabled(agent, !agent.enabled)
                    }
                  >
                    {agent.enabled ? "Disable Agent" : "Approve Agent"}
                  </button>

                  <button
                    style={styles.staffActionButton}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setAssignStationId(
                        agent.station_id ? String(agent.station_id) : ""
                      );
                      setShowAssignAgentModal(true);
                    }}
                  >
                    Assign Station
                  </button>

                  <button
                    style={styles.staffActionButton}
                    onClick={() => handlePrintAgentTest(agent)}
                  >
                    Print Test Label
                  </button>

                  <button
                    style={{
                      ...styles.staffActionButton,
                      backgroundColor: "#8B1E1E",
                    }}
                    onClick={() => handleDeleteAgent(agent)}
                  >
                    Remove Agent
                  </button>

                </div>

              </div>
            ))}
          </div>

          {showAssignAgentModal && selectedAgent && (
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
                <h2>Assign Station - {selectedAgent.hostname}</h2>

                <select
                  style={styles.input}
                  value={assignStationId}
                  onChange={(event) =>
                    setAssignStationId(event.target.value)
                  }
                >
                  <option value="">Unassigned</option>

                  {printStations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>

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
                        await assignPrintAgent(
                          selectedAgent.id,
                          assignStationId
                            ? Number(assignStationId)
                            : null
                        );

                        await loadPrintAgents();

                        setShowAssignAgentModal(false);
                        setSelectedAgent(null);
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
                      setShowAssignAgentModal(false);
                      setSelectedAgent(null);
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

    const visiblePrintJobs = showCompletedJobs
      ? printJobs
      : printJobs.filter(
          (job) => job.status !== "Completed"
        );
        
    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}
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
            paddingLeft: isMobile ? "12px" : "0",
            paddingRight: isMobile ? "12px" : "0",
            boxSizing: "border-box"
          }}
        >
          <h1
            style={{
              color: theme.textPrimary,
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Print Queue
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
              ? "repeat(2, 1fr)"
              : "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
          
            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{pendingJobs}</h2>
              <p>Pending</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{printingJobs}</h2>
              <p>Printing</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{completedJobs}</h2>
              <p>Completed</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{failedJobs}</h2>
              <p>Failed</p>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
              ? "repeat(2, 1fr)"
              : "repeat(4, 1fr)",
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
              onClick={() =>
                setShowCompletedJobs(!showCompletedJobs)
              }
            >
              {showCompletedJobs
                ? "Hide Completed"
                : `Show ${completedJobs} Completed`}
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
                "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            {visiblePrintJobs.map((job) => {
              const expanded = !!expandedJobIds[job.id];
              const issueCount = Array.isArray(job.attention_reasons)
                ? job.attention_reasons.length
                : 0;
              const statusColor =
                job.status === "Completed"
                  ? theme.success
                  : job.status === "Failed"
                    ? theme.danger
                    : theme.primary;
              return (
              <div
                key={job.id}
                style={{
                  backgroundColor: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "16px",
                  padding: "20px",
                }}
              >
                {/* Compact header — always visible, uniform height */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "8px",
                  }}
                >
                  <h3 style={{ margin: 0 }}>{job.visitor_name}</h3>
                  <span
                    style={{ color: theme.textSecondary, fontSize: "0.8rem" }}
                  >
                    #{job.id}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: "8px",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: statusColor, fontWeight: "bold" }}>
                    {job.status}
                  </span>
                  {typeof job.age_seconds === "number" && (
                    <span
                      style={{ color: theme.textSecondary, fontSize: "0.85rem" }}
                    >
                      · {formatJobAge(job.age_seconds)}
                    </span>
                  )}
                  {job.attention && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        color: "#fff",
                        backgroundColor:
                          job.attention_level === "critical"
                            ? theme.danger
                            : theme.warning || "#b8860b",
                      }}
                    >
                      {job.attention_level === "critical"
                        ? "Needs attention"
                        : "Check"}
                    </span>
                  )}
                  {issueCount > 0 && (
                    <span
                      style={{ color: theme.textSecondary, fontSize: "0.8rem" }}
                    >
                      {issueCount} issue{issueCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpandedJobIds((current) => ({
                      ...current,
                      [job.id]: !current[job.id],
                    }))
                  }
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: theme.primary,
                    fontSize: "0.85rem",
                    fontWeight: "bold",
                  }}
                >
                  {expanded ? "Hide details ▾" : "Details ▸"}
                </button>

                {/* Expanded diagnostics — progressive disclosure (all fields preserved) */}
                {expanded && (
                  <div style={{ marginTop: "10px" }}>
                    <p>
                      <strong>Visitor Type:</strong> {job.visitor_type}
                    </p>

                    <p>
                      <strong>Station:</strong>{" "}
                      {job.station_name || "Unknown"}
                    </p>

                    {Array.isArray(job.attention_reasons) &&
                      job.attention_reasons.length > 0 && (
                        <ul
                          style={{
                            margin: "0 0 8px 0",
                            paddingLeft: "18px",
                            color:
                              job.attention_level === "critical"
                                ? theme.danger
                                : theme.textSecondary,
                            fontSize: "0.85rem",
                          }}
                        >
                          {job.attention_reasons.map((reason, index) => (
                            <li key={index}>{reason}</li>
                          ))}
                        </ul>
                      )}

                    <div style={{ marginBottom: "8px" }}>
                      <strong>Printer:</strong>{" "}
                      {job.printer_name || "Unknown"}
                    </div>

                    {job.status !== "Completed" && (
                      <p>
                        <strong>Station Health:</strong>{" "}
                        <span
                          style={{
                            color: job.station_online
                              ? theme.success
                              : theme.danger,
                            fontWeight: "bold",
                          }}
                        >
                          {job.station_status || "unknown"}
                        </span>
                      </p>
                    )}

                    {(job.attempt_count ?? 0) > 0 && (
                      <p>
                        <strong>Attempts:</strong> {job.attempt_count}
                      </p>
                    )}

                    {job.agent_hostname && (
                      <p>
                        <strong>Agent:</strong> {job.agent_hostname}
                      </p>
                    )}

                    {job.last_recovery_reason && (
                      <p style={{ color: theme.textSecondary }}>
                        <strong>Last Recovery:</strong>{" "}
                        {job.last_recovery_reason}
                      </p>
                    )}

                    {job.error_message && (
                      <p style={{ color: theme.danger }}>
                        <strong>Error:</strong> {job.error_message}
                      </p>
                    )}

                    <p>
                      <strong>Created:</strong>{" "}
                      {new Date(job.created_time).toLocaleString()}
                    </p>

                    {job.completed_time && (
                      <p>
                        <strong>Completed:</strong>{" "}
                        {new Date(job.completed_time).toLocaleString()}
                      </p>
                    )}

                    {job.status === "Pending" && (
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          alignItems: "center",
                          marginTop: "12px",
                        }}
                      >
                        <select
                          style={styles.input}
                          value={redirectStationByJob[job.id] || ""}
                          onChange={(event) =>
                            setRedirectStationByJob((current) => ({
                              ...current,
                              [job.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Redirect to station…</option>
                          {printStations
                            .filter((station) => station.enabled)
                            .map((station) => (
                              <option key={station.id} value={station.id}>
                                {station.name}
                              </option>
                            ))}
                        </select>

                        <button
                          style={styles.staffActionButton}
                          onClick={() => handleRedirectPrintJob(job)}
                        >
                          Redirect
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions — always visible, uniform across all jobs */}
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
              );
            })}
          </div>
        </div>

      </div>
    );
  }

  // Print Stations Screen
  if (screen === "print-stations") {
    const activeStations = printStations.filter(
      (station) => station.enabled
    ).length;

    const maintenanceStations = printStations.filter(
      (station) => !station.enabled
    ).length;

    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}
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
            boxSizing: "border-box",
          }}
        >
          <h1
            style={{
              color: theme.textPrimary,
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Print Stations
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
              ? "repeat(1, 1fr)"
              : "repeat(3, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{printStations.length}</h2>
              <p>Total Stations</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{activeStations}</h2>
              <p>Active</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{maintenanceStations}</h2>
              <p>Maintenance</p>
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
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            {printStations.map((station) => {
              const assignedAgents =
                getAssignedAgentsForStation(station);

              const onlineAgents =
                assignedAgents.filter((agent) =>
                  isAgentOnline(agent)
                );

              const stationStatus =
                getPrintStationStatus(station);

              return (
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

                  <div style={{ marginBottom: "10px" }}>
                    <strong>Status:</strong>{" "}
                    <span
                      style={{
                        color: stationStatus.color,
                        fontWeight: "bold",
                      }}
                    >
                      {stationStatus.label}
                    </span>
                  </div>

                  <div style={{ marginBottom: "10px" }}>
                    <strong>Slug:</strong>{" "}
                    {station.slug}
                  </div>

                  <div style={{ marginBottom: "10px" }}>
                    <strong>Assigned Agents:</strong>{" "}
                    {assignedAgents.length}
                  </div>

                  <div style={{ marginBottom: "10px" }}>
                    <strong>Online Agents:</strong>{" "}
                    {onlineAgents.length}
                  </div>

                  {(() => {
                    const level = station.attention_level || "none";
                    const badgeColor =
                      level === "critical"
                        ? theme.danger
                        : level === "warn"
                          ? "#b8860b"
                          : theme.success;
                    const stateLabel = (
                      station.operational_state || "healthy"
                    ).toUpperCase();
                    return (
                      <div
                        style={{
                          marginTop: "12px",
                          marginBottom: "10px",
                          padding: "12px",
                          borderRadius: "12px",
                          border: `1px solid ${theme.border}`,
                          backgroundColor:
                            level === "none" ? "transparent" : `${badgeColor}14`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              backgroundColor: badgeColor,
                              color: "#fff",
                              borderRadius: "999px",
                              padding: "2px 10px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {stateLabel}
                          </span>
                          <span style={{ fontSize: "13px", color: theme.text }}>
                            {station.summary}
                          </span>
                        </div>

                        {station.recommended_action && (
                          <div
                            style={{
                              marginTop: "8px",
                              fontSize: "12px",
                              fontWeight: "bold",
                              color: badgeColor,
                            }}
                          >
                            → {station.recommended_action}
                          </div>
                        )}

                        {(station.pending_jobs > 0 ||
                          station.failed_jobs > 0 ||
                          (station.attention &&
                            Array.isArray(station.attention_reasons) &&
                            station.attention_reasons.length > 0)) && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStationIds((current) => ({
                                  ...current,
                                  [station.id]: !current[station.id],
                                }))
                              }
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                marginTop: "8px",
                                cursor: "pointer",
                                color: theme.primary,
                                fontSize: "12px",
                                fontWeight: "bold",
                              }}
                            >
                              {expandedStationIds[station.id]
                                ? "Hide details ▾"
                                : "Details ▸"}
                            </button>

                            {expandedStationIds[station.id] && (
                              <>
                                {(station.pending_jobs > 0 ||
                                  station.failed_jobs > 0) && (
                                  <div
                                    style={{
                                      marginTop: "8px",
                                      fontSize: "12px",
                                      color: theme.textSecondary,
                                    }}
                                  >
                                    {station.pending_jobs} pending ·{" "}
                                    {station.failed_jobs} failed
                                  </div>
                                )}

                                {station.attention &&
                                  Array.isArray(station.attention_reasons) &&
                                  station.attention_reasons.length > 0 && (
                                    <ul
                                      style={{
                                        margin: "8px 0 0 0",
                                        paddingLeft: "18px",
                                        fontSize: "12px",
                                        color: theme.text,
                                      }}
                                    >
                                      {station.attention_reasons.map(
                                        (reason, idx) => (
                                          <li key={idx}>{reason}</li>
                                        )
                                      )}
                                    </ul>
                                  )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}

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
                      onClick={() =>
                        handleDeletePrintStation(station)
                      }
                    >
                      Delete
                    </button>

                    <button
                      style={{
                        ...styles.staffActionButton,
                        backgroundColor: station.enabled
                          ? "#f59e0b"
                          : theme.success,
                      }}
                      onClick={async () => {
                        const action = station.enabled
                          ? "put into maintenance mode"
                          : "restore to active service";

                        const confirmed = window.confirm(
                          `Are you sure you want to ${action} for '${station.name}'?`
                        );

                        if (!confirmed) {
                          return;
                        }

                        try {
                          await updatePrintStation(station.id, {
                            name: station.name,
                            slug: station.slug,
                            print_server_host:
                              station.print_server_host || "",
                            enabled: !station.enabled,
                          });

                          await loadPrintStations();
                          await loadPrintAgents();
                        } catch (error) {
                          console.error(error);
                          alert(error.message);
                        }
                      }}
                    >
                      {station.enabled
                        ? "Maintenance Mode"
                        : "Restore"}
                    </button>

                    <button
                      style={styles.staffActionButton}
                      onClick={() => handlePrintStationQrLabel(station)}
                    >
                      Print QR Code
                    </button>

                    <button
                      style={styles.staffActionButton}
                      onClick={() => downloadPrintStationQr(station.id)}
                    >
                      Download QR Code
                    </button>

                  </div>
                </div>
              );
            })}
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
                      onChange={(e) => {
                        const name = e.target.value;

                        setNewPrintStation({
                          ...newPrintStation,
                          name,
                          slug: editingPrintStation
                            ? newPrintStation.slug
                            : name
                                .toLowerCase()
                                .replace(/[^a-z0-9 ]/g, "")
                                .trim()
                                .replace(/\s+/g, "-"),
                        });
                      }}
                    />
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>
                      Station Slug
                    </label>

                  <input
                    style={styles.input}
                    value={newPrintStation.slug}
                    onChange={(e) => {
                      const slug = e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .replace(/\s+/g, "-");

                      setNewPrintStation({
                        ...newPrintStation,
                        slug,
                      });
                    }}
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
                      <option value="true">Active</option>
                      <option value="false">Maintenance Mode</option>
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
                          if (!/^[a-z0-9-]+$/.test(newPrintStation.slug)) {
                            alert(
                              "Station slug may only contain lowercase letters, numbers, and hyphens."
                            );
                            return;
                          }
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

  // Reporting Screen
  if (screen === "reporting") {
    const report = mapReportingSummary(reportingSummary);

    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}
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
            paddingLeft: isMobile ? "12px" : "0",
            paddingRight: isMobile ? "12px" : "0",
            boxSizing: "border-box",
          }}
        >
          <h1
            style={{
              color: theme.textPrimary,
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            Reporting
          </h1>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "24px",
            }}
          >
            <button
              style={styles.staffActionButton}
              onClick={loadReportingSummary}
            >
              Refresh Reporting
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            <div style={styles.resultCard}>
              <h2 style={{ color: theme.textSecondary }}>Check-ins by Location</h2>

              {report.check_ins_by_location.length === 0 ? (
                <p>No check-ins by location found.</p>
              ) : (
                report.check_ins_by_location.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))
              )}
            </div>

            <div style={styles.resultCard}>
              <h2 style={{ color: theme.textSecondary }}>Recent Arrivals</h2>

              {report.recent_arrivals.length === 0 ? (
                <p>No recent arrivals found.</p>
              ) : (
                report.recent_arrivals.map((arrival) => (
                  <div
                    key={arrival.id}
                    style={{
                      borderBottom: `1px solid ${theme.border}`,
                      paddingBottom: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <strong>{arrival.visitor_name}</strong>

                    <div
                      style={{
                        color: theme.textSecondary,
                      }}
                    >
                      {arrival.visitor_type}
                      {" • "}
                      {arrival.station_name || "Unknown Station"}
                      {" • "}
                      {new Date(arrival.check_in_time).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={styles.resultCard}>
              <h2 style={{ color: theme.textSecondary }}>Visitor Types</h2>

              {report.visitorTypes.length === 0 ? (
                <p>No visitor type data found.</p>
              ) : (
                report.visitorTypes.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))
              )}
            </div>

            <div style={styles.resultCard}>
              <h2 style={{ color: theme.textSecondary }}>Hourly Activity</h2>

              {report.hourly_activity.every((item) => item.count === 0) ? (
                <p>No hourly activity found for today.</p>
              ) : (
                report.hourly_activity
                  .filter((item) => item.count > 0)
                  .map((item) => (
                    <div
                      key={item.hour}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <span>{item.label}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))
              )}
            </div>

            <div style={styles.resultCard}>
              <h2 style={{ color: theme.textSecondary }}>Daily Trends</h2>

              {report.daily_trends.map((item) => (
                <div
                  key={item.date}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                  }}
                >
                  <span>{new Date(`${item.date}T00:00:00`).toLocaleDateString()}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>

            <div style={styles.resultCard}>
              <h2 style={{ color: theme.textSecondary }}>Print Station Usage</h2>

              {report.print_station_usage.length === 0 ? (
                <p>No print station usage found.</p>
              ) : (
                report.print_station_usage.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))
              )}
            </div>

            <div style={styles.resultCard}>
              <h2 style={{ color: theme.textSecondary }}>Peak Check-In Times</h2>

              {report.peak_check_in_times.length === 0 ? (
                <p>No peak check-in times found for today.</p>
              ) : (
                report.peak_check_in_times.map((item) => (
                  <div
                    key={item.hour}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))
              )}
            </div>
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
        {renderVersionFooter()}
        {renderAccountMenu()}

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
          onClick={handleLeaveReturningCheckin}
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
                  {visitorTypes.map((visitorTypeOption) => (
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
                  {visitPurposes.map((purposeOption) => (
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
                onClick={() =>
                  openCamera("returning", "returningPhotoInput")
                }
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
              onClick={() => {handlePrintReturningBadge()}}
              disabled={!checkedInVisitorId || busy}
            >
              {busy ? "Printing..." : "Print Visitor Badge"}

            </button>
          </div>

        </div>

        {/* Super Important Camera Code */}
        {renderCameraModal()}

      </div>
    );
  }

  // Settings Screen
  if (screen === "settings") {
    return (
      <div style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}
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
                ...styles.screenTitle
              }}
            >
              Settings
            </h1>

          {/* This button only for admins */}
          {role === "Administrator" && (
            <button
              style={styles.staffActionButton}
              onClick={() => setScreen("edit-settings")}
            >
              Edit System Settings
            </button>
          )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(450px, 1fr))",
                gap: "20px",
              }}
            >

              <div style={styles.resultCard}>
                <h2 style={{ color: theme.textSecondary }}>System</h2>

                <p
                  style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
                >
                  <strong>Built-in Themes:</strong>{" "}
                  <code>frontend/src/constants/themes.js</code> (read-only)
                </p>

                <p
                  style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
                >
                  <strong>User-Created Themes:</strong> stored on the server in{" "}
                  <code>backend/config/user_themes.json</code> and served via the{" "}
                  <code>/api/themes</code> API
                </p>


                <p>
                  <strong>Site Title:</strong>{" "}
                  {systemSettings?.site_title ?? "PBC Guest Kiosk"}
                </p>

                <p>
                  <strong>Theme:</strong> {systemSettings?.theme ?? "Unknown"}
                </p>

                <p>
                  <strong>Auto Refresh:</strong>{" "}
                  {systemSettings?.auto_refresh_seconds ?? 5} Seconds
                </p>

                <p>
                  <strong>Authentication:</strong> Database / JWT
                </p>
              </div>

              <div style={styles.resultCard}>
                <h2 style={{ color: theme.textSecondary }}>Visitor Types</h2>

                <p
                  style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
                >
                  <strong>Source:</strong> <code>backend/config/system_settings.json</code>
                </p>

                {visitorTypes.map((type) => (
                  <div key={type}>
                    • {type}
                  </div>
                ))}
              </div>

              <div style={styles.resultCard}>
                <h2 style={{ color: theme.textSecondary }}>Visit Purposes</h2>

                <p
                  style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
                >
                  <strong>Source:</strong> <code>backend/config/system_settings.json</code>
                </p>

                {visitPurposes.map((purpose) => (
                  <div key={purpose}>
                    • {purpose}
                  </div>
                ))}
              </div>

              <div style={styles.resultCard}>
                <h2 style={{ color: theme.textSecondary }}>Required Check-In Fields</h2>

                <p
                  style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
                >
                  <strong>Source:</strong> <code>backend/config/system_settings.json</code>
                </p>

                {requiredCheckinFields.map((field) => (
                  <div key={field}>
                    • {field}
                  </div>
                ))}
              </div>

              <div style={styles.resultCard}>
                <h2 style={{ color: theme.textSecondary }}>Required Returning Visitor Fields</h2>

                <p
                  style={{paddingBottom: "8px", fontSize: "14px", color: theme.textSecondary}}
                >
                  <strong>Source:</strong> <code>backend/config/system_settings.json</code>
                </p>

                {requiredReturningCheckinFields.map((field) => (
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

    const checkedInToday = activeVisitors.filter((visitor) => {
    const checkin = new Date(visitor.check_in_time);
    const now = new Date();

    return (
      checkin.getFullYear() === now.getFullYear() &&
      checkin.getMonth() === now.getMonth() &&
      checkin.getDate() === now.getDate()
    );
    }).length;
    const stationHealthSummary = "TBD";
    const queueHealthSummary = "TBD";


  // Staff Screen
  if (screen === "staff") {
    if (!isAuthenticated) {
      return (
        <div style={styles.page}>
          {renderVersionFooter()}
          {renderAccountMenu()}

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
              type="button"
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
        {renderVersionFooter()}
        {renderAccountMenu()}

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
          type="button"
          style={styles.backButton}
          onClick={() => navigateTo("home")}
        >
          ← Home
        </button>

        <div style={styles.formContainer}>
          <h1 style={{ color: theme.textPrimary }}>
            {/* Staff Dashboard */}
            Staff Dashboard
            </h1>

          {/* Dashboard Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
              ? "repeat(2, 1fr)"
              : "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "24px",
              marginTop: "48px",
            }}
          >
            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{dashboardStats?.active_visitors ?? 0}</h2>
              <h2 style={{ color: theme.textSecondary }}>Visitors</h2>
              <p>Active</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.checked_in_today ?? 0}
                </h2>
              <h2 style={{ color: theme.textSecondary }}>
                Visitors
                </h2>
              <p>Checked In Today</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.online_stations ?? 0} / {dashboardStats?.offline_stations ?? 0} / {dashboardStats?.maintenance_stations ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Print Stations</h2>
              <p>On / Off / Maint.</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.pending_jobs ?? 0} / {dashboardStats?.failed_jobs ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Print Queue</h2>
              <p>Pending / Failed</p>
            </div>
          </div>
          {/* End Dashboard Summary Cards */}

          {/* M9.2 Batch 4: summary-first Operational Health card */}
          {(() => {
            const health = deriveSystemHealth(dashboardStats);
            const healthColor =
              health.state === "critical"
                ? theme.danger
                : health.state === "attention"
                  ? theme.warning || "#b8860b"
                  : theme.success;
            return (
              <div
                style={{
                  ...styles.userStats,
                  textAlign: "left",
                  marginBottom: "16px",
                  borderLeft: `4px solid ${healthColor}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      backgroundColor: healthColor,
                      color: "#fff",
                      borderRadius: "999px",
                      padding: "4px 14px",
                      fontSize: "13px",
                      fontWeight: "bold",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {health.label}
                  </span>
                  <h2 style={{ color: theme.textSecondary, margin: 0 }}>
                    Operational Health
                  </h2>
                </div>
                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "0.95rem",
                    color: theme.text,
                  }}
                >
                  {health.items.length > 0
                    ? health.items.join(" · ")
                    : "No issues detected. Stations, agents, and jobs healthy."}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedDiagnostics((v) => !v)}
                  style={{ ...styles.staffActionButton, marginTop: "14px" }}
                >
                  {showAdvancedDiagnostics
                    ? "Hide advanced diagnostics ▾"
                    : "Show advanced diagnostics ▸"}
                </button>
              </div>
            );
          })()}

          {showAdvancedDiagnostics && (
            <>
          {/* M9.2 Batch 1: operational visibility cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
              ? "repeat(2, 1fr)"
              : "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.online_agents ?? 0} / {dashboardStats?.offline_agents ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Print Agents</h2>
              <p>Online / Offline</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.stale_stations ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Stations</h2>
              <p>Stale (investigate)</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.stations_with_pending_jobs ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Stations</h2>
              <p>With Pending Jobs</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.stations_with_failed_jobs ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Stations</h2>
              <p>With Failed Jobs</p>
            </div>
          </div>
          {/* End operational visibility cards */}

          {/* M9.2 Batch 2: queue diagnostics cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
              ? "repeat(2, 1fr)"
              : "repeat(3, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={styles.userStats}>
              <h2
                style={{
                  color:
                    (dashboardStats?.jobs_requiring_attention ?? 0) > 0
                      ? theme.danger
                      : theme.textSecondary,
                }}
              >
                {dashboardStats?.jobs_requiring_attention ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Print Jobs</h2>
              <p>Requiring Attention</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {typeof dashboardStats?.oldest_pending_age_seconds === "number"
                  ? formatJobAge(dashboardStats.oldest_pending_age_seconds)
                  : "—"}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Oldest Pending</h2>
              <p>Job Age</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>
                {dashboardStats?.recovering_jobs ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Print Jobs</h2>
              <p>Auto-Recovered</p>
            </div>
          </div>
          {/* End queue diagnostics cards */}

          {/* M9.2 Batch 3: station awareness cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
              ? "repeat(2, 1fr)"
              : "repeat(2, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={styles.userStats}>
              <h2
                style={{
                  color:
                    (dashboardStats?.stations_needing_attention ?? 0) > 0
                      ? theme.danger
                      : theme.textSecondary,
                }}
              >
                {dashboardStats?.stations_needing_attention ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Stations</h2>
              <p>Needing Attention</p>
            </div>

            <div style={styles.userStats}>
              <h2
                style={{
                  color:
                    (dashboardStats?.stations_with_stuck_jobs ?? 0) > 0
                      ? theme.danger
                      : theme.textSecondary,
                }}
              >
                {dashboardStats?.stations_with_stuck_jobs ?? 0}
              </h2>
              <h2 style={{ color: theme.textSecondary }}>Stations</h2>
              <p>With Stuck Jobs</p>
            </div>
          </div>
          {/* End station awareness cards */}
            </>
          )}

          <div
            style={{
              marginTop: "24px",
              marginBottom: "24px",
              fontSize: "0.85rem",
              color: theme.textSecondary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <label htmlFor="staff-reprint-station">
              My print station (reprint destination):
            </label>
            <select
              id="staff-reprint-station"
              style={{ ...styles.input, width: "auto", margin: 0 }}
              value={reprintStationId}
              onChange={(event) =>
                setReprintStationId(event.target.value)
              }
            >
              <option value="">Visitor&apos;s check-in station</option>
              {printStations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dashboard Buttons */}
          <div style={styles.dashboardButtonRow}>

            <button
              type="button"
              style={styles.staffCard}
              onClick={() => setScreen("visitor-search")}
            >
              Visitor Search
            </button>

            <button
              type="button"
              style={styles.staffCard}
              onClick={() => setScreen("print-queue")}
            >
              Print Queue
            </button>

            <button
              type="button"
              style={styles.staffCard}
              onClick={() => setScreen("settings")}
            >
              Settings
            </button>

            <button
              type="button"
              style={styles.staffCard}
              onClick={() => setScreen("reporting")}
            >
              Reporting
            </button>

            {/* This button only for admins */}
            {role === "Administrator" && (
              <div
                style={{
                  marginTop: "20px",
                  width: "100%",
                  maxWidth: "700px",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                <button
                  style={{
                    ...styles.staffActionButton,
                    width: "100%",
                    backgroundColor: theme.neutral,
                  }}
                  onClick={() => navigateTo("administration")}
                >
                  Administration
                </button>
              </div>
            )}

            <div style={styles.sectionDivider}></div>

            <h3 style={styles.screenSubtitle}>
              Active Visitors
              </h3>

            {/* Bulk Checkout Button */}
            <button
              type="button"
              style={{ ...styles.bulkCheckoutButton, marginTop: "16px" }}
              onClick={handleBulkCheckout}
            >
              Checkout All Active Visitors
            </button>

            {/* Emergency roster export (evacuation / roll-call) */}
            <button
              type="button"
              style={{
                ...styles.staffActionButton,
                width: "100%",
                marginTop: "12px",
                backgroundColor: theme.neutral,
              }}
              onClick={handleExportActiveVisitors}
            >
              Export On-Property List (CSV)
            </button>

          </div>

          {/* Active Visitors List */}
          {activeVisitors.map((visitor) => (
            <div key={visitor.id} style={styles.resultCard}>

              {/* Container for columns */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "180px 1fr 140px",
                  alignItems: "start",
                }}
              >

                {/* Column 1 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: isMobile ? "center" : "left",
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
                  <h2
                    style={{
                      margin: "0 0 8px 0",
                      color: theme.textPrimary,
                      fontSize: isMobile ? "1.25rem" : "1.5rem",
                      lineHeight: "1.2",
                    }}
                  >
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
        {renderVersionFooter()}

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
          <h1 style={{ color: theme.textPrimary }}>
            Staff Login
          </h1>

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
              type={showStaffPassword ? "text" : "password"}
              style={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowStaffPassword((shown) => !shown)}
              style={{
                marginTop: "6px",
                background: "none",
                border: "none",
                color: theme.textSecondary,
                cursor: "pointer",
                fontSize: "0.85rem",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              {showStaffPassword ? "Hide password" : "Show password"}
            </button>
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
        {renderVersionFooter()}
        {renderAccountMenu()}
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
            boxSizing: "border-box",
          }}
        >
          <h1
            style={{
              color: theme.textPrimary,
              textAlign: "center",
              marginBottom: "24px",
            }}
          >
            User Management
          </h1>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, 1fr)"
                : "repeat(4, 1fr)",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{totalUsers}</h2>
              <p>Total Users</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{enabledUsers}</h2>
              <p>Enabled</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{disabledUsers}</h2>
              <p>Disabled</p>
            </div>

            <div style={styles.userStats}>
              <h2 style={{ color: theme.textSecondary }}>{adminUsers}</h2>
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
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
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

                <div style={{ marginBottom: "0px" }}>
                  <strong>Last Login:</strong>{" "}
                  </div>
                <div style={{ marginBottom: "16px" }}>
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
                  {/* This controls the available roles for users */}
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
        {renderVersionFooter()}
        {renderAccountMenu()}

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
          onClick={handleLeaveVisitorDetail}
        >
          ← Staff Dashboard
        </button>

        <div style={styles.formContainer}>
          <h1 style={{ color: theme.textPrimary }}>
            Visitor Details
          </h1>

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
                  {visitorTypes.map((visitorTypeOption) => (
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
                  {visitPurposes.map((visitPurposeOption) => (
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
      <div 
        style={styles.page}>
        {renderVersionFooter()}
        {renderAccountMenu()}

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
          <h1 style={{ color: theme.textPrimary }}>
            Search Visitors
          </h1>

          {hasSearched && (
            <p style={styles.instructions}>
              {searchResults.length} visitor{searchResults.length === 1 ? "" : "s"} found
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
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleVisitorSearch();
                }
              }}
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
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "180px 1fr 140px",
                  gap: isMobile ? "12px" : "0",  
                  alignItems: "start",
                }}
              >

                {/* Column 1 */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: isMobile ? "center" : "left",
                    alignItems: "center",
                  }}
                > 
                  {visitor.photo_path ? (
                    <img
                      src={getPhotoUrl(visitor.photo_path)}
                      alt="Visitor"
                      style={{
                        width: isMobile ? "120px" : "164px",
                        height: isMobile ? "120px" : "164px",
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
                      width: isMobile ? "100%" : "auto",
                      overflow: "visible",
                  }}
                >
                    <h2
                      style={{
                        margin: 0,
                        color: theme.textPrimary,
                      }}
                    >
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

  if (screen === "printing") {
    const status = printStatus?.status || "Pending";
    const stationName = printStatus?.station_name;
    const isOk = status === "Completed";
    const isFail = status === "Failed" || status === "Cancelled";

    let statusHeadline = "Sending your badge to the printer\u2026";
    if (status === "Printing") {
      statusHeadline = "Your badge is printing now\u2026";
    } else if (isOk) {
      statusHeadline = "Your badge is ready!";
    } else if (isFail) {
      statusHeadline = "We couldn\u2019t print your badge automatically.";
    } else if (printPollExpired) {
      statusHeadline = "Your badge is taking a little longer than usual.";
    }

    let statusDetail = "This only takes a moment.";
    if (isOk) {
      statusDetail = stationName
        ? `Please take it from ${stationName} and wear it while on campus.`
        : "Please take it from the printer and wear it while on campus.";
    } else if (isFail || printPollExpired) {
      statusDetail = "Please see the Welcome Desk and we'll help you.";
    } else if (stationName) {
      statusDetail = `Printing at ${stationName}.`;
    }

    return (
      <div style={styles.page}>
        {theme.logoOverlay && (
          <img src={theme.logoOverlay} alt="" style={styles.themeOverlay} />
        )}

        {isCrtTheme && (
          <>
            <div style={styles.crtOverlay} />
            <div style={styles.crtScanline} />
            <div style={styles.crtFlicker} />
          </>
        )}

        <div style={styles.formContainer}>
          <h1 style={{ color: theme.textPrimary }}>
            {successTitle || "Check-In Complete"}
          </h1>

          {successMessage && (
            <p style={styles.instructions}>{successMessage}</p>
          )}

          <div
            style={{
              marginTop: "24px",
              padding: "24px",
              borderRadius: "12px",
              border: `1px solid ${theme.border || "#d1d5db"}`,
              textAlign: "center",
            }}
          >
            <h2 style={{ color: theme.textPrimary, marginTop: 0 }}>
              {statusHeadline}
            </h2>
            <p style={{ color: theme.textPrimary, marginBottom: 0 }}>
              {statusDetail}
            </p>
          </div>

          <button
            style={styles.photoButton}
            onClick={resetGuestCheckIn}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // App() Return
  return (
      
      <div style={{ ...styles.page, padding: isMobile ? "24px 16px" : styles.page.padding }}>

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
    
      <div style={{ ...styles.hero, marginBottom: isMobile ? "40px" : styles.hero.marginBottom }}>
        <h1 style={{ ...styles.title, fontSize: isMobile ? "2.5rem" : isTablet ? "3rem" : styles.title.fontSize }}>Palmetto Bible Camp</h1>
        <p style={styles.subtitle}>Visitor Kiosk</p>
      </div>

      <div
        style={{
          ...styles.cardContainer,
          flexDirection: isMobile ? "column" : "row",
          width: isMobile ? "100%" : "auto",
          maxWidth: isMobile ? "360px" : "none",
        }}
      >
        <button
          type="button"
          style={{
            ...styles.primaryCard,
            width: isMobile ? "100%" : isTablet ? "260px" : styles.primaryCard.width,
            height: isMobile ? "120px" : styles.primaryCard.height,
          }}
          onClick={() => navigateTo("checkin")}
        >
          Check In
        </button>

        <button
          type="button"
          style={{
            ...styles.secondaryCard,
            width: isMobile ? "100%" : isTablet ? "260px" : styles.secondaryCard.width,
            height: isMobile ? "120px" : styles.secondaryCard.height,
          }}
          onClick={() => navigateTo("checkout")}
        >
          Check Out
        </button>
      </div>

      <button
        type="button"
        style={{
          ...styles.staffButton,
          width: isMobile ? "100%" : styles.staffButton.width,
          maxWidth: isMobile ? "360px" : "none",
        }}
        onClick={() => navigateTo("staff-login")}
      >
        Staff Login
      </button>

    </div>
  );

// End of App()
}


