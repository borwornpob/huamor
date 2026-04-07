import { Hono } from "hono";

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "RAG Backend API",
    version: "1.0.0",
    description: "API docs for auth, chat, expert review, and health routes.",
  },
  servers: [{ url: "/" }],
  tags: [{ name: "Auth" }, { name: "Chat" }, { name: "Expert" }, { name: "System" }],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: { "200": { description: "Service health status" } },
      },
    },
    "/api/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Create a new user account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "firstName", "lastName", "birthDate", "gender", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  birthDate: { type: "string", example: "1998-01-15" },
                  gender: { type: "string", example: "female" },
                  password: { type: "string", minLength: 6 },
                  displayName: { type: "string" },
                  role: { type: "string", enum: ["patient", "doctor"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Account created" },
          "400": { description: "Invalid request body" },
          "409": { description: "Email already exists" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email or username plus password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: {
                  email: { type: "string", format: "email" },
                  username: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Logged in" },
          "400": { description: "Invalid request body" },
          "401": { description: "Invalid username or password" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current authenticated user",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Authenticated user" }, "401": { description: "Missing token or invalid token" } },
      },
    },
    "/api/chat/start": {
      post: {
        tags: ["Chat"],
        summary: "Start a new patient chat session",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { type: "string" },
                  provider: { type: "string", enum: ["sealion"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Chat session created" }, "403": { description: "Only patient can start chat" } },
      },
    },
    "/api/chat/sessions": {
      get: {
        tags: ["Chat"],
        summary: "List sessions for the authenticated patient",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Session list" }, "403": { description: "Only patient can view own sessions" } },
      },
    },
    "/api/chat/sessions/{sessionId}/history": {
      get: {
        tags: ["Chat"],
        summary: "Get chat history for a session",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "sessionId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Session messages" }, "403": { description: "Forbidden" }, "404": { description: "Session not found" } },
      },
    },
    "/api/chat/{sessionId}/message": {
      post: {
        tags: ["Chat"],
        summary: "Send another message in a session",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "sessionId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { type: "string" },
                  provider: { type: "string", enum: ["sealion"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Assistant reply appended" } },
      },
    },
    "/api/expert/sessions": {
      get: {
        tags: ["Expert"],
        summary: "List all sessions for doctors",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "All sessions" }, "403": { description: "Doctor role required" } },
      },
    },
    "/api/expert/sessions/{sessionId}/history": {
      get: {
        tags: ["Expert"],
        summary: "Get session history for expert review",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "sessionId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Session history" } },
      },
    },
    "/api/expert/sessions/{sessionId}/review": {
      post: {
        tags: ["Expert"],
        summary: "Post expert review and upload the reviewed answer to Qdrant",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "sessionId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["question", "answer"],
                properties: {
                  question: { type: "string" },
                  answer: { type: "string" },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Review saved and uploaded" }, "403": { description: "Doctor role required" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
} as const;

export const docsRouter = new Hono();

docsRouter.get("/openapi.json", (c) => c.json(openApiDocument));

docsRouter.get("/", (c) => {
  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RAG Backend API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: '/api/docs/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          displayRequestDuration: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
        });
      };
    </script>
  </body>
</html>`);
});
