import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {
    let token = req.cookies?.accessToken;

    // Fallback to Authorization header
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // No token
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided",
        code: "NO_TOKEN",
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET || "access_secret_12345_abcde",
    );

    // Fetch only required fields
    const user = await User.findById(decoded.id)
      .select("_id username displayName avatar friends")
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Attach user
    req.user = user;

    next();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT Verification Error:", error.message);
    }

    // Token expired
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }

    // Invalid token
    return res.status(401).json({
      success: false,
      message: "Not authorized, token invalid",
      code: "INVALID_TOKEN",
    });
  }
};
