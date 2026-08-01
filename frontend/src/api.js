const API_BASE = import.meta.env.VITE_API_BASE || "";

async function handleResponse(response, defaultMessage) {
  // 401 = the session is no longer valid: clear it and return to the main
  // screen. 403 = the session IS valid but lacks permission for this action:
  // keep the session and surface a permission error instead of logging out.
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired");
  }
  if (response.status === 403) {
    let permissionMessage = "You do not have permission to perform this action.";
    try {
      const errorData = await response.json();
      permissionMessage = errorData.detail || permissionMessage;
    } catch {
      // Fall back to the default permission message
    }
    throw new Error(permissionMessage);
  }
  if (!response.ok) {
    let errorMessage = defaultMessage;
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || defaultMessage;
    } catch {
      // Fall back to default message
    }
    throw new Error(errorMessage);
  }
  return await response.json();
}

export async function login(username, password) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error("Invalid username or password");
  }

  return await response.json();
}

export async function createVisitor(visitorData) {
  const response = await fetch(`${API_BASE}/api/visitors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(visitorData),
  });

  return await handleResponse(response, "Failed to create visitor");
}

export async function uploadPhoto(visitorId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/visitors/${visitorId}/photo`, {
    method: "POST",
    body: formData,
  });

  return await handleResponse(response, "Failed to upload photo");
}

export async function generateBadge(visitorId) {
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/badge`,
    {
      method: "POST",
    }
  );

  return await handleResponse(response, "Failed to generate badge");
}

export async function createPrintJob(visitorId) {
  // The print station is derived server-side from the visitor's captured
  // check-in station. The client never supplies or overrides it.
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/print`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("Print error:", error);
    throw new Error(error.detail || "Failed to queue print job");
  }

  return await response.json();
}

export async function getPrintJobStatus(printJobId) {
  // Public, anonymous status lookup for the guest "is my badge printing?"
  // experience. The endpoint intentionally returns only { status, station_name }
  // — no personal data — so it needs no auth header.
  const response = await fetch(
    `${API_BASE}/api/print-jobs/${printJobId}/status`
  );

  if (!response.ok) {
    throw new Error("Failed to load print status");
  }

  return await response.json();
}

export async function reprintBadge(visitorId, stationId) {
  // Staff-initiated reprint. Unlike check-in printing, staff may direct the
  // reprint to a chosen destination station (or null to use the visitor's
  // check-in station). Authenticated endpoint.
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/reprint`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        station_id: stationId ?? null,
      }),
    }
  );

  return await handleResponse(response, "Failed to queue badge reprint");
}

export async function checkInAgain(visitorId, data) {
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/checkin-again`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  return await handleResponse(
    response,
    "Failed to check in returning visitor"
  );
}

export async function checkoutVisitor(visitorId) {
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/checkout`,
    {
      method: "PUT",
    }
  );

  return await handleResponse(response, "Failed to check out visitor");
}

export async function bulkCheckout() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/visitors/bulk-checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await handleResponse(response, "Failed to perform bulk checkout");
}

export async function getActiveVisitors() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/visitors/active`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await handleResponse(response, "Failed to load active visitors");
}

export async function findVisitors(firstName, lastName) {
  const response = await fetch(
    `${API_BASE}/api/visitors/find?first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}`
  );

  return await handleResponse(response, "Failed to find visitor");
}

/*
 * Milestone 7
 */
export async function searchVisitors(query) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/visitors/search?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to search visitors");
}

export async function getVisitor(visitorId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to load visitor");
}

export async function getVisitorHistory(visitorId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/history`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return await handleResponse(
    response,
    "Failed to load visitor history"
  );
}

export async function updateVisitor(id, data) {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_BASE}/api/visitors/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  return await handleResponse(response, "Failed to update visitor");
}

export async function getUsers() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await handleResponse(response, "Failed to load users");
}

export async function createUser(data) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  return await handleResponse(response, "Failed to create user");
}

export async function updateUser(id, data) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/users/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  return await handleResponse(response, "Failed to update user");
}

export async function resetPassword(id, newPassword) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/users/${id}/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        new_password: newPassword,
      }),
    }
  );

  return await handleResponse(response, "Failed to reset password");
}


export async function updateUserStatus(id, enabled) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/users/${id}/status`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        enabled,
      }),
    }
  );

  return await handleResponse(response, "Failed to update user status");
}

// Print Job Management Functions

export async function getPrintJobs() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-jobs`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to load print jobs");
}

export async function deletePrintJob(jobId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-jobs/${jobId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to delete print job");
}

export async function reassignPrintJobStation(jobId, stationId) {
  // Redirect a still-pending job to a different enabled station (e.g. when the
  // job's original station is offline). Authenticated staff endpoint.
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-jobs/${jobId}/station`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ station_id: stationId }),
    }
  );

  return await handleResponse(response, "Failed to redirect print job");
}

