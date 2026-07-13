import { useEffect, useState } from "react";
import {
  createVisitor,
  getActiveVisitors,
  uploadPhoto,
  generateBadge,
  createPrintJob
} from "./api";

export default function App() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [hostName, setHostName] = useState("");
  const [visitorType, setVisitorType] = useState("Parent");
  const [purpose, setPurpose] = useState("Visiting Camper");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [status, setStatus] = useState("");
  const [visitors, setVisitors] = useState([]);

  async function loadVisitors() {
    try {
      const data = await getActiveVisitors();
      setVisitors(data);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadVisitors();
  }, []);

  function handlePhotoChange(event) {
    const file = event.target.files[0];

    if (!file) {
    return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleCreateVisitor() {
    try {
      setStatus("Creating visitor...");

  const visitor = await createVisitor({
    first_name: firstName,
    last_name: lastName,
    visitor_type: visitorType,
    church: "",
    phone: "",
    purpose: purpose,
    host_type: "Camper",
    host_name: hostName,
    vehicle_plate: "",
    notes: "",
    expected_departure_time: null,
  });

  if (photoFile) {
    setStatus("Uploading photo...");
    await uploadPhoto(visitor.id, photoFile);

    setStatus("Generating badge...");
    await generateBadge(visitor.id);
  }

  setStatus("Creating print job...");

  const printJob = await createPrintJob(visitor.id);

  setStatus(
    `Visitor ${visitor.id} created. Print Job ${printJob.id} queued.`
  );

  setFirstName("");
  setLastName("");
  setHostName("");
  setPhotoFile(null);
  setPhotoPreview(null);

  await loadVisitors();
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
}

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>PBC Visitor Kiosk</h1>

      <div>
        <input
          type="text"
          placeholder="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </div>

      <div style={{ marginTop: "10px" }}>
        <input
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <div style={{ marginTop: "10px" }}>
        <input
          type="text"
          placeholder="Host Name"
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
        />
      </div>

      <div style={{ marginTop: "10px" }}>
        <select
          value={visitorType}
          onChange={(e) => setVisitorType(e.target.value)}
        >
          <option>Parent</option>
          <option>Grandparent</option>
          <option>Family Member</option>
          <option>Guest</option>
          <option>Pastor</option>
          <option>Vendor</option>
          <option>Other</option>
        </select>
      </div>

      <div style={{ marginTop: "10px" }}>
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        >
          <option>Visiting a Camper</option>
          <option>Dinner</option>
          <option>Chapel</option>
          <option>Talent Show</option>
          <option>Awards Ceremony</option>
          <option>Family Night</option>
          <option>Guest Speaker</option>
          <option>Vendor/Service</option>
          <option>Other</option>
        </select>
      </div>

      <div style={{ marginTop: "10px" }}>
        <input
          id="photoInput"
          type="file"
          accept="image/*"
          capture="user"
          onChange={handlePhotoChange}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => document.getElementById("photoInput").click()}
        >
          Take Picture
        </button>
        {photoPreview && (
          <img
            src={photoPreview}
            alt="Visitor Preview"
            style={{
              width: "250px",
              marginTop: "10px",
              border: "1px solid #ccc",
              borderRadius: "8px"
            }}
          />
        )}
      </div>

      <div style={{ marginTop: "10px" }}>
        <button onClick={handleCreateVisitor}>
          Create Visitor
        </button>
      </div>

      <p>{status}</p>

      <hr />

      <h2>Active Visitors</h2>

      {visitors.map((visitor) => (
        <div
          key={visitor.id}
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginBottom: "10px",
          }}
        >
          <strong>
            {visitor.first_name} {visitor.last_name}
          </strong>

          <div>ID: {visitor.id}</div>
          <div>Host: {visitor.host_name}</div>
          <div>
            Badge: {visitor.badge_path ? "Generated" : "Not Generated"}
          </div>
        </div>
      ))}
    </div>
  );
}