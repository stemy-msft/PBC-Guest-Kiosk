const API_BASE = import.meta.env.VITE_API_BASE || "";

async function handleResponse(response, errorMessage) {
  if (response.status === 401) {
    localStorage.removeItem("access_token");
    window.location.reload();
  }

  if (!response.ok) {
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

export async function createPrintJob(visitorId, station = 1) {
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

  return await handleResponse(response, "Failed to queue print job");
}

export async function checkInAgain(visitorId, data) {
console.log("handleCheckInAgain called");
console.log(visitor);

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

