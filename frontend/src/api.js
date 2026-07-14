const API_BASE = "http://192.168.0.210:8000";


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

export async function checkoutVisitor(visitorId) {
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/checkout`,
    {
      method: "PUT",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to check out visitor");
  }

  return await response.json();
}

export async function createPrintJob(visitorId) {
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/print`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to queue print job");
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

export async function findVisitors(firstName, lastName) {
  const response = await fetch(
    `${API_BASE}/api/visitors/find?first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}`
  );

  if (!response.ok) {
    throw new Error("Failed to find visitor");
  }

  return await response.json();
}

export async function generateBadge(visitorId) {
  const response = await fetch(
    `${API_BASE}/api/visitors/${visitorId}/badge`,
    {
      method: "POST",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to generate badge");
  }

  return await response.json();
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

async function handleResponse(response, errorMessage) {
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

export async function uploadPhoto(visitorId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/visitors/${visitorId}/photo`, {
    method: "POST",
    body: formData,
  });

  return await handleResponse(response, "Failed to upload photo");
}
