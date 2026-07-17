// Field keys used throughout the visitor kiosk application.
// These should match the API/database field names where possible.
export const FIELD_KEYS = {
  FIRST_NAME: "first_name",
  LAST_NAME: "last_name",
  VISITOR_TYPE: "visitor_type",
  PURPOSE: "purpose",
  HOST_TYPE: "host_type",
  HOST_NAME: "host_name",
  VEHICLE_PLATE: "vehicle_plate",
  PHONE: "phone",
  EMAIL: "email",
  NOTES: "notes",
  EXPECTED_DEPARTURE_TIME: "expected_departure_time",
  PHOTO: "photo",
};

// Human-readable field labels.
// These labels are used for validation messages and can also be used by forms.
export const FIELD_LABELS = {
  [FIELD_KEYS.FIRST_NAME]: "First Name",
  [FIELD_KEYS.LAST_NAME]: "Last Name",
  [FIELD_KEYS.VISITOR_TYPE]: "Visitor Type",
  [FIELD_KEYS.PURPOSE]: "Purpose",
  [FIELD_KEYS.HOST_TYPE]: "Host Type",
  [FIELD_KEYS.HOST_NAME]: "Camper or Contact Name",
  [FIELD_KEYS.VEHICLE_PLATE]: "Vehicle License Plate",
  [FIELD_KEYS.PHONE]: "Phone",
  [FIELD_KEYS.EMAIL]: "Email",
  [FIELD_KEYS.NOTES]: "Notes",
  [FIELD_KEYS.EXPECTED_DEPARTURE_TIME]: "Expected Departure Time",
  [FIELD_KEYS.PHOTO]: "Visitor Photo",
};

// Initial self-service visitor check-in requirements.
// Change this list when camp policy changes.
//
// Example:
// To make phone required, add FIELD_KEYS.PHONE.
// To make vehicle plate required, add FIELD_KEYS.VEHICLE_PLATE.
export const REQUIRED_CHECKIN_FIELDS = [
  FIELD_KEYS.FIRST_NAME,
  FIELD_KEYS.LAST_NAME,
  FIELD_KEYS.VISITOR_TYPE,
  FIELD_KEYS.PURPOSE,
  FIELD_KEYS.HOST_NAME,
  FIELD_KEYS.PHOTO,
];

// Returning visitor check-in requirements.
// Photo is intentionally not required here because returning visitors can reuse an existing photo.
export const REQUIRED_RETURNING_CHECKIN_FIELDS = [
  FIELD_KEYS.FIRST_NAME,
  FIELD_KEYS.LAST_NAME,
  FIELD_KEYS.VISITOR_TYPE,
  FIELD_KEYS.PURPOSE,
  FIELD_KEYS.HOST_NAME,
];

// Staff visitor update requirements.
// This controls which fields must be present when staff edits visitor details.
export const REQUIRED_VISITOR_UPDATE_FIELDS = [
  FIELD_KEYS.FIRST_NAME,
  FIELD_KEYS.LAST_NAME,
  FIELD_KEYS.VISITOR_TYPE,
  FIELD_KEYS.PURPOSE,
  FIELD_KEYS.HOST_NAME,
];

// Field metadata for the initial check-in form.
// Option lists are intentionally referenced by name instead of imported here.
// App.jsx can map optionSource to VISITOR_TYPES or VISIT_PURPOSES from options.js.
export const CHECKIN_FIELDS = [
  {
    key: FIELD_KEYS.FIRST_NAME,
    label: FIELD_LABELS[FIELD_KEYS.FIRST_NAME],
    type: "text",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.FIRST_NAME),
  },
  {
    key: FIELD_KEYS.LAST_NAME,
    label: FIELD_LABELS[FIELD_KEYS.LAST_NAME],
    type: "text",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.LAST_NAME),
  },
  {
    key: FIELD_KEYS.HOST_NAME,
    label: FIELD_LABELS[FIELD_KEYS.HOST_NAME],
    type: "text",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.HOST_NAME),
  },
  {
    key: FIELD_KEYS.VISITOR_TYPE,
    label: FIELD_LABELS[FIELD_KEYS.VISITOR_TYPE],
    type: "select",
    optionSource: "VISITOR_TYPES",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.VISITOR_TYPE),
  },
  {
    key: FIELD_KEYS.PURPOSE,
    label: FIELD_LABELS[FIELD_KEYS.PURPOSE],
    type: "select",
    optionSource: "VISIT_PURPOSES",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.PURPOSE),
  },
  {
    key: FIELD_KEYS.VEHICLE_PLATE,
    label: FIELD_LABELS[FIELD_KEYS.VEHICLE_PLATE],
    type: "text",
    transform: "uppercase",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.VEHICLE_PLATE),
  },
  {
    key: FIELD_KEYS.PHONE,
    label: FIELD_LABELS[FIELD_KEYS.PHONE],
    type: "tel",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.PHONE),
  },
  {
    key: FIELD_KEYS.EMAIL,
    label: FIELD_LABELS[FIELD_KEYS.EMAIL],
    type: "email",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.EMAIL),
  },
  {
    key: FIELD_KEYS.EXPECTED_DEPARTURE_TIME,
    label: FIELD_LABELS[FIELD_KEYS.EXPECTED_DEPARTURE_TIME],
    type: "datetime",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.EXPECTED_DEPARTURE_TIME),
  },
  {
    key: FIELD_KEYS.NOTES,
    label: FIELD_LABELS[FIELD_KEYS.NOTES],
    type: "textarea",
    required: REQUIRED_CHECKIN_FIELDS.includes(FIELD_KEYS.NOTES),
  },
];

// Field metadata for returning visitor check-in.
export const RETURNING_CHECKIN_FIELDS = CHECKIN_FIELDS.map((field) => ({
  ...field,
  required: REQUIRED_RETURNING_CHECKIN_FIELDS.includes(field.key),
}));

// Field metadata for staff visitor updates.
export const VISITOR_UPDATE_FIELDS = CHECKIN_FIELDS.map((field) => ({
  ...field,
  required: REQUIRED_VISITOR_UPDATE_FIELDS.includes(field.key),
}));

// Utility: get the label for a field key.
export function getFieldLabel(fieldKey) {
  return FIELD_LABELS[fieldKey] || fieldKey;
}

// Utility: determine whether a value should count as missing.
export function isMissingFieldValue(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  return false;
}

// Utility: validate a values object against a required field list.
//
// Example values object:
// {
//   first_name: firstName,
//   last_name: lastName,
//   visitor_type: visitorType,
//   purpose,
//   host_name: contactName,
//   vehicle_plate: vehiclePlate,
//   phone,
//   email,
//   photo: photoFile,
// }
//
// Returns an array of human-readable field labels.
export function getMissingRequiredFieldLabels(values, requiredFields) {
  return requiredFields
    .filter((fieldKey) => isMissingFieldValue(values[fieldKey]))
    .map((fieldKey) => getFieldLabel(fieldKey));
}