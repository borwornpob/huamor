import { expect, test } from "@playwright/test";

test.describe("Auth", () => {
  test("shows sign in form by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    await expect(page.getByPlaceholder("Username or email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
  });

  test("switches to sign up form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
  });

  test("sign in as patient navigates to chat view", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Username or email").fill("patient1");
    await page.getByPlaceholder("Password").fill("patient123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Hua-Mor" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Patient:")).toBeVisible();
  });

  test("sign in as doctor navigates to doctor review view", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Username or email").fill("doctor1");
    await page.getByPlaceholder("Password").fill("doctor123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Doctor Review" })).toBeVisible({ timeout: 15000 });
  });

  test("logout returns to auth form", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Username or email").fill("patient1");
    await page.getByPlaceholder("Password").fill("patient123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Hua-Mor" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });
});

test.describe("Patient Chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Username or email").fill("patient1");
    await page.getByPlaceholder("Password").fill("patient123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Hua-Mor" })).toBeVisible({ timeout: 15000 });
  });

  test("shows empty chat state", async ({ page }) => {
    await expect(page.getByText("พิมพ์อาการและกด Send เพื่อเริ่มการสนทนาใหม่")).toBeVisible();
  });

  test("can type in the message input", async ({ page }) => {
    const input = page.getByPlaceholder("Type your symptoms or health questions...");
    await input.fill("test message");
    await expect(input).toHaveValue("test message");
  });

  test("send button is disabled when message is empty", async ({ page }) => {
    const sendBtn = page.getByRole("button", { name: "Send" });
    await expect(sendBtn).toBeDisabled();
  });

  test("can start a new chat", async ({ page }) => {
    await page.getByRole("button", { name: "New Chat" }).click();
    await expect(page.getByText("พิมพ์อาการและกด Send เพื่อเริ่มการสนทนาใหม่")).toBeVisible();
  });
});

test.describe("Doctor Review", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Username or email").fill("doctor1");
    await page.getByPlaceholder("Password").fill("doctor123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Doctor Review" })).toBeVisible({ timeout: 15000 });
  });

  test("shows doctor review interface", async ({ page }) => {
    await expect(page.getByText("Review Form")).toBeVisible();
    await expect(page.getByText("รอรีวิว")).toBeVisible();
    await expect(page.getByText("รีวิวแล้ว")).toBeVisible();
  });

  test("can switch between pending and reviewed tabs", async ({ page }) => {
    await page.getByRole("button", { name: "รีวิวแล้ว" }).click();
    await expect(page.getByText("ยังไม่มีประวัติที่รีวิวแล้ว")).toBeVisible();
    await page.getByRole("button", { name: "รอรีวิว" }).click();
    await expect(page.getByText("ไม่มีเคสที่รอรีวิว")).toBeVisible();
  });

  test("submit review button is disabled when no session selected", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: "Submit Review" });
    await expect(submitBtn).toBeDisabled();
  });
});
