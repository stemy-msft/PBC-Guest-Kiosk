const API_BASE = import.meta.env.VITE_API_BASE || "";

async function handleResponse(response, defaultMessage) {
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

export async function createPrintJob(visitorId, station) {
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/print`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        station,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("Print error:", error);
    throw new Error(error.detail || "Failed to queue print job");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to update visitor");
  }

  return response.json();
}

export async function getUsers() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load users");
  }

  return await response.json();
}

// Deprecated?
export async function getUser(id) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(`${API_BASE}/api/users/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load user");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to create user");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to update user");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to reset password");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to update user status");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to load print jobs");
  }

  return await response.json();
}

// Deprecated?
export async function getPendingPrintJobs() {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-jobs/pending`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load pending print jobs");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to delete print job");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to clear completed print jobs");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to clear failed print jobs");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to load print agents");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to assign print agent");
  }

  return await response.json();
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail || "Failed to delete print station"
    );
  }

  return data;
}

// Deprecated?
export async function disablePrintStation(id) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-stations/${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to disable print station");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to load print stations");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to update print station");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to create print station");
  }

  return await response.json();
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Failed to queue print agent test label");
  }

  return data;
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

  if (!response.ok) {
    throw new Error("Failed to load dashboard stats");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to load reporting summary");
  }

  return await response.json();
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

  if (!response.ok) {
    throw new Error("Failed to save settings");
  }

  return await response.json();
}

export async function reassignPrintJob(jobId, stationId) {
  const token = localStorage.getItem("access_token");

  const response = await fetch(
    `${API_BASE}/api/print-jobs/${jobId}/reassign`,
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

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.detail || "Failed to reassign print job");
  }

  return await response.json();
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Failed to queue print station QR label");
    }

    return data;
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

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      error.detail || "Failed to change password"
    );
  }
    return await response.json();
  }
