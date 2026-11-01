import jwt from "jsonwebtoken";
import { Tenant, User } from "./models.js";

export async function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose) {
      return res.status(401).json({ error: "This token cannot be used for an account session." });
    }
    const user = await User.findById(payload.sub).lean();
    if (!user || !user.active) {
      return res.status(401).json({ error: "This account is unavailable." });
    }
    if (user.role === "business_owner") {
      const tenant = await Tenant.findById(user.tenantId).select("status").lean();
      if (!tenant || tenant.status !== "active") {
        return res.status(403).json({ error: "This business account is not active." });
      }
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    return next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    return next();
  };
}

export function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h"
  });
}
