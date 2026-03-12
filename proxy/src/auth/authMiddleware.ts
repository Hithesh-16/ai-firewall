import { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config";
import { validateApiToken } from "./authService";
import { AuthContext, Role } from "../types";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}

const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLocalhost(request: FastifyRequest): boolean {
  const ip = request.ip ?? request.headers["x-forwarded-for"] ?? "";
  const first = (typeof ip === "string" ? ip.split(",")[0]?.trim() : ip) ?? "";
  return LOCALHOST_IPS.has(first) || first === "localhost";
}

/** Synthetic admin context for localhost when ALLOW_LOCALHOST_PROVIDER_CONFIG is set. */
function localhostAdminContext(): AuthContext {
  return {
    user: {
      id: 0,
      email: "localhost@local",
      name: "Local Dev",
      role: "admin",
      orgId: null,
      createdAt: 0,
      updatedAt: 0
    },
    token: {
      id: 0,
      userId: 0,
      tokenHash: "",
      name: "localhost",
      lastUsedAt: null,
      createdAt: 0,
      expiresAt: null
    }
  };
}

/** For provider/model routes: allow localhost without token when ALLOW_LOCALHOST_PROVIDER_CONFIG is true. */
export async function requireAuthOrLocalhost(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (env.ALLOW_LOCALHOST_PROVIDER_CONFIG && isLocalhost(request)) {
    request.authContext = localhostAdminContext();
    return;
  }
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer afw_")) {
    return reply.status(401).send({ error: "Missing or invalid API token" });
  }
  const raw = header.replace("Bearer ", "");
  const result = validateApiToken(raw);
  if (!result) {
    return reply.status(401).send({ error: "Invalid or expired API token" });
  }
  request.authContext = result;
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer afw_")) {
    return reply.status(401).send({ error: "Missing or invalid API token" });
  }

  const raw = header.replace("Bearer ", "");
  const result = validateApiToken(raw);

  if (!result) {
    return reply.status(401).send({ error: "Invalid or expired API token" });
  }

  request.authContext = result;
}

export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);
    if (reply.sent) return;
    const ctx = request.authContext;
    if (!ctx || !allowedRoles.includes(ctx.user.role)) {
      return reply.status(403).send({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: ctx?.user.role
      });
    }
  };
}

/** Use after requireAuthOrLocalhost: only checks that authContext has one of the allowed roles. */
export function requireRoleOnly(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const ctx = request.authContext;
    if (!ctx || !allowedRoles.includes(ctx.user.role)) {
      return reply.status(403).send({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: ctx?.user.role
      });
    }
  };
}
