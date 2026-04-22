import { expect, test } from "@playwright/test";

async function login(
  request: Parameters<typeof test>[0]["request"],
  username: string,
  password: string,
) {
  const response = await request.post("/api/auth/login", {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  return payload.token as string;
}

test.describe("Health and readiness", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const health = await request.get("/health");
    expect(health.ok()).toBeTruthy();
    const body = await health.json();
    expect(body.status).toBe("ok");
  });

  test("ready endpoint returns ok", async ({ request }) => {
    const ready = await request.get("/ready");
    expect(ready.ok()).toBeTruthy();
  });

  test("metrics endpoint returns prometheus format", async ({ request }) => {
    const metrics = await request.get("/metrics");
    expect(metrics.ok()).toBeTruthy();
    const text = await metrics.text();
    expect(text).toContain("http_requests_total");
  });
});

test.describe("Authentication", () => {
  test("patient login succeeds with demo credentials", async ({ request }) => {
    const token = await login(request, "patient1", "patient123");
    expect(token).toBeTruthy();
  });

  test("doctor login succeeds with demo credentials", async ({ request }) => {
    const token = await login(request, "doctor1", "doctor123");
    expect(token).toBeTruthy();
  });

  test("login fails with wrong password", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { username: "patient1", password: "wrong" },
    });
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(401);
  });

  test("login fails with missing fields", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: {},
    });
    expect(response.ok()).toBeFalsy();
  });

  test("/api/auth/me returns user info with valid token", async ({ request }) => {
    const token = await login(request, "patient1", "patient123");
    const me = await request.get("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.ok()).toBeTruthy();
    const body = await me.json();
    expect(body.user.id).toBeTruthy();
    expect(body.user.role).toBe("patient");
  });

  test("signup creates a new patient account", async ({ request }) => {
    const suffix = Date.now();
    const response = await request.post("/api/auth/signup", {
      data: {
        email: `test-${suffix}@example.com`,
        firstName: "Test",
        lastName: "User",
        birthDate: "1998-01-15",
        gender: "female",
        password: "testpassword123",
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe("patient");
  });
});

test.describe("Patient chat flow", () => {
  test("patient chat and doctor review flow records runtime metadata", async ({ request }) => {
    const patientToken = await login(request, "patient1", "patient123");

    const start = await request.post("/api/chat/start", {
      data: {
        message: "มีอาการเจ็บหน้าอก หายใจลำบาก ควรไปแผนกไหน",
      },
      headers: { authorization: `Bearer ${patientToken}` },
    });
    expect(start.ok()).toBeTruthy();
    const startPayload = await start.json();
    expect(startPayload.session.id).toBeTruthy();
    expect(startPayload.session.lastRuntimeMetadata.provider).toBeTruthy();
    expect(startPayload.session.lastRuntimeMetadata.promptVersion).toBeTruthy();
    expect(startPayload.session.lastRuntimeMetadata.indexVersion).toBeTruthy();

    const sessionId = startPayload.session.id as string;

    const doctorToken = await login(request, "doctor1", "doctor123");
    const review = await request.post(`/api/expert/sessions/${sessionId}/review`, {
      data: {
        question: "มีอาการเจ็บหน้าอก หายใจลำบาก ควรไปแผนกไหน",
        answer: "หากอาการเฉียบพลันหรือรุนแรงควรไปห้องฉุกเฉินทันที",
        severity: "critical",
        recommendedDepartment: "emergency",
        requiresEscalation: true,
        reviewOutcome: "corrected",
        note: "playwright e2e",
      },
      headers: { authorization: `Bearer ${doctorToken}` },
    });
    expect(review.ok()).toBeTruthy();
    const reviewPayload = await review.json();
    expect(reviewPayload.session.status).toBe("completed");
    expect(reviewPayload.session.doctorEdit.reviewOutcome).toBe("corrected");

    const metrics = await request.get("/metrics");
    expect(metrics.ok()).toBeTruthy();
    const metricsText = await metrics.text();
    expect(metricsText).toContain("http_requests_total");
    expect(metricsText).toContain("api_chat_requests_total");
    expect(metricsText).toContain("api_expert_reviews_total");
  });

  test("session listing returns sessions for patient", async ({ request }) => {
    const patientToken = await login(request, "patient1", "patient123");

    await request.post("/api/chat/start", {
      data: { message: "ทดสอบ" },
      headers: { authorization: `Bearer ${patientToken}` },
    });

    const sessions = await request.get("/api/chat/sessions?limit=10", {
      headers: { authorization: `Bearer ${patientToken}` },
    });
    expect(sessions.ok()).toBeTruthy();
    const body = await sessions.json();
    expect(Array.isArray(body.sessions)).toBeTruthy();
    expect(body.sessions.length).toBeGreaterThanOrEqual(1);
  });

  test("multi-message conversation continues in same session", async ({ request }) => {
    const patientToken = await login(request, "patient1", "patient123");

    const start = await request.post("/api/chat/start", {
      data: { message: "ปวดหัวมาก" },
      headers: { authorization: `Bearer ${patientToken}` },
    });
    expect(start.ok()).toBeTruthy();
    const { session } = await start.json();
    const sessionId = session.id;

    const cont = await request.post(`/api/chat/${sessionId}/message`, {
      data: { message: "ปวดมากแค่ไหน" },
      headers: { authorization: `Bearer ${patientToken}` },
    });
    expect(cont.ok()).toBeTruthy();
    const contPayload = await cont.json();
    expect(contPayload.session.id).toBe(sessionId);
    expect(contPayload.session.messages.length).toBeGreaterThanOrEqual(3);
  });

  test("session history returns messages", async ({ request }) => {
    const patientToken = await login(request, "patient1", "patient123");

    const start = await request.post("/api/chat/start", {
      data: { message: "อาการไอ" },
      headers: { authorization: `Bearer ${patientToken}` },
    });
    const { session } = await start.json();

    const history = await request.get(`/api/chat/sessions/${session.id}/history`, {
      headers: { authorization: `Bearer ${patientToken}` },
    });
    expect(history.ok()).toBeTruthy();
    const body = await history.json();
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Doctor expert flow", () => {
  test("expert pending and sessions endpoints work", async ({ request }) => {
    const doctorToken = await login(request, "doctor1", "doctor123");

    const pending = await request.get("/api/expert/pending", {
      headers: { authorization: `Bearer ${doctorToken}` },
    });
    expect(pending.ok()).toBeTruthy();

    const sessions = await request.get("/api/expert/sessions?limit=10", {
      headers: { authorization: `Bearer ${doctorToken}` },
    });
    expect(sessions.ok()).toBeTruthy();
    const body = await sessions.json();
    expect(Array.isArray(body.sessions)).toBeTruthy();
  });
});