export async function clearCompletedPrintJobs() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-jobs/completed`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to clear completed print jobs");
}

export async function clearFailedPrintJobs() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-jobs/failed`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to clear failed print jobs");
}


// Print Agent Management Functions

export async function getPrintAgents() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-agents`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to load print agents");
}

export async function assignPrintAgent(agentId, stationId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-agents/${agentId}/assign`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        station_id: stationId,
      }),
    }
  );

  return await handleResponse(response, "Failed to assign print agent");
}

export async function deletePrintAgent(agentId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-agents/${agentId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to delete print agent");
}

export async function setPrintAgentEnabled(agentId, enabled) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-agents/${agentId}/enabled`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        enabled,
      }),
    }
  );

  return await handleResponse(response, "Failed to update print agent status");
}


// Print Station Management Functions

export async function deletePrintStation(stationId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-stations/${stationId}/permanent`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to delete print station");
}

export async function getPrintStations() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-stations`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to load print stations");
}

export async function updatePrintStation(id, data) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-stations/${id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  return await handleResponse(response, "Failed to update print station");
}


export async function createPrintStation(data) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-stations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  return await handleResponse(response, "Failed to create print station");
}


export async function printAgentTestLabel(agentId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-agents/${agentId}/test-label`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to queue print agent test label");
}

export async function getDashboardStats() {
  const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE}/api/dashboard`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return await handleResponse(response, "Failed to load dashboard stats");
}

export async function getReportingSummary() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/reporting/summary`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to load reporting summary");
}

export async function getSettings() {
  const response = await fetch(
    `${API_BASE}/api/settings`
  );
  if (!response.ok) {
    throw new Error("Failed to load settings");
  }
  return await response.json();
}

export async function saveSettings(data) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/settings`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  return await handleResponse(response, "Failed to save settings");
}

export async function getThemes() {
  const response = await fetch(`${API_BASE}/api/themes`);
  if (!response.ok) {
    throw new Error("Failed to load themes");
  }
  return await response.json();
}

export async function createTheme(id, tokens) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/themes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, tokens }),
  });

  return await handleResponse(response, "Failed to create theme");
}

export async function updateTheme(id, tokens) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/themes/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tokens }),
    }
  );

  return await handleResponse(response, "Failed to update theme");
}

export async function deleteTheme(id) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/themes/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to delete theme");
}

export async function uploadThemeLogo(id, file) {
  const token = localStorage.getItem("access_token");
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_BASE}/api/themes/${encodeURIComponent(id)}/logo`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  return await handleResponse(response, "Failed to upload logo");
}

export async function deleteThemeLogo(id) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/themes/${encodeURIComponent(id)}/logo`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await handleResponse(response, "Failed to remove logo");
}

  export async function printStationQrLabel(stationId) {
    const token = localStorage.getItem("access_token");

    const response = await fetch(
      `${API_BASE}/api/print-stations/${stationId}/print-qr`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return await handleResponse(response, "Failed to queue print station QR label");
  }

  export async function downloadPrintStationQr(stationId) {
    const token = localStorage.getItem("access_token");

    const response = await fetch(
      `${API_BASE}/api/print-stations/${stationId}/qr`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error("Session expired");
    }

    if (!response.ok) {
      throw new Error("Failed to download QR code");
    }

    const blob = await response.blob();

    const disposition = response.headers.get("Content-Disposition");

    let filename = `station-${stationId}-qr.png`;

    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/);

      if (match && match[1]) {
        filename = match[1];
      }
    }

    console.log("Content-Disposition:", disposition);
    console.log("Filename:", filename);

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  }

  export async function exportActiveVisitors() {
    // Emergency roster download: CSV of everyone currently on property.
    // Authenticated staff action used for evacuation / roll-call.
    const token = localStorage.getItem("access_token");

    const response = await fetch(
      `${API_BASE}/api/visitors/active/export`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401 || response.status === 403) {
      handleUnauthorized();
      throw new Error("Session expired");
    }

    if (!response.ok) {
      throw new Error("Failed to export active visitors");
    }

    const blob = await response.blob();

    const disposition = response.headers.get("Content-Disposition");

    let filename = "active-visitors.csv";

    if (disposition) {
      const match = disposition.match(/filename="?([^"]+)"?/);

      if (match && match[1]) {
        filename = match[1];
      }
    }

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);
  }

  export async function changePassword(data) {
    const token = localStorage.getItem("access_token");
  const response = await fetch(
    `${API_BASE}/api/change-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }
  );

  return await handleResponse(response, "Failed to change password");
  }


  function handleUnauthorized() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");

    sessionStorage.setItem(
        "session_expired_message",
        "Your session expired. Please sign in again."
    );

    window.location.reload();
}