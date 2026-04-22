import { expect, test } from "@playwright/test";

async function login(request: Parameters<typeof test>[0]["request"], username: string, password: string) {
  const response = await request.post("/api/auth/login", {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  return payload.token as string;
}

test("patient chat and doctor review flow records runtime metadata", async ({ request }) => {
  const health = await request.get("/health");
  expect(health.ok()).toBeTruthy();

  const patientToken = await login(request, "patient1", "patient123");
  const start = await request.post("/api/chat/start", {
    data: {
      message: "มีอาการเจ็บหน้าอก หายใจลำบาก ควรไปแผนกไหน",
    },
    headers: {
      authorization: `Bearer ${patientToken}`,
    },
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
    headers: {
      authorization: `Bearer ${doctorToken}`,
    },
  });
  expect(review.ok()).toBeTruthy();
  const reviewPayload = await review.json();
  expect(reviewPayload.session.status).toBe("completed");
  expect(reviewPayload.session.doctorEdit.reviewOutcome).toBe("corrected");

  const ready = await request.get("/ready");
  expect(ready.ok()).toBeTruthy();

  const metrics = await request.get("/metrics");
  expect(metrics.ok()).toBeTruthy();
  const metricsText = await metrics.text();
  expect(metricsText).toContain("http_requests_total");
  expect(metricsText).toContain("api_chat_requests_total");
  expect(metricsText).toContain("api_expert_reviews_total");
});
