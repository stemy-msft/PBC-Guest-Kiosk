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

export async function createPrintJob(visitorId) {
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/print`,
    {
      method: "POST",
    }
  );

  return await handleResponse(response, "Failed to queue print job");
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
 * Milestone 7 - Visitor Search
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

/*
 * Milestone 7 - Visitor Detail
 */
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