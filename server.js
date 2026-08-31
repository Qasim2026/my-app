const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { exec } = require("child_process");
const { parse } = require("querystring");

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@mysocial.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";

if (!DATABASE_URL) {
  console.error("STARTUP ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  MAX_BODY: 8 * 1024 * 1024,
  MAX_AVATAR: 2 * 1024 * 1024,
  MAX_POST: 10000,
  MAX_MESSAGE: 5000,
  MAX_COMMENT: 2000,
  MAX_STORY: 10000,
  MAX_JOB: 5000,
  MAX_BIO: 1000,
  MAX_NAME: 100,
  MAX_EMAIL: 200,
  MAX_PASSWORD: 200,
  MAX_SEARCH: 255,
  MAX_REPORT: 1000,
  MAX_HASHTAG: 100,
  MAX_CALL_PAYLOAD: 500000,
  SESSION_DAYS: 30,
  RATE_LIMIT_WINDOW: 60000,
  RATE_LIMIT_MAX: 100,
  AUTH_RATE_LIMIT: 5,
  POST_RATE_LIMIT: 10,
  MESSAGE_RATE_LIMIT: 20,
  STORY_RATE_LIMIT: 5,
  JOB_RATE_LIMIT: 5,
  UPLOAD_DIR: path.join(__dirname, "uploads"),
  BACKUP_DIR: path.join(__dirname, "backups"),
  LOG_DIR: path.join(__dirname, "logs"),
  TEMP_DIR: path.join(__dirname, "temp"),
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"],
  ALLOWED_VIDEO_TYPES: ["video/mp4", "video/webm", "video/ogg"],
  MAX_VIDEO_SIZE: 10 * 1024 * 1024,
  MAX_STORY_VIDEO_SIZE: 5 * 1024 * 1024,
  MAX_REEL_SIZE: 15 * 1024 * 1024,
  STORY_EXPIRY_HOURS: 24,
  REEL_MAX_DURATION: 60,
  LIVE_MAX_DURATION: 3600,
  MAX_GROUP_MEMBERS: 100,
  MAX_GROUP_NAME: 100,
  DEFAULT_LANGUAGE: "fa",
  SUPPORTED_LANGUAGES: ["fa", "en", "ar", "tr", "de", "fr", "es", "ru", "ur", "hi"],
  THEMES: ["light", "dark", "system", "blue", "green", "red", "purple", "pink"],
  PRIVACY_LEVELS: ["public", "private", "followers", "mutual"],
  NOTIFICATION_TYPES: {
    LIKE: "like",
    COMMENT: "comment",
    FOLLOW: "follow",
    FOLLOW_REQUEST: "follow_request",
    FOLLOW_APPROVED: "follow_approved",
    MESSAGE: "message",
    MENTION: "mention",
    REPOST: "repost",
    STORY_VIEW: "story_view",
    STORY_REPLY: "story_reply",
    CALL: "call",
    LIVE_START: "live_start",
    LIVE_END: "live_end",
    POST_ARCHIVED: "post_archived",
    POST_UNARCHIVED: "post_unarchived",
    REPORT_RESOLVED: "report_resolved",
    ACCOUNT_VERIFIED: "account_verified",
    ACCOUNT_SUSPENDED: "account_suspended",
    ACCOUNT_UNSUSPENDED: "account_unsuspended",
    NEW_DEVICE: "new_device",
    PASSWORD_CHANGED: "password_changed",
    EMAIL_CHANGED: "email_changed",
    PROFILE_VIEW: "profile_view",
    SHARE: "share",
    SAVE: "save",
    UNSAVE: "unsave",
    JOB_APPLY: "job_apply",
    JOB_APPROVED: "job_approved",
    JOB_REJECTED: "job_rejected",
    REEL_LIKE: "reel_like",
    REEL_COMMENT: "reel_comment",
    LIVE_JOIN: "live_join",
    LIVE_LEAVE: "live_leave",
    LIVE_GIFT: "live_gift",
    STORY_HIGHLIGHT: "story_highlight",
    GROUP_INVITE: "group_invite",
    GROUP_JOIN: "group_join",
    GROUP_LEAVE: "group_leave",
    REACTION: "reaction"
  },
  REPORT_STATUS: {
    PENDING: "pending",
    REVIEWING: "reviewing",
    RESOLVED: "resolved",
    REJECTED: "rejected",
    DUPLICATE: "duplicate"
  },
  POST_STATUS: {
    PUBLISHED: "published",
    ARCHIVED: "archived",
    DELETED: "deleted",
    DRAFT: "draft",
    SCHEDULED: "scheduled",
    PENDING: "pending",
    REJECTED: "rejected"
  }
};

// ============================================================
// DIRECTORY CREATION
// ============================================================
const directories = [
  CONFIG.UPLOAD_DIR,
  CONFIG.BACKUP_DIR,
  CONFIG.LOG_DIR,
  CONFIG.TEMP_DIR,
  path.join(CONFIG.UPLOAD_DIR, "avatars"),
  path.join(CONFIG.UPLOAD_DIR, "posts"),
  path.join(CONFIG.UPLOAD_DIR, "stories"),
  path.join(CONFIG.UPLOAD_DIR, "reels"),
  path.join(CONFIG.UPLOAD_DIR, "messages"),
  path.join(CONFIG.UPLOAD_DIR, "lives"),
  path.join(CONFIG.UPLOAD_DIR, "temp"),
  path.join(CONFIG.UPLOAD_DIR, "thumbnails"),
  path.join(CONFIG.UPLOAD_DIR, "covers"),
  path.join(CONFIG.UPLOAD_DIR, "highlights"),
  path.join(CONFIG.UPLOAD_DIR, "documents")
];

for (const dir of directories) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================================
// LOGGING SYSTEM
// ============================================================
const logLevels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

let currentLogLevel = logLevels.INFO;

function setLogLevel(level) {
  if (logLevels[level] !== undefined) {
    currentLogLevel = logLevels[level];
  }
}

function getLogLevel() {
  return Object.keys(logLevels).find(key => logLevels[key] === currentLogLevel) || "INFO";
}

function logMessage(level, message, data = null) {
  const levelNum = logLevels[level];
  if (levelNum === undefined || levelNum > currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data: data || null
  };

  const logString = JSON.stringify(logEntry) + "\n";
  const logFile = path.join(CONFIG.LOG_DIR, `${new Date().toISOString().split("T")[0]}.log`);

  try {
    fs.appendFileSync(logFile, logString);
  } catch (error) {
    console.error("Failed to write log:", error);
  }

  if (level === "ERROR") {
    console.error(`[${timestamp}] ${level}: ${message}`, data || "");
  } else if (level === "WARN") {
    console.warn(`[${timestamp}] ${level}: ${message}`, data || "");
  } else {
    console.log(`[${timestamp}] ${level}: ${message}`, data || "");
  }
}

const logger = {
  error: (msg, data) => logMessage("ERROR", msg, data),
  warn: (msg, data) => logMessage("WARN", msg, data),
  info: (msg, data) => logMessage("INFO", msg, data),
  debug: (msg, data) => logMessage("DEBUG", msg, data),
  trace: (msg, data) => logMessage("TRACE", msg, data),
  setLevel: setLogLevel,
  getLevel: getLogLevel
};

// ============================================================
// SECURITY & CRYPTO
// ============================================================
function randomToken(size = 32) {
  return crypto.randomBytes(size).toString("hex");
}

function generateOTP(length = 6) {
  return Math.floor(Math.random() * Math.pow(10, length)).toString().padStart(length, "0");
}

function generateUUID() {
  return crypto.randomUUID();
}

function generateShortCode(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function encryptText(text, secret = JWT_SECRET) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secret.padEnd(32, "0").slice(0, 32)), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decryptText(text, secret = JWT_SECRET) {
  const parts = text.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(secret.padEnd(32, "0").slice(0, 32)), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function generateJWT(payload, expiresIn = "7d") {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (expiresIn === "7d" ? 604800 : 3600);

  const tokenPayload = {
    ...payload,
    iat: now,
    exp: exp
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch (error) {
    return null;
  }
}

function generateCSRFToken() {
  return randomToken(32);
}

function validateCSRFToken(token, sessionToken) {
  if (!token || !sessionToken) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(sessionToken));
}

function sanitizeInput(text) {
  if (!text) return "";
  return text
    .replace(/<script.*?>.*?<\/script>/gi, "")
    .replace(/on\w+=".*?"/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "");
}

function sanitizeHTML(text) {
  if (!text) return "";
  return escapeHtml(text);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function unescapeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function truncateText(value, max) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function safeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function safeFloat(value) {
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function safeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  }
  return Boolean(value);
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function isValidURL(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidPhone(phone) {
  const re = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
  return re.test(String(phone));
}

function isValidPassword(password) {
  return password && password.length >= 8 && password.length <= 100;
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_.]{3,30}$/.test(username);
}

function isValidTag(tag) {
  return /^[a-zA-Z0-9_\u0600-\u06FF]{2,30}$/.test(tag);
}

function getFileExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

function getMimeType(filename) {
  const ext = getFileExtension(filename);
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    txt: "text/plain",
    json: "application/json",
    xml: "application/xml",
    csv: "text/csv"
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function getFileSize(filepath) {
  try {
    return fs.statSync(filepath).size;
  } catch {
    return 0;
  }
}

function deleteFile(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  } catch (error) {
    logger.error("Delete file error:", { filepath, error: error.message });
    return false;
  }
}

function copyFile(source, destination) {
  try {
    fs.copyFileSync(source, destination);
    return true;
  } catch (error) {
    logger.error("Copy file error:", { source, destination, error: error.message });
    return false;
  }
}

function moveFile(source, destination) {
  try {
    fs.renameSync(source, destination);
    return true;
  } catch (error) {
    logger.error("Move file error:", { source, destination, error: error.message });
    return false;
  }
}

function createTempFile(content, extension = ".txt") {
  const filename = `${randomToken(16)}${extension}`;
  const filepath = path.join(CONFIG.TEMP_DIR, filename);
  fs.writeFileSync(filepath, content);
  return filepath;
}

function readFile(filepath) {
  try {
    return fs.readFileSync(filepath, "utf8");
  } catch {
    return null;
  }
}

function readFileBuffer(filepath) {
  try {
    return fs.readFileSync(filepath);
  } catch {
    return null;
  }
}

function writeFile(filepath, content) {
  try {
    fs.writeFileSync(filepath, content);
    return true;
  } catch {
    return false;
  }
}

function getDirectorySize(dirpath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirpath);
    for (const file of files) {
      const filepath = path.join(dirpath, file);
      if (fs.statSync(filepath).isDirectory()) {
        size += getDirectorySize(filepath);
      } else {
        size += fs.statSync(filepath).size;
      }
    }
  } catch {
    // Ignore errors
  }
  return size;
}

function cleanDirectory(dirpath, maxAge = 86400000) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(dirpath);
    for (const file of files) {
      const filepath = path.join(dirpath, file);
      const stats = fs.statSync(filepath);
      if (stats.isFile() && now - stats.mtimeMs > maxAge) {
        deleteFile(filepath);
      }
    }
  } catch {
    // Ignore errors
  }
}

// ============================================================
// IMAGE & VIDEO PROCESSING
// ============================================================
function isValidImage(file) {
  if (!file || !file.buffer) return false;
  if (file.buffer.length > CONFIG.MAX_AVATAR) return false;
  const mime = String(file.mime || "").toLowerCase();
  if (!CONFIG.ALLOWED_IMAGE_TYPES.includes(mime)) return false;

  const b = file.buffer;
  if (mime === "image/png") {
    return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  }
  if (mime === "image/gif") {
    return b.length >= 6 && b.toString("ascii", 0, 6) === "GIF8";
  }
  if (mime === "image/webp") {
    return b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  }
  if (mime === "image/svg+xml") {
    return b.toString("utf8", 0, Math.min(100, b.length)).includes("<svg");
  }
  return false;
}

function isValidVideo(file, maxSize = CONFIG.MAX_VIDEO_SIZE) {
  if (!file || !file.buffer) return false;
  if (file.buffer.length > maxSize) return false;
  const mime = String(file.mime || "").toLowerCase();
  return CONFIG.ALLOWED_VIDEO_TYPES.includes(mime);
}

function getImageDimensions(buffer) {
  try {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const height = buffer[offset + 5] * 256 + buffer[offset + 6];
          const width = buffer[offset + 7] * 256 + buffer[offset + 8];
          return { width, height };
        }
        offset += buffer[offset + 2] * 256 + buffer[offset + 3] + 2;
      }
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      if (buffer.length >= 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
    }
    return { width: 0, height: 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

function saveImage(buffer, subFolder = "posts") {
  const folderPath = path.join(CONFIG.UPLOAD_DIR, subFolder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  const filename = `${Date.now()}-${randomToken(12)}.jpg`;
  const filepath = path.join(folderPath, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${subFolder}/${filename}`;
}

function saveVideo(buffer, subFolder = "reels") {
  const folderPath = path.join(CONFIG.UPLOAD_DIR, subFolder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  const filename = `${Date.now()}-${randomToken(12)}.mp4`;
  const filepath = path.join(folderPath, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${subFolder}/${filename}`;
}

function deleteImage(filepath) {
  if (!filepath) return;
  const fullPath = path.join(__dirname, filepath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (error) {
      logger.error("Delete image error:", { filepath, error: error.message });
    }
  }
}

function getImageUrl(filepath) {
  if (!filepath) return null;
  if (filepath.startsWith("http")) return filepath;
  return filepath;
}

// ============================================================
// COOKIE & SESSION
// ============================================================
function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function cookieSession(sessionId) {
  return [
    `sessionId=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "Secure",
    "Path=/",
    `Max-Age=${CONFIG.SESSION_DAYS * 86400}`,
    "SameSite=Lax"
  ].join("; ");
}

function clearSessionCookie() {
  return [
    "sessionId=",
    "HttpOnly",
    "Secure",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax"
  ].join("; ");
}

// ============================================================
// HTTP HELPERS
// ============================================================
function redirect(res, location, cookie = null) {
  const headers = {
    Location: locat// ============================================================
// RATE LIMITER
// ============================================================
const rateLimitStore = new Map();

function rateLimiter(limit = 100, windowMs = 60000) {
  return function (req, res, next) {
    const key = `${req.socket.remoteAddress}:${req.url}`;
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, []);
    }

    const timestamps = rateLimitStore.get(key).filter(t => now - t < windowMs);
    timestamps.push(now);
    rateLimitStore.set(key, timestamps);

    if (timestamps.length > limit) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Too many requests. Please try again later.",
        retryAfter: Math.ceil((timestamps[0] + windowMs - now) / 1000)
      }));
      return;
    }

    next();
  };
}

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitStore.entries()) {
    const filtered = timestamps.filter(t => now - t < 60000);
    if (filtered.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, filtered);
    }
  }
}

setInterval(cleanupRateLimits, 60000);

// ============================================================
// DATE & TIME HELPERS
// ============================================================
function formatDate(value) {
  try {
    return new Date(value).toLocaleString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function formatDateShort(value) {
  try {
    return new Date(value).toLocaleString("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return "";
  }
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function timeAgo(value) {
  const now = Date.now();
  const diff = now - new Date(value).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} سال پیش`;
  if (months > 0) return `${months} ماه پیش`;
  if (days > 0) return `${days} روز پیش`;
  if (hours > 0) return `${hours} ساعت پیش`;
  if (minutes > 0) return `${minutes} دقیقه پیش`;
  return `${seconds} ثانیه پیش`;
}

function isExpired(date, expiryHours = CONFIG.STORY_EXPIRY_HOURS) {
  const now = new Date();
  const expiryDate = new Date(date);
  expiryDate.setHours(expiryDate.getHours() + expiryHours);
  return now > expiryDate;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addHours(date, hours) {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

// ============================================================
// DATABASE HELPERS
// ============================================================
async function tableExists(table) {
  const result = await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1
    ) exists
  `, [table]);
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(table, column) {
  const result = await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2
    ) exists
  `, [table, column]);
  return Boolean(result.rows[0]?.exists);
}

async function ensureColumn(table, column, definition) {
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
}

async function createTables() {
  logger.info("Creating tables...");

  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(30) UNIQUE,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(200) UNIQUE NOT NULL,
      phone VARCHAR(20) UNIQUE,
      password VARCHAR(255) NOT NULL,
      bio TEXT,
      avatar_url TEXT,
      cover_url TEXT,
      is_private BOOLEAN DEFAULT FALSE,
      is_verified BOOLEAN DEFAULT FALSE,
      is_admin BOOLEAN DEFAULT FALSE,
      is_suspended BOOLEAN DEFAULT FALSE,
      suspended_reason TEXT,
      last_active TIMESTAMP,
      theme VARCHAR(20) DEFAULT 'light',
      language VARCHAR(5) DEFAULT 'fa',
      notification_enabled BOOLEAN DEFAULT TRUE,
      email_notification BOOLEAN DEFAULT TRUE,
      push_notification BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("users", "username", "VARCHAR(30) UNIQUE");
  await ensureColumn("users", "phone", "VARCHAR(20) UNIQUE");
  await ensureColumn("users", "cover_url", "TEXT");
  await ensureColumn("users", "is_verified", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("users", "is_suspended", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("users", "suspended_reason", "TEXT");
  await ensureColumn("users", "last_active", "TIMESTAMP");
  await ensureColumn("users", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("users", "theme", "VARCHAR(20) DEFAULT 'light'");
  await ensureColumn("users", "language", "VARCHAR(5) DEFAULT 'fa'");
  await ensureColumn("users", "notification_enabled", "BOOLEAN DEFAULT TRUE");
  await ensureColumn("users", "email_notification", "BOOLEAN DEFAULT TRUE");
  await ensureColumn("users", "push_notification", "BOOLEAN DEFAULT TRUE");

  // Sessions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address VARCHAR(45),
      user_agent TEXT,
      device_info TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
    )
  `);

  await ensureColumn("sessions", "ip_address", "VARCHAR(45)");
  await ensureColumn("sessions", "user_agent", "TEXT");
  await ensureColumn("sessions", "device_info", "TEXT");
  await ensureColumn("sessions", "expires_at", "TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')");

  // Posts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      image_url TEXT,
      video_url TEXT,
      album_images TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_archived BOOLEAN DEFAULT FALSE,
      is_pinned BOOLEAN DEFAULT FALSE,
      status VARCHAR(20) DEFAULT 'published',
      scheduled_at TIMESTAMP,
      location TEXT,
      view_count INTEGER DEFAULT 0,
      share_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      repost_count INTEGER DEFAULT 0
    )
  `);

  await ensureColumn("posts", "video_url", "TEXT");
  await ensureColumn("posts", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("posts", "is_pinned", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("posts", "status", "VARCHAR(20) DEFAULT 'published'");
  await ensureColumn("posts", "scheduled_at", "TIMESTAMP");
  await ensureColumn("posts", "location", "TEXT");
  await ensureColumn("posts", "view_count", "INTEGER DEFAULT 0");
  await ensureColumn("posts", "share_count", "INTEGER DEFAULT 0");
  await ensureColumn("posts", "comment_count", "INTEGER DEFAULT 0");
  await ensureColumn("posts", "like_count", "INTEGER DEFAULT 0");
  await ensureColumn("posts", "repost_count", "INTEGER DEFAULT 0");
  await ensureColumn("posts", "album_images", "TEXT[]");

  // Likes table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    )
  `);

  // Comments table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      comment TEXT NOT NULL,
      parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      like_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0
    )
  `);

  await ensureColumn("comments", "parent_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE");
  await ensureColumn("comments", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("comments", "like_count", "INTEGER DEFAULT 0");
  await ensureColumn("comments", "reply_count", "INTEGER DEFAULT 0");

  // Follows table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id)
    )
  `);

  // Follow requests table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS follow_requests (
      id SERIAL PRIMARY KEY,
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id)
    )
  `);

  await ensureColumn("follow_requests", "message", "TEXT");

  // Bookmarks table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    )
  `);

  // Blocked users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id SERIAL PRIMARY KEY,
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id)
    )
  `);

  await ensureColumn("blocked_users", "reason", "TEXT");

  // Messages table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT,
      image_url TEXT,
      video_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMP,
      delivered_at TIMESTAMP,
      deleted_for_sender BOOLEAN DEFAULT FALSE,
      deleted_for_receiver BOOLEAN DEFAULT FALSE,
      is_forwarded BOOLEAN DEFAULT FALSE,
      reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      group_id INTEGER,
      seen_at TIMESTAMP
    )
  `);

  await ensureColumn("messages", "video_url", "TEXT");
  await ensureColumn("messages", "delivered_at", "TIMESTAMP");
  await ensureColumn("messages", "deleted_for_sender", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("messages", "deleted_for_receiver", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("messages", "is_forwarded", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("messages", "reply_to_id", "INTEGER REFERENCES messages(id) ON DELETE SET NULL");
  await ensureColumn("messages", "group_id", "INTEGER");
  await ensureColumn("messages", "seen_at", "TIMESTAMP");

  // Chat groups table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      avatar_url TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_private BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("chat_groups", "description", "TEXT");
  await ensureColumn("chat_groups", "avatar_url", "TEXT");
  await ensureColumn("chat_groups", "is_private", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("chat_groups", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  // Group members table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_admin BOOLEAN DEFAULT FALSE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id)
    )
  `);

  await ensureColumn("group_members", "is_admin", "BOOLEAN DEFAULT FALSE");

  // Message reactions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id)
    )
  `);

  // Notifications table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      is_seen BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      link TEXT
    )
  `);

  await ensureColumn("notifications", "comment_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE");
  await ensureColumn("notifications", "is_seen", "BOOLEAN DEFAULT FALSE");
  await ensureColumn("notifications", "link", "TEXT");

  // Reports table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("reports", "comment_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE");
  await ensureColumn("reports", "details", "TEXT");
  await ensureColumn("reports", "status", "VARCHAR(20) DEFAULT 'pending'");
  await ensureColumn("reports", "admin_note", "TEXT");
  await ensureColumn("reports", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  // Stories table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url TEXT,
      video_url TEXT,
      content TEXT,
      background_color VARCHAR(7),
      font_color VARCHAR(7),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
      view_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0
    )
  `);

  await ensureColumn("stories", "video_url", "TEXT");
  await ensureColumn("stories", "background_color", "VARCHAR(7)");
  await ensureColumn("stories", "font_color", "VARCHAR(7)");
  await ensureColumn("stories", "view_count", "INTEGER DEFAULT 0");
  await ensureColumn("stories", "reply_count", "INTEGER DEFAULT 0");

  // Story views table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS story_views (
      id SERIAL PRIMARY KEY,
      story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(story_id, user_id)
    )
  `);

  // Story replies table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS story_replies (
      id SERIAL PRIMARY KEY,
      story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("story_replies", "image_url", "TEXT");

  // Story highlights table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS story_highlights (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      cover_image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("story_highlights", "cover_image_url", "TEXT");
  await ensureColumn("story_highlights", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  // Highlight stories table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS highlight_stories (
      id SERIAL PRIMARY KEY,
      highlight_id INTEGER NOT NULL REFERENCES story_highlights(id) ON DELETE CASCADE,
      story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(highlight_id, story_id)
    )
  `);

  // Reposts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reposts (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    )
  `);

  // Hashtags table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hashtags (
      id SERIAL PRIMARY KEY,
      tag VARCHAR(100) UNIQUE NOT NULL,
      post_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("hashtags", "post_count", "INTEGER DEFAULT 0");
  await ensureColumn("hashtags", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  // Post hashtags table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_hashtags (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      hashtag_id INTEGER NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
      UNIQUE(post_id, hashtag_id)
    )
  `);

  // Archived posts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS archived_posts (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Call signals table
  await pool.qu// ============================================================
// SESSION MANAGEMENT
// ============================================================
async function createSession(userId, req = null) {
  const sessionId = randomToken(48);
  const ipAddress = req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || null;
  const userAgent = req?.headers?.["user-agent"] || null;
  const deviceInfo = userAgent ? parseUserAgent(userAgent) : null;

  await pool.query(`
    INSERT INTO sessions(session_id, user_id, ip_address, user_agent, device_info)
    VALUES($1, $2, $3, $4, $5)
  `, [sessionId, userId, ipAddress, userAgent, deviceInfo]);

  await pool.query(`
    UPDATE users SET last_active = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [userId]);

  return sessionId;
}

function parseUserAgent(userAgent) {
  if (!userAgent) return null;
  let device = "Unknown";
  if (userAgent.includes("Mobile")) device = "Mobile";
  else if (userAgent.includes("Tablet")) device = "Tablet";
  else if (userAgent.includes("Windows")) device = "Windows";
  else if (userAgent.includes("Mac")) device = "Mac";
  else if (userAgent.includes("Linux")) device = "Linux";
  else if (userAgent.includes("Android")) device = "Android";
  else if (userAgent.includes("iPhone")) device = "iPhone";
  else if (userAgent.includes("iPad")) device = "iPad";
  return device;
}

async function getSession(req) {
  const sessionId = parseCookies(req).sessionId;
  if (!sessionId) return null;

  const result = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.email,
      u.phone,
      u.bio,
      u.avatar_url,
      u.cover_url,
      u.created_at,
      u.is_private,
      u.is_verified,
      u.is_admin,
      u.is_suspended,
      u.last_active,
      u.theme,
      u.language,
      u.notification_enabled,
      s.session_id,
      s.created_at as session_created
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_id = $1 AND s.expires_at > CURRENT_TIMESTAMP
  `, [sessionId]);

  if (!result.rows.length) {
    await pool.query(`DELETE FROM sessions WHERE session_id = $1`, [sessionId]);
    return null;
  }

  const user = result.rows[0];

  await pool.query(`
    UPDATE users SET last_active = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [user.id]);

  // Get unread notification count
  const unreadCount = await pool.query(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = $1 AND is_read = FALSE
  `, [user.id]);
  user.notification_count = parseInt(unreadCount.rows[0]?.count || 0);

  // Get unread message count
  const messageCount = await pool.query(`
    SELECT COUNT(*) as count FROM messages
    WHERE receiver_id = $1 AND read_at IS NULL
  `, [user.id]);
  user.message_count = parseInt(messageCount.rows[0]?.count || 0);

  return user;
}

async function requireUser(req, res) {
  const user = await getSession(req);
  if (!user) {
    redirect(res, "/login");
    return null;
  }
  if (user.is_suspended) {
    sendError(res, 403, "حساب کاربری شما مسدود شده است.", user);
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.is_admin) {
    sendError(res, 403, "شما دسترسی ادمین ندارید.", user);
    return null;
  }
  return user;
}

// ============================================================
// BLOCK & NOTIFICATION HELPERS
// ============================================================
async function areBlocked(a, b) {
  if (!a || !b || a === b) return false;
  const result = await pool.query(`
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = $1 AND blocked_id = $2)
       OR (blocker_id = $2 AND blocked_id = $1)
    LIMIT 1
  `, [a, b]);
  return result.rows.length > 0;
}

async function getBlockedUserIds(userId) {
  const result = await pool.query(`
    SELECT blocked_id FROM blocked_users
    WHERE blocker_id = $1
  `, [userId]);
  return result.rows.map(r => r.blocked_id);
}

async function getBlockerUserIds(userId) {
  const result = await pool.query(`
    SELECT blocker_id FROM blocked_users
    WHERE blocked_id = $1
  `, [userId]);
  return result.rows.map(r => r.blocker_id);
}

async function canInteract(userId, targetId) {
  if (!userId || !targetId || userId === targetId) return true;
  return !(await areBlocked(userId, targetId));
}

async function getFollowStatus(followerId, followingId) {
  if (!followerId || !followingId || followerId === followingId) {
    return { isFollowing: false, isFollowRequested: false };
  }

  const following = await pool.query(`
    SELECT 1 FROM follows
    WHERE follower_id = $1 AND following_id = $2
  `, [followerId, followingId]);

  const requested = await pool.query(`
    SELECT 1 FROM follow_requests
    WHERE follower_id = $1 AND following_id = $2
  `, [followerId, followingId]);

  return {
    isFollowing: following.rows.length > 0,
    isFollowRequested: requested.rows.length > 0
  };
}

async function getFollowerCount(userId) {
  const result = await pool.query(`
    SELECT COUNT(*) as count FROM follows
    WHERE following_id = $1
  `, [userId]);
  return parseInt(result.rows[0]?.count || 0);
}

async function getFollowingCount(userId) {
  const result = await pool.query(`
    SELECT COUNT(*) as count FROM follows
    WHERE follower_id = $1
  `, [userId]);
  return parseInt(result.rows[0]?.count || 0);
}

async function getFollowers(userId, limit = 50, offset = 0) {
  const result = await pool.query(`
    SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.is_private, u.is_verified
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = $1
    ORDER BY f.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
  return result.rows;
}

async function getFollowing(userId, limit = 50, offset = 0) {
  const result = await pool.query(`
    SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.is_private, u.is_verified
    FROM follows f
    JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = $1
    ORDER BY f.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
  return result.rows;
}

async function getMutualFollowers(userId, targetId) {
  const result = await pool.query(`
    SELECT u.id, u.name, u.username, u.avatar_url
    FROM users u
    WHERE u.id IN (
      SELECT f1.follower_id
      FROM follows f1
      WHERE f1.following_id = $1
      AND f1.follower_id IN (
        SELECT f2.follower_id
        FROM follows f2
        WHERE f2.following_id = $2
      )
    )
  `, [userId, targetId]);
  return result.rows;
}

async function getUserSuggestions(userId, limit = 10) {
  const result = await pool.query(`
    SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.is_verified,
      (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as follower_count
    FROM users u
    WHERE u.id != $1
      AND u.is_suspended = FALSE
      AND NOT EXISTS(
        SELECT 1 FROM follows f
        WHERE f.follower_id = $1 AND f.following_id = u.id
      )
      AND NOT EXISTS(
        SELECT 1 FROM blocked_users b
        WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
           OR (b.blocker_id = u.id AND b.blocked_id = $1)
      )
    ORDER BY follower_count DESC, RANDOM()
    LIMIT $2
  `, [userId, limit]);
  return result.rows;
}

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================
async function createNotification(userId, actorId, type, postId, message, commentId = null, link = null) {
  if (!userId || userId === actorId) return;

  try {
    const result = await pool.query(`
      INSERT INTO notifications(user_id, actor_id, type, post_id, comment_id, message, link)
      VALUES($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [userId, actorId || null, type, postId || null, commentId || null, message, link || null]);

    return result.rows[0]?.id;
  } catch (error) {
    logger.error("Create notification error:", { userId, actorId, type, error: error.message });
    return null;
  }
}

async function getNotifications(userId, limit = 50, offset = 0) {
  const result = await pool.query(`
    SELECT
      n.id,
      n.type,
      n.message,
      n.is_read,
      n.is_seen,
      n.created_at,
      n.link,
      u.id as actor_id,
      u.name as actor_name,
      u.username as actor_username,
      u.avatar_url as actor_avatar,
      u.is_verified as actor_verified,
      p.id as post_id,
      p.image_url as post_image,
      c.id as comment_id,
      c.comment as comment_text
    FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    LEFT JOIN comments c ON c.id = n.comment_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);

  return result.rows;
}

async function markNotificationRead(notificationId, userId) {
  await pool.query(`
    UPDATE notifications
    SET is_read = TRUE, is_seen = TRUE
    WHERE id = $1 AND user_id = $2
  `, [notificationId, userId]);
}

async function markAllNotificationsRead(userId) {
  await pool.query(`
    UPDATE notifications
    SET is_read = TRUE, is_seen = TRUE
    WHERE user_id = $1
  `, [userId]);
}

async function getUnreadNotificationCount(userId) {
  const result = await pool.query(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = $1 AND is_read = FALSE
  `, [userId]);
  return parseInt(result.rows[0]?.count || 0);
}

async function deleteNotification(notificationId, userId) {
  await pool.query(`
    DELETE FROM notifications
    WHERE id = $1 AND user_id = $2
  `, [notificationId, userId]);
}

async function deleteAllNotifications(userId) {
  await pool.query(`
    DELETE FROM notifications
    WHERE user_id = $1
  `, [userId]);
}

// ============================================================
// HTML COMPONENTS
// ============================================================
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return escapeHtml(parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return escapeHtml(name.charAt(0)).toUpperCase();
}

function avatarHtml(user, large = false, size = null) {
  const sz = size || (large ? "70px" : "52px");

  if (user && user.avatar_url) {
    return `
      <div class="avatar" style="width:${sz};height:${sz};overflow:hidden;padding:0;">
        <img src="${escapeAttr(user.avatar_url)}" alt="پروفایل" style="width:100%;height:100%;object-fit:cover;">
      </div>
    `;
  }

  return `
    <div class="avatar" style="width:${sz};height:${sz};">
      ${initials(user && user.name)}
    </div>
  `;
}

function userBadgeHtml(user) {
  if (!user) return "";
  let html = "";
  if (user.is_verified) html += `<span class="badge verified">✅ تایید شده</span>`;
  if (user.is_admin) html += `<span class="badge admin">👑 ادمین</span>`;
  if (user.is_private) html += `<span class="badge private">🔒 خصوصی</span>`;
  return html;
}

// ============================================================
// POST CARD COMPONENT
// ============================================================
function postCard(post, user, showComments = true) {
  if (!post) return "";

  const liked = Boolean(post.liked);
  const bookmarked = Boolean(post.bookmarked);
  const reposted = Boolean(post.reposted);
  const likeCount = Number(post.like_count || 0);
  const commentCount = Number(post.comment_count || 0);
  const repostCount = Number(post.repost_count || 0);
  const isOwner = Number(post.user_id) === Number(user?.id);

  const imageHtml = post.image_url ? `
    <img class="post-image" src="${escapeAttr(post.image_url)}" alt="تصویر پست" loading="lazy">
  ` : "";

  const videoHtml = post.video_url ? `
    <video class="post-video" src="${escapeAttr(post.video_url)}" controls poster="${escapeAttr(post.image_url || '')}" style="width:100%;max-height:520px;border-radius:14px;margin-top:10px;"></video>
  ` : "";

  // Album images
  let albumHtml = "";
  if (post.album_images && Array.isArray(post.album_images) && post.album_images.length > 0) {
    albumHtml = `<div class="album-grid" style="display:grid;grid-template-columns:repeat(${Math.min(post.album_images.length, 3)},1fr);gap:4px;margin-top:10px;">`;
    for (const img of post.album_images) {
      albumHtml += `<img src="${escapeAttr(img)}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;">`;
    }
    albumHtml += `</div>`;
  }

  const mediaHtml = imageHtml || videoHtml || albumHtml;

  return `
    <article class="card post-card" data-post-id="${post.id}">
      <div class="profile-head">
        <a href="/profile?id=${post.user_id}">${avatarHtml(post)}</a>
        <div style="flex:1">
          <a href="/profile?id=${post.user_id}">
            <div class="username">
              ${escapeHtml(post.name)}
              ${post.is_verified ? '✅' : ''}
            </div>
          </a>
          <div class="email">${escapeHtml(post.email || '')}</div>
          <div class="small">${formatDate(post.created_at)}</div>
        </div>
        ${isOwner ? `
          <div class="dropdown">
            <button class="dropdown-toggle" onclick="toggleDropdown(this)">⚙️</button>
            <div class="dropdown-menu" style="display:none;">
              <a href="/edit-post?id=${post.id}">✏️ ویرایش</a>
              <a href="/archive-post?id=${post.id}">📦 بایگانی</a>
              <a href="/pin-post?id=${post.id}">📌 پین</a>
              <a href="/delete-post?id=${post.id}" class="danger">🗑️ حذف</a>
            </div>
          </div>
        ` : ''}
      </div>

      ${post.content ? `<div class="post-text">${escapeHtml(post.content)}</div>` : ''}

      ${mediaHtml}

      ${post.location ? `<div class="post-location">📍 ${escapeHtml(post.location)}</div>` : ''}

      <div class="stats">
        <span>❤️ ${likeCount}</span>
        <span>💬 ${commentCount}</span>
        <span>🔄 ${repostCount}</span>
        <span>👁️ ${post.view_count || 0}</span>
      </div>

      <div class="actions">
        <a href="/like?post=${post.id}" class="action-btn like-btn ${liked ? 'active' : ''}">
          ${liked ? '💔' : '❤️'} ${liked ? 'برداشتن لایک' : 'لایک'}
        </a>
        <a href="/post?id=${post.id}" class="action-btn">
          💬 نظرها
        </a>
        <a href="/bookmark?post=${post.id}" class="action-btn bookmark-btn ${bookmarked ? 'active' : ''}">
          ${bookmarked ? '🔖 ذخیره‌شده' : '🔖 ذخیره'}
        </a>
        <a href="/repost?post=${post.id}" class="action-btn repost-btn ${reposted ? 'active' : ''}">
          ${reposted ? '↩️ برداشتن ریپست' : '🔄 ریپست'}
        </a>
        <a href="/report?post=${post.id}" class="action-btn danger">🚩 گزارش</a>
        <a href="/share?post=${post.id}" class="action-btn">📤 اشتراک</a>
      </div>

      ${showComments ? `
        <div class="divider"></div>
        <div class="comments-section">
          <form method="POST" action="/comment" class="comment-form">
            <input type="hidden" name="post_id" value="${post.id}">
            <div class="comment-input-wrapper">
              <input name="comment" maxlength="${CONFIG.MAX_COMMENT}" placeholder="نظر خود را بنویس..." required>
              <button type="submit" class="comment-submit">💬</button>
            </div>
          </form>
        </div>
      ` : ''}
    </article>
  `;
}

// ============================================================
// PAGE GENERATOR
// ============================================================
function page(title, content, user = null) {
  const isDark = user?.theme === "dark" || user?.theme === "system";

  const nav = user ? `
    <nav class="bottom-nav">
      <a href="/"><span>🏠</span>خانه</a>
      <a href="/search"><span>🔎</span>جستجو</a>
      <a href="/new-post"><span>➕</span>پست</a>
      <a href="/stories"><span>📸</span>استوری</a>
      <a href="/messages"><span>💬</span>پیام</a>
      <a href="/profile"><span>👤</span>پروفایل</a>
    </nav>
  ` : "";

  const topMenu = user ? `
    <div class="top-actions">
      <a href="/notifications" class="notification-link">
        🔔 اعلان‌ها
        ${user.notification_count > 0 ? `<span class="badge count">${user.notification_count}</span>` : ''}
      </a>
      <a href="/explore">🔍 اکتشاف</a>
      <a href="/reels">🎬 ریلز</a>
      <a href="/live">📡 لایو</a>
      <a href="/jobs">💼 کاریابی</a>
      <a href="/calls">📞 تماس‌ها</a>
      <a href="/saved">🔖 ذخیره‌ها</a>
      <a href="/settings">⚙️ تنظیمات</a>
      ${user.is_admin ? `<a href="/admin">🛡️ ادمین</a>` : ''}
      <a href="/logout">🚪 خروج</a>
    </div>
  ` : "";

  const themeClass = isDark ? "dark" : "";
  const themeScript = `
    <script>
      if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
      }
    </script>
  `;

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#202124">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <title>${escapeHtml(title)}</title>
  ${themeScript}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: #eef1f5;
      color: #202124;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      transition: background-color 0.3s, color 0.3s;
    }
    .app {
      width: 100%;
      max-width: 760px;
      min-height: 100vh;
      margin: auto;
      background: #fff;
      padding-bottom: ${user ? "90px" : "25px"};
      transition: background-color 0.3s;
    }
    .header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #fff;
      border-bottom: 1px solid #e4e7eb;
      padding: 12px 15px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: background-color 0.3s, border-color 0.3s;
    }
    .logo {
      font-weight: 900;
      font-size: 20px;
      color: #e1306c;
    }
    .title {
      font-size: 16px;
      font-weight: 700;
      color: #202124;
    }
    .content { padding: 14px; }
    .card {
      background: #fff;
      border: 1px solid #e1e5ea;
      border-radius: 18px;
      padding: 16px;
      margin-bottom: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      transition: background-color 0.3s, border-color 0.3s, box-shadow 0.3s;
    }
    .profile-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .profile-center { text-align: center; }
    .avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #405de6, #5851db, #833ab4, #c13584, #e1306c, #fd1d1d);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: bold;
      flex: none;
    }
    .avatar img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .username { font-weight: 800; font-size: 16px; color: #262626; }
    .email { color: #777; font-size: 12px; margin-top: 2px; direction: ltr; text-align: right; }
    .post-text { margin: 14px 0; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
    .stats {
      display: flex;
      gap: 16px;
      color: #666;
      font-size: 13px;
      flex-wrap: wrap;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #eef1f5;
    }
    .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .actions .action-btn {
      bor  // ============================================================
// SERVER HANDLER - PART 1 (PUBLIC ROUTES & AUTH)
// ============================================================
const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const path = requestUrl.pathname;
    const user = await getSession(req);

    // ============================================================
    // PUBLIC ROUTES
    // ============================================================

    // HOME
    if (req.method === "GET" && path === "/") {
      if (!user) {
        sendHtml(res, 200, "خوش آمدید", `
          <div class="hero">
            <h1>به MySocial خوش آمدید 👋</h1>
            <p>یک شبکه اجتماعی کامل با تمام امکانات اینستاگرام</p>
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
              <a href="/signup"><button class="green">📝 ثبت‌نام</button></a>
              <a href="/login"><button>🔐 ورود</button></a>
            </div>
          </div>
          <div class="card">
            <h3>✨ امکانات</h3>
            <ul style="list-style:none;padding:0;line-height:2.2;">
              <li>📸 پست با تصویر، ویدئو و آلبوم</li>
              <li>📖 استوری ۲۴ ساعته با نظرسنجی و سوال</li>
              <li>🎬 ریلز (ویدئوهای کوتاه با موسیقی)</li>
              <li>📡 لایو استریم با چت زنده</li>
              <li>💬 پیام‌رسانی با تصویر و گروه</li>
              <li>📞 تماس صوتی و تصویری (WebRTC)</li>
              <li>💼 کاریابی با درخواست آنلاین</li>
              <li>🔍 جستجو و اکتشاف</li>
              <li>🛡️ امنیت کامل</li>
              <li>🌓 حالت تاریک</li>
            </ul>
          </div>
        `);
        return;
      }

      // Get live streams
      const liveStreams = await pool.query(`
        SELECT ls.*, u.name, u.avatar_url, u.is_verified
        FROM live_streams ls
        JOIN users u ON u.id = ls.user_id
        WHERE ls.status = 'live'
        ORDER BY ls.start_time DESC
        LIMIT 5
      `);

      // Get stories
      const stories = await pool.query(`
        SELECT s.*, u.name, u.avatar_url, u.is_verified
        FROM stories s
        JOIN users u ON u.id = s.user_id
        WHERE s.expires_at > CURRENT_TIMESTAMP
        AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $1 AND b.blocked_id = s.user_id) OR (b.blocker_id = s.user_id AND b.blocked_id = $1))
        ORDER BY s.created_at DESC
        LIMIT 20
      `, [user.id]);

      // Get posts
      const posts = await pool.query(`
        SELECT
          p.*,
          u.name,
          u.email,
          u.avatar_url,
          u.is_verified,
          (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
          (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id) as repost_count,
          EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $1) as liked,
          EXISTS(SELECT 1 FROM bookmarks b2 WHERE b2.post_id = p.id AND b2.user_id = $1) as bookmarked,
          EXISTS(SELECT 1 FROM reposts r2 WHERE r2.post_id = p.id AND r2.user_id = $1) as reposted
        FROM posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.status = 'published'
        AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = $1))
        AND (p.is_archived = FALSE OR p.user_id = $1)
        ORDER BY p.created_at DESC
        LIMIT 50
      `, [user.id]);

      let html = `
        <div class="card">
          <div class="profile-head">
            ${avatarHtml(user)}
            <div>
              <div class="username">خوش آمدی ${escapeHtml(user.name)} 👋</div>
              <div class="email">${escapeHtml(user.email)}</div>
            </div>
          </div>
        </div>
        <a href="/new-post"><button class="full green">➕ انتشار پست جدید</button></a>
      `;

      // Stories section
      if (stories.rows.length > 0) {
        html += `<div class="card"><h3>📸 استوری‌ها</h3><div style="display:flex;overflow-x:auto;gap:10px;padding:8px 0;">`;
        html += `<div class="story-circle" onclick="location.href='/new-story'"><div class="avatar" style="width:64px;height:64px;border:2px solid #e1306c;">➕</div></div>`;
        for (const story of stories.rows) {
          const viewed = await pool.query(`SELECT 1 FROM story_views WHERE story_id = $1 AND user_id = $2`, [story.id, user.id]);
          html += `
            <div class="story-circle" onclick="location.href='/story/${story.id}'">
              ${story.image_url ? `<img src="${escapeAttr(story.image_url)}" alt="استوری">` : `<div class="avatar" style="width:64px;height:64px;font-size:14px;">${initials(story.name)}</div>`}
              <div style="font-size:10px;text-align:center;margin-top:2px;">${escapeHtml(story.name)}</div>
            </div>
          `;
        }
        html += `</div></div>`;
      }

      // Live streams section
      if (liveStreams.rows.length > 0) {
        html += `<div class="card"><h3>📡 لایو زنده</h3>`;
        for (const stream of liveStreams.rows) {
          html += `
            <div class="job" style="cursor:pointer;" onclick="location.href='/live/${stream.id}'">
              <div style="display:flex;align-items:center;gap:10px;">
                ${avatarHtml(stream)}
                <div>
                  <div class="username">${escapeHtml(stream.name)} ${stream.is_verified ? '✅' : ''}</div>
                  <div class="small">🔴 زنده - ${stream.viewer_count} بیننده</div>
                </div>
              </div>
              <div style="font-weight:bold;margin-top:5px;">${escapeHtml(stream.title)}</div>
            </div>
          `;
        }
        html += `</div>`;
      }

      // Posts
      if (posts.rows.length) {
        for (const post of posts.rows) {
          html += postCard(post, user, false);
        }
      } else {
        html += `<div class="card empty">هنوز پستی منتشر نشده است. اولین پست را منتشر کن! 📸</div>`;
      }

      sendHtml(res, 200, "خانه", html, user);
      return;
    }

    // SIGNUP
    if (req.method === "GET" && path === "/signup") {
      if (user) { redirect(res, "/"); return; }
      sendHtml(res, 200, "ثبت‌نام", `
        <div class="card">
          <h2>📝 ایجاد حساب</h2>
          <form method="POST" action="/signup">
            <input name="name" maxlength="${CONFIG.MAX_NAME}" placeholder="نام و نام خانوادگی" required>
            <input name="username" maxlength="30" placeholder="نام کاربری (اختیاری)">
            <input name="email" type="email" maxlength="${CONFIG.MAX_EMAIL}" placeholder="ایمیل" required>
            <input name="phone" type="tel" maxlength="20" placeholder="شماره موبایل (اختیاری)">
            <input name="password" type="password" minlength="8" maxlength="${CONFIG.MAX_PASSWORD}" placeholder="رمز عبور (حداقل ۸ کاراکتر)" required>
            <input name="password2" type="password" minlength="8" maxlength="${CONFIG.MAX_PASSWORD}" placeholder="تکرار رمز عبور" required>
            <button class="full green">ثبت‌نام</button>
          </form>
        </div>
        <a href="/login"><button class="full">قبلاً حساب دارم</button></a>
      `);
      return;
    }

    if (req.method === "POST" && path === "/signup") {
      rateLimiter(CONFIG.AUTH_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const data = await readBody(req);
        const name = trimText(data.get("name"), CONFIG.MAX_NAME);
        const username = trimText(data.get("username"), 30) || null;
        const email = trimText(data.get("email"), CONFIG.MAX_EMAIL).toLowerCase();
        const phone = trimText(data.get("phone"), 20) || null;
        const password = String(data.get("password") || "");
        const password2 = String(data.get("password2") || "");

        if (!name || !email || !isValidEmail(email) || !isValidPassword(password) || password !== password2) {
          sendError(res, 400, "اطلاعات نامعتبر است. ایمیل و رمز عبور را بررسی کنید.");
          return;
        }

        if (username && !isValidUsername(username)) {
          sendError(res, 400, "نام کاربری باید بین ۳ تا ۳۰ کاراکتر و شامل حروف، اعداد، زیرخط و نقطه باشد.");
          return;
        }

        try {
          const hashedPassword = hashPassword(password);
          const result = await pool.query(`
            INSERT INTO users(name, username, email, phone, password)
            VALUES($1, $2, $3, $4, $5)
            RETURNING id
          `, [name, username, email, phone, hashedPassword]);

          const sessionId = await createSession(result.rows[0].id, req);
          redirect(res, "/", cookieSession(sessionId));
        } catch (error) {
          if (error.message.includes("duplicate key")) {
            sendError(res, 400, "ایمیل، نام کاربری یا شماره موبایل قبلاً ثبت شده است.");
          } else {
            logger.error("Signup error:", error.message);
            sendError(res, 500, "خطا در ثبت‌نام. لطفاً دوباره تلاش کنید.");
          }
        }
      });
      return;
    }

    // LOGIN
    if (req.method === "GET" && path === "/login") {
      if (user) { redirect(res, "/"); return; }
      sendHtml(res, 200, "ورود", `
        <div class="card">
          <h2>🔐 ورود</h2>
          <form method="POST" action="/login">
            <input name="email" type="email" placeholder="ایمیل یا شماره موبایل" required>
            <input name="password" type="password" placeholder="رمز عبور" required>
            <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0;">
              <label><input type="checkbox" name="remember"> مرا به خاطر بسپار</label>
              <a href="/forgot-password" style="color:#0095f6;font-size:13px;">رمز عبور را فراموش کرده‌اید؟</a>
            </div>
            <button class="full">ورود</button>
          </form>
        </div>
        <a href="/signup"><button class="full">ثبت‌نام</button></a>
      `);
      return;
    }

    if (req.method === "POST" && path === "/login") {
      rateLimiter(CONFIG.AUTH_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const data = await readBody(req);
        const email = trimText(data.get("email"), CONFIG.MAX_EMAIL).toLowerCase();
        const password = String(data.get("password") || "");

        const result = await pool.query(`
          SELECT id, password, is_suspended FROM users
          WHERE email = $1 OR phone = $1
          LIMIT 1
        `, [email]);

        if (!result.rows.length || !verifyPassword(password, result.rows[0].password)) {
          sendError(res, 401, "ایمیل یا رمز عبور اشتباه است.");
          return;
        }

        if (result.rows[0].is_suspended) {
          sendError(res, 403, "حساب کاربری شما مسدود شده است.");
          return;
        }

        const sessionId = await createSession(result.rows[0].id, req);
        redirect(res, "/", cookieSession(sessionId));
      });
      return;
    }

    // LOGOUT
    if (req.method === "GET" && path === "/logout") {
      const sessionId = parseCookies(req).sessionId;
      if (sessionId) {
        await pool.query(`DELETE FROM sessions WHERE session_id = $1`, [sessionId]);
      }
      redirect(res, "/", clearSessionCookie());
      return;
    }

    // ============================================================
    // AUTH REQUIRED ROUTES
    // ============================================================

    const currentUser = await requireUser(req, res);
    if (!currentUser) return;

    // NEW POST
    if (req.method === "GET" && path === "/new-post") {
      sendHtml(res, 200, "پست جدید", `
        <div class="card">
          <h2>➕ انتشار پست</h2>
          <form method="POST" action="/new-post" enctype="multipart/form-data">
            <textarea name="content" maxlength="${CONFIG.MAX_POST}" placeholder="چه خبر؟"></textarea>
            <label>🖼️ تصویر</label>
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif">
            <label>🎬 ویدئو</label>
            <input type="file" name="video" accept="video/mp4,video/webm,video/ogg">
            <label>🖼️ آلبوم (چند تصویر)</label>
            <input type="file" name="album" accept="image/jpeg,image/png,image/webp,image/gif" multiple>
            <input name="location" maxlength="100" placeholder="موقعیت (اختیاری)">
            <div class="notice">حداکثر حجم تصویر: ۲ مگابایت | ویدئو: ۱۰ مگابایت</div>
            <button class="full green">📢 انتشار</button>
          </form>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/new-post") {
      rateLimiter(CONFIG.POST_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const form = await readMultipart(req);
        const content = trimText(form.fields.content, CONFIG.MAX_POST);
        const location = trimText(form.fields.location, 100) || null;
        let imageUrl = null, videoUrl = null;
        let albumImages = [];

        const image = form.files.image;
        if (image && image.buffer && image.buffer.length) {
          if (!isValidImage(image)) {
            sendError(res, 400, "تصویر نامعتبر است یا بیشتر از ۲ مگابایت است.", currentUser);
            return;
          }
          imageUrl = image.url;
        }

        const video = form.files.video;
        if (video && video.buffer && video.buffer.length) {
          if (!isValidVideo(video)) {
            sendError(res, 400, "ویدئو نامعتبر است یا بیشتر از ۱۰ مگابایت است.", currentUser);
            return;
          }
          videoUrl = saveVideo(video.buffer, "posts");
        }

        // Handle album images
        if (form.files.album && Array.isArray(form.files.album)) {
          for (const img of form.files.album) {
            if (img && img.buffer && img.buffer.length && isValidImage(img)) {
              albumImages.push(img.url);
            }
          }
        }

        if (!content && !imageUrl && !videoUrl && albumImages.length === 0) {
          sendError(res, 400, "متن، تصویر، ویدئو یا آلبوم پست لازم است.", currentUser);
          return;
        }

        const result = await pool.query(`
          INSERT INTO posts(user_id, content, image_url, video_url, album_images, location)
          VALUES($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [currentUser.id, content, imageUrl, videoUrl, albumImages.length > 0 ? albumImages : null, location]);

        const postId = result.rows[0].id;

        // Extract hashtags
        const hashtags = content.match(/#[\w\u0600-\u06FF]+/g) || [];
        for (const tag of hashtags) {
          const tagResult = await pool.query(`
            INSERT INTO hashtags(tag, post_count)
            VALUES($1, 1)
            ON CONFLICT(tag) DO UPDATE SET post_count = hashtags.post_count + 1, updated_at = CURRENT_TIMESTAMP
            RETURNING id
          `, [tag]);
          await pool.query(`
            INSERT INTO post_hashtags(post_id, hashtag_id)
            VALUES($1, $2)
            ON CONFLICT DO NOTHING
          `, [postId, tagResult.rows[0].id]);
        }

        // Extract mentions
        const mentions = content.match(/@[\w\u0600-\u06FF]+/g) || [];
        for (const mention of mentions) {
          const username = mention.substring(1);
          const userResult = await pool.query(`SELECT id FROM users WHERE username ILIKE $1 LIMIT 1`, [username]);
          if (userResult.rows.length && userResult.rows[0].id !== currentUser.id) {
            await createNotification(
              userResult.rows[0].id,
              currentUser.id,
              CONFIG.NOTIFICATION_TYPES.MENTION,
              postId,
              `${currentUser.name} شما را در یک پست منشن کرد.`,
              null,
              `/post?id=${postId}`
            );
          }
        }

        // Log activity
        await pool.query(`
          INSERT INTO activity_logs(user_id, action, target_type, target_id, ip_address, user_agent)
          VALUES($1, $2, $3, $4, $5, $6)
        `, [currentUser.id, "post_created", "post", postId, req.headers["x-forwarded-for"] || req.socket.remoteAddress, req.headers["user-agent"]]);

        redirect(res, `/post?id=${postId}`);
      });
      return;
    }

    // POST PAGE
    if (req.method === "GET" && path === "/post") {
      const postId = safeInt(requestUrl.searchParams.get("id"));
      if (!postId) { redirect(res, "/"); return; }

      const result = await pool.query(`
        SELECT
          p.*,
          u.name,
          u.email,
          u.avatar_url,
          u.is_verified,
          (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
          (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id) as repost_count,
          EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $2) as liked,
          EXISTS(SELECT 1 FROM bookmarks b2 WHERE b2.post_id = p.id AND b2.user_id = $2) as bookmarked,
          EXISTS(SELECT 1 FROM reposts r2 WHERE r2.post_id = p.id AND r2.user_id = $2) as reposted
        FROM posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.id = $1
      `, [postId, currentUser.id]);

      if (!result.rows.length) {
        sendError(res, 404, "پست پیدا نشد.", currentUser);
        return;
      }

      const post = result.rows[0];

      if (await areBlocked(currentUser.id, post.user_id)) {
        sendError(res, 403, "امکان مشاهده این پست وجود ندارد.", currentUser);
        return;
      }

      // Increment view count
      await pool.query(`UPDATE posts SET view_count = view_count + 1 WHERE id = $1`, [postId]);

      const comments = await pool.query(`
        SELECT c.*, u.name, u.avatar_url, u.is_verified
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.post_id = $1
        ORDER BY c.created_at ASC
        LIMIT 200
      `, [postId]);

      let html = postCard(post, currentUser, false);

      html += `<div class="card"><h3>💬 نظرات (${post.comment_count})</h3>`;

      if (comments.rows.length) {
        for (const comment of comments.rows) {
          html += `
            <div class="comment" id="comment-${comment.id}">
              <div class="profile-head">
                ${avatarHtml(comment)}
                <div>
                  <div class="comment-name">${escapeHtml(comment.name)} ${comment.is_verified ? '✅' : ''}</div>
                  <div class="small">${formatDate(comment.created_at)}</div>
                </div>
                ${Number(comment.user_id) === Number(currentUser.id) ? `
                  <div style="margin-right:auto;">
                    <a href="/delete-comment?id=${comment.id}" class="danger" style="font-size:12px;">🗑️</a>
                  </div>
                ` : ''}
              </div>
              <div class="comment-text">${escapeHtml(comment.comment)}</div>
            </div>
          `;
        }
      } else {
        html += `<div class="empty">هنوز نظری ثبت نشده است.</div>`;
      }

      html += `
        <div class="divider"></div>
        <form method="POST" action="/comment">
          <input type="hidden" name="post_id" value="${postId}">
          <input name="comment" maxlength="${CONFIG.MAX_COMMENT}" placeholder="نظر خود را بنویس..." required>
          <button class="full">💬 ارسال نظر</button>
        </form>
      </div>`;

      sendHtml(res, 200, "پست", html, currentUser);
      return;
    }

    // LIKE
    if (req.method === "GET" && path === "/like") {
      const postId = safeInt(requestUrl.searchParams.get("post"));
      if (!postId) { redirect(res, "/"); return; }

      const postResult = await pool.query(`SELECT user_id FROM posts WHERE id = $1`, [postId]);
      if (postResult.rows.length && !awa  if (req.method === "POST" && path === "/edit-post") {
      rateLimiter(CONFIG.POST_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const form = await readMultipart(req);
        const postId = safeInt(form.fields.post_id);
        const content = trimText(form.fields.content, CONFIG.MAX_POST);
        const location = trimText(form.fields.location, 100) || null;
        const removeMedia = form.fields.remove_media === "on";

        if (!postId) {
          sendError(res, 400, "شناسه پست لازم است.", currentUser);
          return;
        }

        // Check ownership
        const postCheck = await pool.query(`
          SELECT id, image_url, video_url FROM posts
          WHERE id = $1 AND user_id = $2
        `, [postId, currentUser.id]);

        if (!postCheck.rows.length) {
          sendError(res, 404, "پست پیدا نشد.", currentUser);
          return;
        }

        let imageUrl = postCheck.rows[0].image_url;
        let videoUrl = postCheck.rows[0].video_url;

        if (removeMedia) {
          if (imageUrl) deleteImage(imageUrl);
          if (videoUrl) deleteImage(videoUrl);
          imageUrl = null;
          videoUrl = null;
        }

        const image = form.files.image;
        if (image && image.buffer && image.buffer.length) {
          if (!isValidImage(image)) {
            sendError(res, 400, "تصویر نامعتبر است.", currentUser);
            return;
          }
          if (imageUrl) deleteImage(imageUrl);
          imageUrl = image.url;
        }

        const video = form.files.video;
        if (video && video.buffer && video.buffer.length) {
          if (!isValidVideo(video)) {
            sendError(res, 400, "ویدئو نامعتبر است.", currentUser);
            return;
          }
          if (videoUrl) deleteImage(videoUrl);
          videoUrl = saveVideo(video.buffer, "posts");
        }

        await pool.query(`
          UPDATE posts
          SET content = $1, image_url = $2, video_url = $3, location = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $5 AND user_id = $6
        `, [content, imageUrl, videoUrl, location, postId, currentUser.id]);

        redirect(res, `/post?id=${postId}`);
      });
      return;
    }

    // PIN POST
    if (req.method === "GET" && path === "/pin-post") {
      const postId = safeInt(requestUrl.searchParams.get("id"));
      if (postId) {
        await pool.query(`
          UPDATE posts SET is_pinned = NOT is_pinned
          WHERE id = $1 AND user_id = $2
        `, [postId, currentUser.id]);
      }
      redirect(res, "/profile");
      return;
    }

    // ARCHIVE POST
    if (req.method === "GET" && path === "/archive-post") {
      const postId = safeInt(requestUrl.searchParams.get("id"));
      if (postId) {
        await pool.query(`
          UPDATE posts SET is_archived = NOT is_archived
          WHERE id = $1 AND user_id = $2
        `, [postId, currentUser.id]);
      }
      redirect(res, "/profile");
      return;
    }

    // BOOKMARK
    if (req.method === "GET" && (path === "/bookmark" || path === "/save")) {
      const postId = safeInt(requestUrl.searchParams.get("post"));
      if (postId) {
        const exists = await pool.query(`SELECT 1 FROM bookmarks WHERE post_id = $1 AND user_id = $2`, [postId, currentUser.id]);
        if (exists.rows.length) {
          await pool.query(`DELETE FROM bookmarks WHERE post_id = $1 AND user_id = $2`, [postId, currentUser.id]);
        } else {
          await pool.query(`INSERT INTO bookmarks(post_id, user_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [postId, currentUser.id]);
        }
      }
      redirect(res, postId ? `/post?id=${postId}` : "/");
      return;
    }

    // REPOST
    if (req.method === "GET" && path === "/repost") {
      const postId = safeInt(requestUrl.searchParams.get("post"));
      if (postId) {
        const postResult = await pool.query(`SELECT user_id FROM posts WHERE id = $1`, [postId]);
        if (postResult.rows.length && !await areBlocked(currentUser.id, postResult.rows[0].user_id)) {
          const exists = await pool.query(`SELECT 1 FROM reposts WHERE post_id = $1 AND user_id = $2`, [postId, currentUser.id]);
          if (exists.rows.length) {
            await pool.query(`DELETE FROM reposts WHERE post_id = $1 AND user_id = $2`, [postId, currentUser.id]);
            await pool.query(`UPDATE posts SET repost_count = repost_count - 1 WHERE id = $1`, [postId]);
          } else {
            await pool.query(`INSERT INTO reposts(post_id, user_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [postId, currentUser.id]);
            await pool.query(`UPDATE posts SET repost_count = repost_count + 1, share_count = share_count + 1 WHERE id = $1`, [postId]);
            if (postResult.rows[0].user_id !== currentUser.id) {
              await createNotification(
                postResult.rows[0].user_id,
                currentUser.id,
                CONFIG.NOTIFICATION_TYPES.REPOST,
                postId,
                `${currentUser.name} پست شما را ریپست کرد.`,
                null,
                `/post?id=${postId}`
              );
            }
          }
        }
      }
      redirect(res, postId ? `/post?id=${postId}` : "/");
      return;
    }

    // FOLLOW
    if (req.method === "GET" && path === "/follow") {
      const target = safeInt(requestUrl.searchParams.get("user") || requestUrl.searchParams.get("id"));
      if (!target || target === currentUser.id) { redirect(res, "/"); return; }

      if (await areBlocked(currentUser.id, target)) {
        redirect(res, `/profile?id=${target}`);
        return;
      }

      const targetUser = await pool.query(`SELECT id, is_private FROM users WHERE id = $1`, [target]);
      if (!targetUser.rows.length) { redirect(res, "/"); return; }

      const isPrivate = targetUser.rows[0].is_private;
      const exists = await pool.query(`SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2`, [currentUser.id, target]);

      if (exists.rows.length) {
        await pool.query(`DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`, [currentUser.id, target]);
      } else if (isPrivate) {
        const requested = await pool.query(`SELECT 1 FROM follow_requests WHERE follower_id = $1 AND following_id = $2`, [currentUser.id, target]);
        if (!requested.rows.length) {
          await pool.query(`INSERT INTO follow_requests(follower_id, following_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [currentUser.id, target]);
          await createNotification(
            target,
            currentUser.id,
            CONFIG.NOTIFICATION_TYPES.FOLLOW_REQUEST,
            null,
            `${currentUser.name} درخواست دنبال کردن شما را ارسال کرد.`,
            null,
            `/profile?id=${currentUser.id}`
          );
        }
      } else {
        await pool.query(`INSERT INTO follows(follower_id, following_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [currentUser.id, target]);
        await createNotification(
          target,
          currentUser.id,
          CONFIG.NOTIFICATION_TYPES.FOLLOW,
          null,
          `${currentUser.name} شما را دنبال کرد.`,
          null,
          `/profile?id=${currentUser.id}`
        );
      }

      redirect(res, `/profile?id=${target}`);
      return;
    }

    // FOLLOW REQUEST ACTION
    if (req.method === "GET" && path === "/follow-request") {
      const action = requestUrl.searchParams.get("action");
      const target = safeInt(requestUrl.searchParams.get("user"));

      if (action && target && target !== currentUser.id) {
        if (action === "approve") {
          await pool.query(`INSERT INTO follows(follower_id, following_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [target, currentUser.id]);
          await pool.query(`DELETE FROM follow_requests WHERE follower_id = $1 AND following_id = $2`, [target, currentUser.id]);
          await createNotification(
            target,
            currentUser.id,
            CONFIG.NOTIFICATION_TYPES.FOLLOW_APPROVED,
            null,
            `${currentUser.name} درخواست شما را تایید کرد.`,
            null,
            `/profile?id=${currentUser.id}`
          );
        } else if (action === "reject") {
          await pool.query(`DELETE FROM follow_requests WHERE follower_id = $1 AND following_id = $2`, [target, currentUser.id]);
        }
      }

      redirect(res, "/profile");
      return;
    }

    // BLOCK
    if (req.method === "GET" && path === "/block") {
      const target = safeInt(requestUrl.searchParams.get("user") || requestUrl.searchParams.get("id"));
      if (!target || target === currentUser.id) { redirect(res, "/"); return; }

      const exists = await pool.query(`SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`, [currentUser.id, target]);

      if (exists.rows.length) {
        await pool.query(`DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`, [currentUser.id, target]);
      } else {
        await pool.query(`INSERT INTO blocked_users(blocker_id, blocked_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [currentUser.id, target]);
        await pool.query(`DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`, [currentUser.id, target]);
        await pool.query(`DELETE FROM follow_requests WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`, [currentUser.id, target]);
      }

      redirect(res, `/profile?id=${target}`);
      return;
    }

    // PROFILE
    if (req.method === "GET" && path === "/profile") {
      const target = safeInt(requestUrl.searchParams.get("id")) || currentUser.id;
      const profileResult = await pool.query(`
        SELECT id, name, username, email, phone, bio, avatar_url, cover_url, created_at, is_private, is_verified, is_admin, is_suspended, last_active
        FROM users WHERE id = $1
      `, [target]);

      if (!profileResult.rows.length) {
        sendError(res, 404, "کاربر پیدا نشد.", currentUser);
        return;
      }

      const profile = profileResult.rows[0];

      if (target !== currentUser.id && await areBlocked(currentUser.id, target)) {
        sendError(res, 403, "این کاربر مسدود است.", currentUser);
        return;
      }

      const followers = await pool.query(`SELECT COUNT(*) as count FROM follows WHERE following_id = $1`, [target]);
      const following = await pool.query(`SELECT COUNT(*) as count FROM follows WHERE follower_id = $1`, [target]);
      const postsCount = await pool.query(`SELECT COUNT(*) as count FROM posts WHERE user_id = $1 AND status = 'published' AND is_archived = FALSE`, [target]);

      const followStatus = await getFollowStatus(currentUser.id, target);

      const posts = await pool.query(`
        SELECT
          p.*,
          u.name,
          u.email,
          u.avatar_url,
          u.is_verified,
          (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
          (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id) as repost_count,
          EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $2) as liked,
          EXISTS(SELECT 1 FROM bookmarks b2 WHERE b2.post_id = p.id AND b2.user_id = $2) as bookmarked,
          EXISTS(SELECT 1 FROM reposts r2 WHERE r2.post_id = p.id AND r2.user_id = $2) as reposted
        FROM posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.user_id = $1 AND p.status = 'published' AND (p.is_archived = FALSE OR p.user_id = $2)
        ORDER BY p.created_at DESC
        LIMIT 100
      `, [target, currentUser.id]);

      let html = `
        <div class="card">
          <div class="profile-center">
            ${avatarHtml(profile, true, "100px")}
            <div class="username" style="font-size:24px;margin-top:10px;">
              ${escapeHtml(profile.name)}
              ${profile.is_verified ? '✅' : ''}
            </div>
            ${profile.username ? `<div class="email" style="direction:ltr;">@${escapeHtml(profile.username)}</div>` : ''}
            <div class="email">${escapeHtml(profile.email)}</div>
            ${profile.bio ? `<div class="small" style="margin-top:8px;">${escapeHtml(profile.bio)}</div>` : ''}
          </div>
          <div class="divider"></div>
          <div class="stats" style="justify-content:center;gap:30px;">
            <span><strong>${followers.rows[0].count}</strong> دنبال‌کننده</span>
            <span><strong>${following.rows[0].count}</strong> دنبال‌شونده</span>
            <span><strong>${postsCount.rows[0].count}</strong> پست</span>
          </div>
      `;

      if (target !== currentUser.id) {
        let followButton = '';
        if (followStatus.isFollowing) {
          followButton = `<a href="/follow?user=${target}"><button class="follow">❌ لغو دنبال</button></a>`;
        } else if (profile.is_private && !followStatus.isFollowRequested) {
          followButton = `<a href="/follow?user=${target}"><button class="follow">➕ درخواست دنبال</button></a>`;
        } else if (followStatus.isFollowRequested) {
          followButton = `<button class="secondary" disabled>⏳ درخواست شده</button>`;
        } else {
          followButton = `<a href="/follow?user=${target}"><button class="follow">➕ دنبال کردن</button></a>`;
        }

        html += `
          <div class="actions" style="justify-content:center;margin-top:12px;">
            ${followButton}
            <a href="/messages?user=${target}"><button>💬 پیام</button></a>
            <a href="/call?user=${target}&mode=audio"><button>📞 تماس</button></a>
            <a href="/call?user=${target}&mode=video"><button>📹 ویدیو</button></a>
            <a href="/block?user=${target}"><button class="danger">🚫 بلاک</button></a>
            <a href="/report?user=${target}"><button class="danger">🚩 گزارش</button></a>
          </div>
        `;
      } else {
        html += `
          <div class="actions" style="justify-content:center;margin-top:12px;">
            <a href="/settings"><button>⚙️ تنظیمات</button></a>
            <a href="/saved"><button>🔖 ذخیره‌ها</button></a>
          </div>
        `;
      }

      html += `</div><h3>📝 پست‌ها</h3>`;

      if (posts.rows.length) {
        for (const post of posts.rows) {
          html += postCard(post, currentUser, false);
        }
      } else {
        html += `<div class="card empty">هنوز پستی منتشر نشده است.</div>`;
      }

      sendHtml(res, 200, "پروفایل", html, currentUser);
      return;
    }

    // STORIES
    if (req.method === "GET" && path === "/stories") {
      const stories = await pool.query(`
        SELECT s.*, u.name, u.avatar_url, u.is_verified
        FROM stories s
        JOIN users u ON u.id = s.user_id
        WHERE s.expires_at > CURRENT_TIMESTAMP
        AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $1 AND b.blocked_id = s.user_id) OR (b.blocker_id = s.user_id AND b.blocked_id = $1))
        ORDER BY s.created_at DESC
        LIMIT 50
      `, [currentUser.id]);

      let html = `
        <div class="card">
          <h2>📸 استوری‌ها</h2>
          <a href="/new-story"><button class="full green">➕ انتشار استوری</button></a>
        </div>
      `;

      if (stories.rows.length) {
        for (const story of stories.rows) {
          const viewed = await pool.query(`SELECT 1 FROM story_views WHERE story_id = $1 AND user_id = $2`, [story.id, currentUser.id]);
          const viewCount = await pool.query(`SELECT COUNT(*) as count FROM story_views WHERE story_id = $1`, [story.id]);

          html += `
            <div class="card" onclick="location.href='/story/${story.id}'" style="cursor:pointer;">
              <div class="profile-head">
                ${avatarHtml(story)}
                <div>
                  <div class="username">${escapeHtml(story.name)} ${story.is_verified ? '✅' : ''}</div>
                  <div class="small">${timeAgo(story.created_at)}</div>
                </div>
                <div style="margin-right:auto;">
                  <span class="badge">${viewCount.rows[0].count} بازدید</span>
                  ${viewed.rows.length ? '<span class="badge" style="background:#e8f5e9;color:#2e7d32;">✅ مشاهده شده</span>' : ''}
                </div>
              </div>
              ${story.image_url ? `<img src="${escapeAttr(story.image_url)}" style="width:100%;max-height:400px;object-fit:cover;border-radius:12px;margin-top:10px;">` : ''}
              ${story.video_url ? `<video src="${escapeAttr(story.video_url)}" controls style="width:100%;max-height:400px;border-radius:12px;margin-top:10px;"></video>` : ''}
              ${story.content ? `<div class="post-text">${escapeHtml(story.content)}</div>` : ''}
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">هیچ استوری جدیدی وجود ندارد.</div>`;
      }

      sendHtml(res, 200, "استوری", html, currentUser);
      return;
    }

    // NEW STORY
    if (req.method === "GET" && path === "/new-story") {
      sendHtml(res, 200, "استوری جدید", `
        <div class="card">
          <h2>📸 انتشار استوری</h2>
          <form method="POST" action="/new-story" enctype="multipart/form-data">
            <textarea name="content" maxlength="${CONFIG.MAX_STORY}" placeholder="متن استوری..."></textarea>
            <label>🖼️ تصویر</label>
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif">
            <label>🎬 ویدئو</label>
            <input type="file" name="video" accept="video/mp4,video/webm,video/ogg">
            <label>🎨 رنگ پس‌زمینه</label>
            <input type="color" name="bg_color" value="#000000">
            <label>🎨 رنگ متن</label>
            <input type="color" name="font_color" value="#ffffff">
            <div class="notice">استوری پس از ۲۴ ساعت حذف می‌شود.</div>
            <button class="full green">📤 انتشار</button>
          </form>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/new-story") {
      rateLimiter(CONFIG.STORY_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const form = await readMultipart(req);
        const content = trimText(form.fields.content, CONFIG.MAX_STORY);
        const bgColor = trimText(form.fields.bg_color, 7) || null;
        const fontColor = trimText(form.fields.font_color, 7) || null;
        let imageUrl = null, videoUrl = null;

        const image = form.files.image;
        if (image && image.buffer && image.buffer.length) {
          if (!isValidImage(image)) {
            sendError(res, 400, "تصویر نامعتبر است.", currentUser);
            return;
          }
          imageUrl = image.url;
        }

        const video = form.files.video;
        if (video && video.buffer && video.buffer.length) {
          if (!isValidVideo(video, CONFIG.MAX_STORY_VIDEO_SIZE)) {
            sendError(res, 400, "ویدئو نامعتبر است یا بیشتر از ۵ مگابایت است.", currentUser);
            return;
          }
          videoUrl = saveVideo(video.buffer, "stories");
        }

        if (!content && !imageUrl && !videoUrl) {
          sendError(res, 400, "متن، تصویر یا ویدئو استوری لازم است.", currentUser);
          return;
        }

        await pool.query(`
          INSERT INTO stories(user_id, image_url, video_url, content, background_color, font_color)
          VALUES($1, $2, $3, $4, $5, $6)
        `, [currentUser.id, imageUrl, videoUrl, content, bgColor, fontColor]);

        redirect(res, "/stories");
      });
      return;
    }

    // STORY VIEW
    if (req.method === "GET" && path.startsWith("/story/")) {
      const storyId = safeInt(path.split("/")[2]);
      if (!storyId) { redirect(res, "/stories"); return; }

      const story = await pool.query(`
        SELECT s.*, u.name, u.avatar_url, u.is_verified
        FROM stories s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.expires_at > CURRENT_TIMESTAMP
      `, [storyId]);

      if (!story.rows.length) {
        sendError(res, 404, "استوری پیدا نشد.", currentUser);
        return;
      }

      const storyData = story.rows[0];

      // Record view
      await pool.query(`
        INSERT INTO story_views(story_id, user_id)
        VALUES($1, $2)
        ON CONFLICT DO NOTHING
      `, [storyId, currentUser.id]);

      // Get views
      const views = await pool.query(`
        SELECT u.id, u.name, u.avatar_url
        FROM story_views sv
        JOIN users u ON u.id = sv.user_id
        WHERE sv.story_id = $1
        ORDER BY sv.created_at DESC
        LIMIT 100
      `, [storyId]);

      let html = `
        <div class="card">
          <div class="profile-head">
            ${avatarHtml(storyData, true, "60px")}
            <div>
              <div class="username">${escapeHtml(storyData.name)} ${storyData.is_verified ? '✅' : ''}</div>
              <div class="small">${formatDate(storyData.created_at)}</div>
            </div>
          </div>
          ${storyData.image_url ? `<img src="${escapeAttr(storyData.image_url)}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:12px;margin-top:10px;">` : ''}
          ${storyData.video_url ? `<video src="${escapeAttr(storyData.video_url)}" controls style="width:100%;max-height:70vh;border-radius:12px;margin-top:10px;"></video>` : ''}
          ${storyData.content ? `<div class="post-text" style="font-size:18px;text-align:center;padding:20px;background-color:${escapeAttr(storyData.background_color || '#000')};color:${escapeAttr(storyData.font_color || '#fff')};border-radius:12px;">${escapeHtml(storyData.content)}</div>` : ''}
        </div>
        <div class="card">
          <h3>👁️ بازدیدکنندگان (${views.rows.length})</h3>
      `;

      if (views.rows.length) {
        for (const viewer of views.rows) {
          html += `
            <div class="profile-head" style="margin-bottom:8px;">
              ${avatarHtml(viewer)}
              <div>
                <div class="username">${escapeHtml(viewer.name)}</div>
              </div>
              <a href="/profile?id=${viewer.id}" style="margin-right:auto;"><button class="small">👤</button></a>
            </div>
          `;
        }
      } else {
        html += `<div class="empty">هنوز بازدیدی ثبت نشده است.</div>`;
      }

      html += `</div>`;

      sendHtml(res, 200, "استوری", html, currentUser);
      return;
    }

    // EXPLORE
    if (req.method === "GET" && path === "/explore") {
      const posts = await pool.query(`
        SELECT
          p.*,
          u.name,
          u.email,
          u.avatar_url,
          u.is_verified,
          (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
          (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id) as repost_count,
          EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $1) as liked,
          EXISTS(SELECT 1 FROM bookmarks b2 WHERE b2.post_id = p.id AND b2.user_id = $1) as bookmarked,
          EXISTS(SELECT 1 FROM reposts r2 WHERE r2.post_id = p.id AND r2.user_id = $1) as reposted
        FROM posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.status = 'published'
        AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = $1))
        ORDER BY like_count DESC, comment_count DESC, created_at DESC
        LIMIT 50
      `, [currentUser.id]);

      // Suggestions
      const suggestions = await getUserSuggestions(currentUser.id, 10);

      let html = `
        <div class="card">
          <h2>🔍 اکتشاف</h2>
          <p class="small">پست‌های محبوب امروز</p>
        </div>
      `;

      if (posts.rows.length) {
        for (const post of posts.rows) {
          html += postCard(post, currentUser, false);
        }
      } else {
        html += `<div class="card empty">پست محبوبی پیدا نشد.</div>`;
      }

      if (suggestions.length) {
        html += `
          <div class="card">
            <h3>👥 پیشنهاد کاربران</h3>
            <div style="display:flex;flex-direction:column;gap:10px;">
        `;
        for (const user of suggestions) {
          html += `
            <div class="profile-head">
              ${avatarHtml(user)}
              <div>
                <div class="username">${escapeHtml(user.name)} ${user.is_verified ? '✅' : ''}</div>
                <div class="small">${user.follower_count} دنبال‌کننده</div>
              </div>
              <a href="/follow?user=${user.id}" style="margin-right:auto;"><button class="follow">➕</button></a>
            </div>
          `;
        }
        html += `</div></div>`;
      }

      sendHtml(res, 200, "اکتشاف", html, currentUser);
      return;
    }

    // SEARCH
    if (req.method === "GET" && path === "/search") {
      const q = trimText(requestUrl.searchParams.get("q"), CONFIG.MAX_SEARCH);
      let usersHtml = "", postsHtml = "", hashtagHtml = "", jobsHtml = "";

      if (q) {
        // Users
        const users = await pool.query(`
          SELECT id, name, username, email, bio, avatar_url, is_verified
          FROM users
          WHERE (name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1)
          AND id != $2 AND is_suspended = FALSE
          ORDER BY name
          LIMIT 20
        `, [`%${q}%`, currentUser.id]);

        usersHtml = users.rows.map(item => `
          <div class="card">
            <div class="profile-head">
              <a href="/profile?id=${item.id}">${avatarHtml(item)}</a>
              <div>
                <div class="username">${escapeHtml(item.name)} ${item.is_verified ? '✅' : ''}</div>
                ${item.username ? `<div class="small">@${escapeHtml(item.username)}</div>` : ''}
                ${item.bio ? `<div class="small">${escapeHtml(item.bio)}</div>` : ''}
              </div>
              <div style="margin-right:auto;">
                <a href="/profile?id=${item.id}"><button>👤</button></a>
              </div>
            </div>
          </div>
        `).join("");

        // Posts
        const posts = await pool.query(`
          SELECT
            p.*,
            u.name,
            u.email,
            u.avatar_url,
            u.is_verified,
            (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
            EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $2) as liked,
            EXISTS(SELECT 1 FROM bookmarks b2 WHERE b2.post_id = p.id AND b2.user_id = $2) as bookmarked,
            EXISTS(SELECT 1 FROM reposts r2 WHERE r2.post_id = p.id AND r2.user_id = $2) as reposted
          FROM posts p
          JOIN users u ON u.id = p.user_id
          WHERE p.content ILIKE $1 AND p.status = 'published'
          AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $2 AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = $2))
          ORDER BY p.created_at DESC
          LIMIT 20
        `, [`%${q}%`, currentUser.id]);

        postsHtml = posts.rows.map(item => postCard(item, currentUser, false)).join("");

        // Hashtags
        const hashtags = await pool.query(`
          SELECT tag, post_count FROM hashtags
          WHERE tag ILIKE $1
          ORDER BY post_count DESC
          LIMIT 20
        `, [`%${q}%`]);

        hashtagHtml = hashtags.rows.map(h => `
          <div class="card" onclick="location.href='/search?q=${encodeURIComponent(h.tag)}'" style="cursor:pointer;">
            <div class="username">${escapeHtml(h.tag)}</div>
            <div class="small">${h.post_count} پست</div>
          </div>
        `).join("");

        // Jobs
        const jobs = await pool.query(`
          SELECT * FROM jobs
          WHERE (title ILIKE $1 OR city ILIKE $1 OR description ILIKE $1)
          AND is_active = TRUE
          ORDER BY created_at DESC
          LIMIT 10
        `, [`%${q}%`]);

        jobsHtml = jobs.rows.map(job => `
          <div class="job">
            <div class="job-title">${escapeHtml(job.title)}</div>
            <div class="job-city">📍 ${escapeHtml(job.city)}</div>
            <div class="job-salary">💰 ${escapeHtml(job.salary)}</div>
            <div class="job-description">${escapeHtml(job.description)}</div>
            <div class="small">${formatDate(job.created_at)}</div>
          </div>
        `).join("");
      }

      sendHtml(res, 200, "جستجو", `
        <div class="card">
          <form method="GET" action="/search">
            <input name="q" value="${escapeAttr(q)}" maxlength="${CONFIG.MAX_SEARCH}" placeholder="جستجوی کاربر، پست، هشتگ، شغل...">
            <button class="full">🔎 جستجو</button>
          </form>
        </div>

        ${q ? `
          <h3>🏷️ هشتگ‌ها</h3>
          ${hashtagHtml || `<div class="card empty">هشتگی پیدا نشد.</div>`}
          <div class="divider"></div>
          <h3>👥 کاربران</h3>
          ${usersHtml || `<div class="card empty">کاربری پیدا نشد.</div>`}
          <div class="divider"></div>
          <h3>📝 پست‌ها</h3>
          ${postsHtml || `<div class="card empty">پستی پیدا نشد.</div>`}
          <div class="divider"></div>
          <h3>💼 آگهی‌های کاری</h3>
          ${jobsHtml || `<div class="card empty">آگهی پیدا نشد.</div>`}
        ` : `
          <div class="card empty">برای جستجو عبارت مورد نظر را وارد کنید.</div>
        `}
      `, currentUser);
      return;
    }

    // MESSAGES
    if (req.method === "GET" && path === "/messages") {
      if (requestUrl.searchParams.has("user")) {
        const id = safeInt(requestUrl.searchParams.get("user"));
        if (id && id !== currentUser.id) {
          redirect(res, `/chat?id=${id}`);
          return;
        }
      }

      const contacts = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.username,
          u.email,
          u.avatar_url,
          u.is_verified,
          u.is_private,
          (SELECT m.message FROM messages m WHERE (m.sender_id = $1 AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = $1) AND m.deleted_for_sender = FALSE AND m.deleted_for_receiver = FALSE ORDER BY m.created_at DESC LIMIT 1) as last_message,
          (SELECT m.created_at FROM messages m WHERE (m.sender_id = $1 AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = $1) AND m.deleted_for_sender = FALSE AND m.deleted_for_receiver = FALSE ORDER BY m.created_at DESC LIMIT 1) as last_message_time,
          (SELECT COUNT(*) FROM messages m2 WHERE m2.sender_id = u.id AND m2.receiver_id = $1 AND m2.read_at IS NULL AND m2.deleted_for_sender = FALSE AND m2.deleted_for_receiver = FALSE) as unread
        FROM users u
        WHERE u.id != $1
        AND EXISTS(SELECT 1 FROM messages mx WHERE (mx.sender_id = $1 AND mx.receiver_id = u.id) OR (mx.sender_id = u.id AND mx.receiver_id = $1))
        AND NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
        ORDER BY unread DESC, last_message_time DESC
      `, [currentUser.id]);

      let html = `
        <div class="card">
          <h2>💬 پیام‌ها</h2>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <a href="/search"><button>🔎 پیدا کردن کاربر</button></a>
            <a href="/new-group"><button>👥 گروه جدید</button></a>
          </div>
        </div>
      `;

      if (contacts.rows.length) {
        for (const contact of contacts.rows) {
          html += `
            <div class="card" onclick="location.href='/chat?id=${contact.id}'" style="cursor:pointer;">
              <div class="profile-head">
                ${avatarHtml(contact)}
                <div>
                  <div class="username">
                    ${escapeHtml(contact.name)}
                    ${contact.is_verified ? '✅' : ''}
                    ${contact.unread > 0 ? `<span class="badge count">${contact.unread}</span>` : ''}
                  </div>
                  <div class="small">${escapeHtml(contact.last_message || '')}</div>
                </div>
                <div style="margin-right:auto;font-size:12px;color:#777;">
                  ${contact.last_message_time ? timeAgo(contact.last_message_time) : ''}
                </div>
              </div>
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">هنوز گفتگویی ندارید.</div>`;
      }

      sendHtml(res, 200, "پیام‌ها", html, currentUser);
      return;
    }

    // CHAT
    if (req.method === "GET" && path === "/chat") {
      const id = safeInt(requestUrl.searchParams.get("id"));
      if (!id || id === currentUser.id) { redirect(res, "/messages"); return; }

      const other = await pool.query(`
        SELECT id, name, username, email, bio, avatar_url, is_verified, is_private
        FROM users WHERE id = $1
      `, [id]);

      if (!other.rows.length) { redirect(res, "/messages"); return; }

      if (await areBlocked(currentUser.id, id)) {
        sendError(res, 403, "امکان گفتگو وجود ندارد.", currentUser);
        return;
      }

      // Mark messages as read
      await pool.query(`
        UPDATE messages SET read_at = CURRENT_TIMESTAMP, seen_at = CURRENT_TIMESTAMP
        WHERE sender_id = $1 AND receiver_id = $2 AND read_at IS NULL
      `, [id, currentUser.id]);

      const messages = await pool.query(`
        SELECT m.*, u.name, u.avatar_url
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1)
        AND m.deleted_for_sender = FALSE AND m.deleted_for_receiver = FALSE
        ORDER BY m.created_at ASC
        LIMIT 500
      `, [currentUser.id, id]);

      let html = `
        <div class="card">
          <div class="profile-head">
            <a href="/profile?id=${id}">${avatarHtml(other.rows[0], true, "50px")}</a>
            <div>
              <div class="username">${escapeHtml(other.rows[0].name)} ${other.rows[0].is_verified ? '✅' : ''}</div>
              ${other.rows[0].username ? `<div class="small">@${escapeHtml(other.rows[0].username)}</div>` : ''}
            </div>
            <div style="margin-right:auto;display:flex;gap:6px;">
              <a href="/call?user=${id}&mode=audio"><button>📞</button></a>
              <a href="/call?user=${id}&mode=video"><button>📹</button></a>
            </div>
          </div>
        </div>
      `;

      if (messages.rows.length) {
        let lastDate = null;
        for (const message of messages.rows) {
          const msgDate = new Date(message.created_at).toLocaleDateString("fa-IR");
          if (msgDate !== lastDate) {
            html += `<div class="small" style="text-align:center;padding:8px 0;">${msgDate}</div>`;
            lastDate = msgDate;
          }

          html += `
            <div class="message-card ${Number(message.sender_id) === Number(currentUser.id) ? 'message-me' : 'message-other'}">
              <div class="message-author">${escapeHtml(message.name)}</div>
              ${message.image_url ? `<img src="${escapeAttr(message.image_url)}" style="width:100%;max-height:300px;object-fit:cover;border-radius:10px;margin:5px 0;">` : ''}
              ${message.video_url ? `<video src="${escapeAttr(message.video_url)}" controls style="width:100%;max-height:300px;border-radius:10px;margin:5px 0;"></video>` : ''}
              <div class="post-text">${escapeHtml(message.message)}</div>
              <div class="small" style="display:flex;justify-content:space-between;align-items:center;">
                <span>${formatTime(message.created_at)}</span>
                ${message.read_at && Number(message.sender_id) === Number(currentUser.id) ? '✅ خوانده شده' : ''}
              </div>
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">هنوز پیامی وجود ندارد. اولین پیام را ارسال کن! 💬</div>`;
      }

      html += `
        <div class="card">
          <form method="POST" action="/chat" enctype="multipart/form-data">
            <input type="hidden" name="receiver_id" value="${id}">
            <input name="message" maxlength="${CONFIG.MAX_MESSAGE}" placeholder="پیام خود را بنویس...">
            <label>🖼️ تصویر</label>
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif">
            <label>🎬 ویدئو</label>
            <input type="file" name="video" accept="video/mp4,video/webm,video/ogg">
            <button class="full">📤 ارسال</button>
          </form>
        </div>
      `;

      sendHtml(res, 200, "گفتگو", html, currentUser);
      return;
    }

    // SEND MESSAGE
    if (req.method === "POST" && path === "/chat") {
      rateLimiter(CONFIG.MESSAGE_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const form = await readMultipart(req);
        const receiver = safeInt(form.fields.receiver_id);
        const message = trimText(form.fields.message, CONFIG.MAX_MESSAGE);
        let imageUrl = null, videoUrl = null;

        const image = form.files.image;
        if (image && image.buffer && image.buffer.length) {
          if (isValidImage(image)) {
            imageUrl = image.url;
          }
        }

        const video = form.files.video;
        if (video && video.buffer && video.buffer.length) {
          if (isValidVideo(video, CONFIG.MAX_VIDEO_SIZE)) {
            videoUrl = saveVideo(video.buffer, "messages");
          }
        }

        if (!receiver || receiver === currentUser.id || (!message && !imageUrl && !videoUrl)) {
          redirect(res, "/messages");
          return;
        }

        const result = await pool.query(`SELECT id FROM users WHERE id = $1`, [receiver]);
        if (result.rows.length && !await areBlocked(currentUser.id, receiver)) {
          await pool.query(`
            INSERT INTO messages(sender_id, receiver_id, message, image_url, video_url)
            VALUES($1, $2, $3, $4, $5)
          `, [currentUser.id, receiver, message || "", imageUrl, videoUrl]);

          await createNotification(
            receiver,
            currentUser.id,
            CONFIG.NOTIFICATION_TYPES.MESSAGE,
            null,
            `${currentUser.name} برای شما پیام فرستاد.`,
            null,
            `/chat?id=${currentUser.id}`
          );
        }

        redirect(res, `/chat?id=${receiver}`);
      });
      return;
    }

    // NOTIFICATIONS
    if (req.method === "GET" && path === "/notifications") {
      const notifications = await getNotifications(currentUser.id, 100, 0);
      await markAllNotificationsRead(currentUser.id);

      let html = `
        <div class="card">
          <h2>🔔 اعلان‌ها</h2>
          ${notifications.length > 0 ? `<button onclick="location.href='/clear-notifications'" class="danger" style="font-size:12px;">🗑️ حذف همه</button>` : ''}
        </div>
      `;

      if (notifications.length) {
        for (const notif of notifications) {
          html += `
            <div class="card">
              <div class="profile-head">
                ${notif.actor_avatar ? `<div class="avatar"><img src="${escapeAttr(notif.actor_avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>` : `<div class="avatar">🔔</div>`}
                <div>
                  <div class="username">${escapeHtml(notif.actor_name || "سیستم")}</div>
                  <div class="small">${timeAgo(notif.created_at)}</div>
                </div>
              </div>
              <div class="post-text">${escapeHtml(notif.message)}</div>
              ${notif.link ? `<a href="${escapeAttr(notif.link)}"><button class="full">مشاهده</button></a>` : ''}
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">اعلان جدیدی ندارید.</div>`;
      }

      sendHtml(res, 200, "اعلان‌ها", html, currentUser);
      return;
    }

    // CLEAR NOTIFICATIONS
    if (req.method === "GET" && path === "/clear-notifications") {
      await deleteAllNotifications(currentUser.id);
      redirect(res, "/notifications");
      return;
    }

    // SAVED
    if (req.method === "GET" && (path === "/saved" || path === "/bookmarks")) {
      const result = await pool.query(`
        SELECT
          p.*,
          u.name,
          u.email,
          u.avatar_url,
          u.is_verified,
          (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
          EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = $1) as liked,
          TRUE as bookmarked
        FROM bookmarks b
        JOIN posts p ON p.id = b.post_id
        JOIN users u ON u.id = p.user_id
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC
        LIMIT 100
      `, [currentUser.id]);

      sendHtml(res, 200, "ذخیره‌ها",
        result.rows.length ?
          result.rows.map(post => postCard(post, currentUser, false)).join("") :
          `<div class="card empty">هنوز پستی ذخیره نکرده‌اید.</div>`,
        currentUser
      );
      return;
    }

    // REPORT
    if (req.method === "GET" && path === "/report") {
      const postId = safeInt(requestUrl.searchParams.get("post"));
      const userId = safeInt(requestUrl.searchParams.get("user"));
      if (!postId && !userId) { redirect(res, "/"); return; }

      sendHtml(res, 200, "گزارش", `
        <div class="card">
          <h2>🚩 گزارش</h2>
          <form method="POST" action="/report">
            <input type="hidden" name="post_id" value="${postId || ''}">
            <input type="hidden" name="reported_user_id" value="${userId || ''}">
            <select name="reason" required>
              <option value="">دلیل گزارش را انتخاب کنید...</option>
              <option value="spam">هرزنامه</option>
              <option value="abuse">توهین و آزار</option>
              <option value="inappropriate">محتوای نامناسب</option>
              <option value="fake">حساب جعلی</option>
              <option value="copyright">نقض کپی‌رایت</option>
              <option value="harassment">آزار و اذیت</option>
              <option value="hate_speech">گفتار نفرت‌انگیز</option>
              <option value="violence">خشونت</option>
              <option value="nudity">محتوای بزرگسالان</option>
              <option value="other">سایر</option>
            </select>
            <textarea name="details" maxlength="${CONFIG.MAX_REPORT}" placeholder="توضیحات بیشتر..."></textarea>
            <button class="full danger">🚩 ارسال گزارش</button>
          </form>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/report") {
      const data = await readBody(req);
      const postId = safeInt(data.get("post_id"));
      const reportedUserId = safeInt(data.get("reported_user_id"));
      const reason = trimText(data.get("reason"), 100);
      const details = trimText(data.get("details"), CONFIG.MAX_REPORT);

      if (!reason || (!postId && !reportedUserId)) {
        sendError(res, 400, "دلیل گزارش لازم است.", currentUser);
        return;
      }

      await pool.query(`
        INSERT INTO reports(reporter_id, reported_user_id, post_id, reason, details)
        VALUES($1, $2, $3, $4, $5)
      `, [currentUser.id, reportedUserId || null, postId || null, reason, details || null]);

      sendHtml(res, 200, "گزارش ثبت شد", `
        <div class="card">
          <h2 class="success">✅ گزارش ثبت شد</h2>
          <p>گزارش شما دریافت شد و توسط تیم بررسی خواهد شد.</p>
          <a href="/"><button class="full">🏠 بازگشت به خانه</button></a>
        </div>
      `, currentUser);
      return;
    }

    // JOBS
    if (req.method === "GET" && path === "/jobs") {
      const q = trimText(requestUrl.searchParams.get("q"), CONFIG.MAX_SEARCH);
      const city = trimText(requestUrl.searchParams.get("city"), 100);

      let query = `
        SELECT j.*, u.name as company_name, u.avatar_url as company_logo
        FROM jobs j
        JOIN users u ON u.id = j.user_id
        WHERE j.is_active = TRUE AND j.expires_at > CURRENT_TIMESTAMP
      `;
      const params = [];
      let paramIndex = 1;

      if (q) {
        query += ` AND (j.title ILIKE $${paramIndex} OR j.description ILIKE $${paramIndex})`;
        params.push(`%${q}%`);
        paramIndex++;
      }

      if (city) {
        query += ` AND j.city ILIKE $${paramIndex}`;
        params.push(`%${city}%`);
        paramIndex++;
      }

      query += ` ORDER BY j.created_at DESC LIMIT 50`;

      const result = await pool.query(query, params);

      let html = `
        <div class="card">
          <h2>💼 کاریابی</h2>
          <form method="GET" action="/jobs">
            <input name="q" value="${escapeAttr(q)}" placeholder="عنوان شغل یا توضیحات...">
            <input name="city" value="${escapeAttr(city)}" placeholder="شهر...">
            <button class="full">🔎 جستجو</button>
          </form>
          <a href="/new-job"><button class="full green">➕ ثبت آگهی کار</button></a>
        </div>
      `;

      if (result.rows.length) {
        for (const job of result.rows) {
          html += `
            <div class="job">
              ${job.company_logo ? `<div class="avatar" style="width:40px;height:40px;display:inline-block;margin-bottom:8px;"><img src="${escapeAttr(job.company_logo)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>` : ''}
              <div class="job-title">${escapeHtml(job.title)}</div>
              <div class="job-city">📍 ${escapeHtml(job.city)}</div>
              <div class="job-salary">💰 ${escapeHtml(job.salary)}</div>
              <div class="job-description">${escapeHtml(job.description)}</div>
              ${job.requirements ? `<div class="small"><strong>مهارت‌ها:</strong> ${escapeHtml(job.requirements)}</div>` : ''}
              <div class="small">ثبت‌کننده: ${escapeHtml(job.company_name || '')} · ${formatDate(job.created_at)}</div>
              <div class="small">${job.view_count} بازدید · ${job.apply_count} درخواست</div>
              ${Number(job.user_id) === Number(currentUser.id) ? `
                <div class="actions">
                  <a href="/delete-job?id=${job.id}"><button class="danger">🗑️ حذف آگهی</button></a>
                </div>
              ` : `
                <a href="/apply-job?id=${job.id}"><button class="green">📩 درخواست</button></a>
              `}
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">آگهی‌ای پیدا نشد.</div>`;
      }

      sendHtml(res, 200, "کاریابی", html, currentUser);
      return;
    }

    // NEW JOB
    if (req.method === "GET" && path === "/new-job") {
      sendHtml(res, 200, "ثبت آگهی", `
        <div class="card">
          <h2>➕ ثبت آگهی کار</h2>
          <form method="POST" action="/new-job">
            <input name="title" maxlength="200" placeholder="عنوان شغل" required>
            <input name="city" maxlength="100" placeholder="شهر" required>
            <input name="salary" maxlength="200" placeholder="حقوق" required>
            <textarea name="description" maxlength="${CONFIG.MAX_JOB}" placeholder="توضیحات شغل..." required></textarea>
            <input name="requirements" maxlength="${CONFIG.MAX_JOB}" placeholder="مهارت‌ها و شرایط (اختیاری)">
            <input name="contact_info" maxlength="200" placeholder="اطلاعات تماس (اختیاری)">
            <input name="company_name" maxlength="200" placeholder="نام شرکت (اختیاری)">
            <input name="company_website" maxlength="200" placeholder="وب‌سایت شرکت (اختیاری)">
            <div class="notice">آگهی پس از ۳۰ روز به‌طور خودکار منقضی می‌شود.</div>
            <button class="full green">📢 انتشار آگهی</button>
          </form>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/new-job") {
      rateLimiter(CONFIG.JOB_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const data = await readBody(req);
        const title = trimText(data.get("title"), 200);
        const city = trimText(data.get("city"), 100);
        const salary = trimText(data.get("salary"), 200);
        const description = trimText(data.get("description"), CONFIG.MAX_JOB);
        const requirements = trimText(data.get("requirements"), CONFIG.MAX_JOB) || null;
        const contactInfo = trimText(data.get("contact_info"), 200) || null;
        const companyName = trimText(data.get("company_name"), 200) || null;
        const companyWebsite = trimText(data.get("company_website"), 200) || null;

        if (!title || !city || !salary || !description) {
          sendError(res, 400, "تمام فیلدهای الزامی را پر کنید.", currentUser);
          return;
        }

        await pool.query(`
          INSERT INTO jobs(user_id, title, city, salary, description, requirements, contact_info, company_name, company_website)
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [currentUser.id, title, city, salary, description, requirements, contactInfo, companyName, companyWebsite]);

        redirect(res, "/jobs");
      });
      return;
    }

    // DELETE JOB
    if (req.method === "GET" && path === "/delete-job") {
      const id = safeInt(requestUrl.searchParams.get("id"));
      if (id) {
        await pool.query(`DELETE FROM jobs WHERE id = $1 AND user_id = $2`, [id, currentUser.id]);
      }
      redirect(res, "/jobs");
      return;
    }

    // APPLY JOB
    if (req.method === "GET" && path === "/apply-job") {
      const id = safeInt(requestUrl.searchParams.get("id"));
      if (id) {
        const job = await pool.query(`SELECT user_id FROM jobs WHERE id = $1 AND is_active = TRUE`, [id]);
        if (job.rows.length && job.rows[0].user_id !== currentUser.id) {
          const exists = await pool.query(`SELECT 1 FROM job_applications WHERE job_id = $1 AND user_id = $2`, [id, currentUser.id]);
          if (!exists.rows.length) {
            await pool.query(`
              INSERT INTO job_applications(job_id, user_id)
              VALUES($1, $2)
              ON CONFLICT DO NOTHING
            `, [id, currentUser.id]);
            await pool.query(`UPDATE jobs SET apply_count = apply_count + 1 WHERE id = $1`, [id]);
            await createNotification(
              job.rows[0].user_id,
              currentUser.id,
              CONFIG.NOTIFICATION_TYPES.JOB_APPLY,
              null,
              `${currentUser.name} برای آگهی کاری شما درخواست داد.`,
              null,
              `/jobs`
            );
          }
        }
      }
      redirect(res, "/jobs");
      return;
    }

    // SETTINGS
    if (req.method === "GET" && path === "/settings") {
      const result = await pool.query(`
        SELECT name, username, email, phone, bio, avatar_url, cover_url, is_private, theme, language
        FROM users WHERE id = $1
      `, [currentUser.id]);

      const profile = result.rows[0] || currentUser;

      sendHtml(res, 200, "تنظیمات", `
        <div class="card">
          <div class="profile-center">
            ${avatarHtml(profile, true, "100px")}
            <div class="username" style="font-size:20px;margin-top:8px;">${escapeHtml(profile.name)}</div>
          </div>
          <div class="divider"></div>
          <form method="POST" action="/settings" enctype="multipart/form-data">
            <input name="name" maxlength="${CONFIG.MAX_NAME}" value="${escapeAttr(profile.name)}" placeholder="نام" required>
            <input name="username" maxlength="30" value="${escapeAttr(profile.username || '')}" placeholder="نام کاربری">
            <input name="phone" maxlength="20" value="${escapeAttr(profile.phone || '')}" placeholder="شماره موبایل">
            <textarea name="bio" maxlength="${CONFIG.MAX_BIO}" placeholder="درباره من">${escapeHtml(profile.bio || '')}</textarea>
            <label>🖼️ عکس پروفایل</label>
            <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp,image/gif">
            <label>🖼️ عکس کاور</label>
            <input type="file" name="cover" accept="image/jpeg,image/png,image/webp,image/gif">
            <div class="notice">حداکثر حجم تصاویر: ۲ مگابایت</div>
            <label>🔒 حریم خصوصی</label>
            <select name="is_private">
              <option value="false" ${!profile.is_private ? 'selected' : ''}>عمومی</option>
              <option value="true" ${profile.is_private ? 'selected' : ''}>خصوصی</option>
            </select>
            <label>🎨 تم</label>
            <select name="theme">
              <option value="light" ${profile.theme === 'light' ? 'selected' : ''}>روشن</option>
              <option value="dark" ${profile.theme === 'dark' ? 'selected' : ''}>تاریک</option>
            </select>
            <label>🌐 زبان</label>
            <select name="language">
              <option value="fa" ${profile.language === 'fa' ? 'selected' : ''}>فارسی</option>
              <option value="en" ${profile.language === 'en' ? 'selected' : ''}>English</option>
              <option value="ar" ${profile.language === 'ar' ? 'selected' : ''}>العربية</option>
              <option value="tr" ${profile.language === 'tr' ? 'selected' : ''}>Türkçe</option>
            </select>
            <button class="full">💾 ذخیره تغییرات</button>
          </form>
          <div class="actions">
            <a href="/delete-avatar"><button class="danger">🗑️ حذف عکس</button></a>
          </div>
        </div>
        <div class="card menu">
          <button class="secondary" onclick="toggleTheme()">🎨 تغییر رنگ</button>
          <a href="/password"><button>🔐 تغییر رمز</button></a>
          <a href="/notifications"><button>🔔 اعلان‌ها</button></a>
          <a href="/saved"><button>🔖 ذخیره‌ها</button></a>
          <a href="/calls"><button>📞 تماس‌ها</button></a>
          <a href="/delete-account"><button class="danger">🗑️ حذف حساب</button></a>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/settings") {
      const form = await readMultipart(req);
      const name = trimText(form.fields.name, CONFIG.MAX_NAME);
      const username = trimText(form.fields.username, 30) || null;
      const phone = trimText(form.fields.phone, 20) || null;
      const bio = trimText(form.fields.bio, CONFIG.MAX_BIO) || null;
      const isPrivate = form.fields.is_private === "true";
      const theme = trimText(form.fields.theme, 20) || "light";
      const language = trimText(form.fields.language, 5) || "fa";

      if (!name) {
        sendError(res, 400, "نام نمی‌تواند خالی باشد.", currentUser);
        return;
      }

      let avatarUrl = currentUser.avatar_url || null;
      let coverUrl = currentUser.cover_url || null;

      const avatar = form.files.avatar;
      if (avatar && avatar.buffer && avatar.buffer.length) {
        if (!isValidImage(avatar)) {
          sendError(res, 400, "تصویر پروفایل نامعتبر است.", currentUser);
          return;
        }
        if (currentUser.avatar_url) deleteImage(currentUser.avatar_url);
        avatarUrl = avatar.url;
      }

      const cover = form.files.cover;
      if (cover && cover.buffer && cover.buffer.length) {
        if (!isValidImage(cover)) {
          sendError(res, 400, "تصویر کاور نامعتبر است.", currentUser);
          return;
        }
        if (currentUser.cover_url) deleteImage(currentUser.cover_url);
        coverUrl = cover.url;
      }

      await pool.query(`
        UPDATE users
        SET name = $1, username = $2, phone = $3, bio = $4, avatar_url = $5, cover_url = $6, is_private = $7, theme = $8, language = $9
        WHERE id = $10
      `, [name, username, phone, bio, avatarUrl, coverUrl, isPrivate, theme, language, currentUser.id]);

      redirect(res, "/profile");
      return;
    }

    // DELETE AVATAR
    if (req.method === "GET" && path === "/delete-avatar") {
      if (currentUser.avatar_url) deleteImage(currentUser.avatar_url);
      await pool.query(`UPDATE users SET avatar_url = NULL WHERE id = $1`, [currentUser.id]);
      redirect(res, "/settings");
      return;
    }

    // DELETE ACCOUNT
    if (req.method === "GET" && path === "/delete-account") {
      sendHtml(res, 200, "حذف حساب", `
        <div class="card">
          <h2 class="error">⚠️ حذف حساب کاربری</h2>
          <p>آیا از حذف حساب خود اطمینان دارید؟ این عمل غیرقابل بازگشت است.</p>
          <form method="POST" action="/delete-account">
            <input name="confirm" type="text" placeholder="برای تایید عبارت 'حذف' را وارد کنید" required>
            <button class="full danger">🗑️ حذف دائمی حساب</button>
          </form>
          <a href="/"><button class="full">بازگشت</button></a>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/delete-account") {
      const data = await readBody(req);
      const confirm = trimText(data.get("confirm"), 10);

      if (confirm !== "حذف") {
        sendError(res, 400, "برای تایید عبارت 'حذف' را وارد کنید.", currentUser);
        return;
      }

      // Delete all user data
      await pool.query(`DELETE FROM users WHERE id = $1`, [currentUser.id]);

      // Clear session
      const sessionId = parseCookies(req).sessionId;
      if (sessionId) {
        await pool.query(`DELETE FROM sessions WHERE session_id = $1`, [sessionId]);
      }

      redirect(res, "/", clearSessionCookie());
      return;
    }

    // PASSWORD
    if (req.method === "GET" && path === "/password") {
      sendHtml(res, 200, "تغییر رمز", `
        <div class="card">
          <h2>🔐 تغییر رمز عبور</h2>
          <form method="POST" action="/password">
            <input name="old_password" type="password" placeholder="رمز فعلی" required>
            <input name="new_password" type="password" minlength="8" placeholder="رمز جدید (حداقل ۸ کاراکتر)" required>
            <input name="new_password2" type="password" minlength="8" placeholder="تکرار رمز جدید" required>
            <button class="full">تغییر رمز</button>
          </form>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/password") {
      const data = await readBody(req);
      const old = String(data.get("old_password") || "");
      const nw = String(data.get("new_password") || "");
      const nw2 = String(data.get("new_password2") || "");

      const result = await pool.query(`SELECT password FROM users WHERE id = $1`, [currentUser.id]);

      if (!result.rows.length || !verifyPassword(old, result.rows[0].password)) {
        sendError(res, 400, "رمز فعلی اشتباه است.", currentUser);
        return;
      }

      if (!isValidPassword(nw) || nw !== nw2) {
        sendError(res, 400, "رمز جدید باید حداقل ۸ کاراکتر باشد و با تکرار آن مطابقت داشته باشد.", currentUser);
        return;
      }

      const hashed = hashPassword(nw);
      await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, currentUser.id]);
      await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [currentUser.id]);

      sendHtml(res, 200, "موفق", `
        <div class="card">
          <h2 class="success">✅ رمز عبور تغییر کرد</h2>
          <p>برای ادامه، دوباره وارد شوید.</p>
          <a href="/login"><button class="full">🔐 ورود</button></a>
        </div>
      `);
      return;
    }

    // CALLS
    if (req.method === "GET" && path === "/calls") {
      sendHtml(res, 200, "تماس", `
        <div class="card">
          <h2>📞 تماس صوتی و تصویری</h2>
          <p>برای تماس، وارد پروفایل کاربر شده و دکمه تماس را انتخاب کنید.</p>
          <a href="/search"><button class="full">🔎 پیدا کردن کاربر</button></a>
        </div>
        <div class="notice">تماس با استفاده از WebRTC انجام می‌شود. هر دو طرف باید آنلاین باشند.</div>
      `, currentUser);
      return;
    }

    // CALL
    if (req.method === "GET" && path === "/call") {
      const otherId = safeInt(requestUrl.searchParams.get("user"));
      const mode = requestUrl.searchParams.get("mode") === "video" ? "video" : "audio";

      if (!otherId || otherId === currentUser.id) { redirect(res, "/calls"); return; }

      const result = await pool.query(`SELECT id, name, username, avatar_url FROM users WHERE id = $1`, [otherId]);
      if (!result.rows.length || await areBlocked(currentUser.id, otherId)) {
        sendError(res, 403, "امکان تماس وجود ندارد.", currentUser);
        return;
      }

      const callId = randomToken(16);

      sendHtml(res, 200, mode === "video" ? "تماس تصویری" : "تماس صوتی", `
        <div class="call-box">
          <h2>📞 تماس با ${escapeHtml(result.rows[0].name)}</h2>
          <p id="status">در حال آماده‌سازی...</p>
          <video id="remote" class="post-video" autoplay playsinline style="max-height:50vh;"></video>
          <video id="local" class="post-video" autoplay muted playsinline style="max-height:30vh;margin-top:8px;"></video>
          <div class="actions" style="justify-content:center;margin-top:16px;">
            <button onclick="startCall()" class="green">▶️ شروع</button>
            <button onclick="hangup()" class="danger">⛔ پایان</button>
          </div>
        </div>
        <script>
          const peerId = ${otherId};
          const callId = ${JSON.stringify(callId)};
          const mode = ${JSON.stringify(mode)};
          let pc = null, stream = null, closed = false, polling = false;

          async function signal(type, payload) {
            const response = await fetch("/call-signal", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                receiver_id: String(peerId),
                call_id: callId,
                type: type,
                payload: JSON.stringify(payload || {})
              })
            });
            if (!response.ok) throw new Error("Signal failed");
          }

          async function makePeer() {
            pc = new RTCPeerConnection({
              iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
              ]
            });
            if (stream) {
              stream.getTracks().forEach(track => pc.addTrack(track, stream));
            }
            pc.ontrack = event => {
              if (event.streams && event.streams[0]) {
                document.getElementById("remote").srcObject = event.streams[0];
              }
            };
            pc.onicecandidate = event => {
              if (event.candidate) {
                signal("ice", event.candidate).catch(() => {});
              }
            };
          }

          async function getMedia() {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: mode === "video"
            });
            document.getElementById("local").srcObject = stream;
          }

          async function startCall() {
            if (pc) return;
            try {
              document.getElementById("status").textContent = "درخواست دسترسی...";
              await getMedia();
              await makePeer();
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await signal("offer", offer);
              document.getElementById("status").textContent = "در انتظار پاسخ...";
              poll();
            } catch (error) {
              document.getElementById("status").textContent = "دسترسی به میکروفن یا دوربین ممکن نیست.";
            }
          }

          async function acceptOffer(offer) {
            try {
              await getMedia();
              await makePeer();
              await pc.setRemoteDescription(new RTCSessionDescription(offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await signal("answer", answer);
              document.getElementById("status").textContent = "تماس برقرار است.";
            } catch (error) {
              document.getElementById("status").textContent = "برقراری تماس ممکن نشد.";
            }
          }

          async function poll() {
            if (closed || polling) return;
            polling = true;
            try {
              const response = await fetch("/call-signals?call_id=" + encodeURIComponent(callId), { cache: "no-store" });
              if (response.ok) {
                const signals = await response.json();
                for (const item of signals) {
                  let payload = {};
                  try { payload = JSON.parse(item.payload || "{}"); } catch {}
                  if (item.type === "offer") {
                    if (!pc) await acceptOffer(payload);
                  } else if (item.type === "answer") {
                    if (pc) {
                      await pc.setRemoteDescription(new RTCSessionDescription(payload));
                      document.getElementById("status").textContent = "تماس برقرار است.";
                    }
                  } else if (item.type === "ice") {
                    if (pc) {
                      try { await pc.addIceCandidate(new RTCIceCandidate(payload)); } catch {}
                    }
                  }
                }
              }
            } catch (error) {}
            polling = false;
            if (!closed) setTimeout(poll, 1000);
          }

          function hangup() {
            closed = true;
            if (stream) { stream.getTracks().forEach(track => { try { track.stop(); } catch {} }); }
            if (pc) { try { pc.close(); } catch {} }
            location.href = "/profile?id=" + peerId;
          }

          poll();
        </script>
      `, currentUser);
      return;
    }

    // CALL SIGNAL
    if (req.method === "POST" && path === "/call-signal") {
      const data = await readBody(req);
      const receiver = safeInt(data.get("receiver_id"));
      const callId = trimText(data.get("call_id"), 100);
      const type = trimText(data.get("type"), 20);
      const payload = String(data.get("payload") || "");

      if (!receiver || receiver === currentUser.id || !callId || !type || payload.length > CONFIG.MAX_CALL_PAYLOAD) {
        json(res, 400, { ok: false });
        return;
      }

      if (await areBlocked(currentUser.id, receiver)) {
        json(res, 403, { ok: false });
        return;
      }

      await pool.query(`
        INSERT INTO call_signals(caller_id, receiver_id, call_id, type, payload)
        VALUES($1, $2, $3, $4, $5)
      `, [currentUser.id, receiver, callId, type, payload]);

      await createNotification(
        receiver,
        currentUser.id,
        CONFIG.NOTIFICATION_TYPES.CALL,
        null,
        `${currentUser.name} برای شما درخواست تماس فرستاد.`,
        null,
        `/call?user=${currentUser.id}&mode=${type}`
      );

      json(res, 200, { ok: true });
      return;
    }

    // GET CALL SIGNALS
    if (req.method === "GET" && path === "/call-signals") {
      const callId = trimText(requestUrl.searchParams.get("call_id"), 100);
      if (!callId) { json(res, 400, []); return; }

      const result = await pool.query(`
        SELECT id, type, payload FROM call_signals
        WHERE receiver_id = $1 AND call_id = $2 AND consumed = FALSE
        ORDER BY id ASC
        LIMIT 50
      `, [currentUser.id, callId]);

      if (result.rows.length) {
        await pool.query(`
          UPDATE call_signals SET consumed = TRUE
          WHERE id = ANY($1::int[])
        `, [result.rows.map(item => item.id)]);
      }

      json(res, 200, result.rows);
      return;
    }

    // REELS
    if (req.method === "GET" && path === "/reels") {
      const reels = await pool.query(`
        SELECT r.*, u.name, u.avatar_url, u.is_verified
        FROM reels r
        JOIN users u ON u.id = r.user_id
        WHERE NOT EXISTS(SELECT 1 FROM blocked_users b WHERE (b.blocker_id = $1 AND b.blocked_id = r.user_id) OR (b.blocker_id = r.user_id AND b.blocked_id = $1))
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [currentUser.id]);

      let html = `
        <div class="card">
          <h2>🎬 ریلز</h2>
          <a href="/new-reel"><button class="full green">➕ انتشار ریلز</button></a>
        </div>
      `;

      if (reels.rows.length) {
        for (const reel of reels.rows) {
          const liked = await pool.query(`SELECT 1 FROM reel_likes WHERE reel_id = $1 AND user_id = $2`, [reel.id, currentUser.id]);
          html += `
            <div class="card">
              <div class="profile-head">
                ${avatarHtml(reel)}
                <div>
                  <div class="username">${escapeHtml(reel.name)} ${reel.is_verified ? '✅' : ''}</div>
                  <div class="small">${formatDate(reel.created_at)}</div>
                </div>
              </div>
              <video src="${escapeAttr(reel.video_url)}" controls style="width:100%;max-height:500px;border-radius:14px;margin-top:10px;" poster="${escapeAttr(reel.thumbnail_url || '')}"></video>
              ${reel.content ? `<div class="post-text">${escapeHtml(reel.content)}</div>` : ''}
              ${reel.music_title ? `<div class="small">🎵 ${escapeHtml(reel.music_title)} ${reel.music_artist ? '- ' + escapeHtml(reel.music_artist) : ''}</div>` : ''}
              <div class="stats">
                <span>❤️ ${reel.like_count}</span>
                <span>💬 ${reel.comment_count}</span>
                <span>👁️ ${reel.view_count}</span>
                <span>🔄 ${reel.share_count}</span>
              </div>
              <div class="actions">
                <a href="/reel-like?id=${reel.id}"><button class="like">${liked.rows.length ? '💔' : '❤️'}</button></a>
                <a href="/reel/${reel.id}"><button>💬</button></a>
                <a href="/share?reel=${reel.id}"><button>📤</button></a>
              </div>
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">هیچ ریلزی منتشر نشده است.</div>`;
      }

      sendHtml(res, 200, "ریلز", html, currentUser);
      return;
    }

    // NEW REEL
    if (req.method === "GET" && path === "/new-reel") {
      sendHtml(res, 200, "ریلز جدید", `
        <div class="card">
          <h2>🎬 انتشار ریلز</h2>
          <form method="POST" action="/new-reel" enctype="multipart/form-data">
            <label>🎬 ویدئو (حداکثر ۱۵ مگابایت)</label>
            <input type="file" name="video" accept="video/mp4,video/webm,video/ogg" required>
            <input name="content" maxlength="${CONFIG.MAX_POST}" placeholder="متن (اختیاری)">
            <input name="music_title" maxlength="200" placeholder="عنوان موسیقی (اختیاری)">
            <input name="music_artist" maxlength="200" placeholder="خواننده (اختیاری)">
            <div class="notice">ویدئو باید حداکثر ۶۰ ثانیه باشد.</div>
            <button class="full green">📤 انتشار ریلز</button>
          </form>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/new-reel") {
      rateLimiter(CONFIG.POST_RATE_LIMIT, CONFIG.RATE_LIMIT_WINDOW)(req, res, async () => {
        const form = await readMultipart(req);
        const content = trimText(form.fields.content, CONFIG.MAX_POST) || null;
        const musicTitle = trimText(form.fields.music_title, 200) || null;
        const musicArtist = trimText(form.fields.music_artist, 200) || null;

        const video = form.files.video;
        if (!video || !video.buffer || !video.buffer.length) {
          sendError(res, 400, "ویدئو لازم است.", currentUser);
          return;
        }

        if (!isValidVideo(video, CONFIG.MAX_REEL_SIZE)) {
          sendError(res, 400, "ویدئو نامعتبر است یا بیشتر از ۱۵ مگابایت است.", currentUser);
          return;
        }

        const videoUrl = saveVideo(video.buffer, "reels");

        await pool.query(`
          INSERT INTO reels(user_id, video_url, content, music_title, music_artist)
          VALUES($1, $2, $3, $4, $5)
        `, [currentUser.id, videoUrl, content, musicTitle, musicArtist]);

        redirect(res, "/reels");
      });
      return;
    }

    // REEL LIKE
    if (req.method === "GET" && path === "/reel-like") {
      const id = safeInt(requestUrl.searchParams.get("id"));
      if (id) {
        const exists = await pool.query(`SELECT 1 FROM reel_likes WHERE reel_id = $1 AND user_id = $2`, [id, currentUser.id]);
        if (exists.rows.length) {
          await pool.query(`DELETE FROM reel_likes WHERE reel_id = $1 AND user_id = $2`, [id, currentUser.id]);
          await pool.query(`UPDATE reels SET like_count = like_count - 1 WHERE id = $1`, [id]);
        } else {
          await pool.query(`INSERT INTO reel_likes(reel_id, user_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [id, currentUser.id]);
          await pool.query(`UPDATE reels SET like_count = like_count + 1 WHERE id = $1`, [id]);
        }
      }
      redirect(res, "/reels");
      return;
    }

    // LIVE
    if (req.method === "GET" && path === "/live") {
      const streams = await pool.query(`
        SELECT ls.*, u.name, u.avatar_url, u.is_verified
        FROM live_streams ls
        JOIN users u ON u.id = ls.user_id
        WHERE ls.status = 'live'
        ORDER BY ls.start_time DESC
        LIMIT 50
      `, []);

      let html = `
        <div class="card">
          <h2>📡 لایو استریم</h2>
          <a href="/new-live"><button class="full green">▶️ شروع لایو</button></a>
        </div>
      `;

      if (streams.rows.length) {
        for (const stream of streams.rows) {
          html += `
            <div class="job" onclick="location.href='/live/${stream.id}'" style="cursor:pointer;">
              <div style="display:flex;align-items:center;gap:10px;">
                ${avatarHtml(stream)}
                <div>
                  <div class="username">${escapeHtml(stream.name)} ${stream.is_verified ? '✅' : ''}</div>
                  <div class="small">🔴 زنده - ${stream.viewer_count} بیننده</div>
                </div>
              </div>
              <div style="font-weight:bold;margin-top:5px;">${escapeHtml(stream.title)}</div>
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">هیچ لایوی در حال پخش نیست.</div>`;
      }

      sendHtml(res, 200, "لایو", html, currentUser);
      return;
    }

    // NEW LIVE
    if (req.method === "GET" && path === "/new-live") {
      sendHtml(res, 200, "شروع لایو", `
        <div class="card">
          <h2>📡 شروع لایو</h2>
          <form method="POST" action="/new-live">
            <input name="title" maxlength="200" placeholder="عنوان لایو" required>
            <div class="notice">لایو شما پس از شروع برای همه قابل مشاهده خواهد بود.</div>
            <button class="full green">▶️ شروع لایو</button>
          </form>
        </div>
      `, currentUser);
      return;
    }

    if (req.method === "POST" && path === "/new-live") {
      const data = await readBody(req);
      const title = trimText(data.get("title"), 200);

      if (!title) {
        sendError(res, 400, "عنوان لایو لازم است.", currentUser);
        return;
      }

      const streamKey = randomToken(32);

      await pool.query(`
        INSERT INTO live_streams(user_id, title, stream_key, status)
        VALUES($1, $2, $3, 'live')
      `, [currentUser.id, title, streamKey]);

      redirect(res, "/live");
      return;
    }

    // ADMIN PANEL
    if (req.method === "GET" && path === "/admin") {
      if (!currentUser.is_admin) {
        sendError(res, 403, "شما دسترسی ادمین ندارید.", currentUser);
        return;
      }

      // Statistics
      const stats = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM users) as users,
          (SELECT COUNT(*) FROM posts) as posts,
          (SELECT COUNT(*) FROM comments) as comments,
          (SELECT COUNT(*) FROM likes) as likes,
          (SELECT COUNT(*) FROM follows) as follows,
          (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports,
          (SELECT COUNT(*) FROM stories WHERE expires_at > CURRENT_TIMESTAMP) as active_stories,
          (SELECT COUNT(*) FROM reels) as reels,
          (SELECT COUNT(*) FROM live_streams WHERE status = 'live') as live_streams
      `);

      // Users
      const users = await pool.query(`
        SELECT id, name, email, username, created_at, is_verified, is_suspended
        FROM users
        ORDER BY created_at DESC
        LIMIT 50
      `);

      // Reports
      const reports = await pool.query(`
        SELECT r.*, u1.name as reporter_name, u2.name as reported_name
        FROM reports r
        LEFT JOIN users u1 ON u1.id = r.reporter_id
        LEFT JOIN users u2 ON u2.id = r.reported_user_id
        ORDER BY r.created_at DESC
        LIMIT 50
      `);

      let html = `
        <div class="card">
          <h2>🛡️ پنل ادمین</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:12px;">
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].users}</strong><br>کاربران</div>
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].posts}</strong><br>پست‌ها</div>
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].comments}</strong><br>نظرات</div>
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].likes}</strong><br>لایک‌ها</div>
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].follows}</strong><br>دنبال‌ها</div>
            <div class="card" style="text-align:center;padding:12px;background:#fff3e0;"><strong style="color:#e65100;">${stats.rows[0].pending_reports}</strong><br>گزارش‌های جدید</div>
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].active_stories}</strong><br>استوری‌ها</div>
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].reels}</strong><br>ریلز</div>
            <div class="card" style="text-align:center;padding:12px;"><strong>${stats.rows[0].live_streams}</strong><br>لایو</div>
          </div>
        </div>

        <h3>👥 کاربران</h3>
      `;

      for (const user of users.rows) {
        html += `
          <div class="card">
            <div class="profile-head">
              <div class="avatar">${initials(user.name)}</div>
              <div>
                <div class="username">${escapeHtml(user.name)} ${user.is_verified ? '✅' : ''}</div>
                <div class="email">${escapeHtml(user.email)}</div>
                <div class="small">${user.username ? `@${escapeHtml(user.username)}` : ''} · ${formatDate(user.created_at)}</div>
              </div>
              <div style="margin-right:auto;display:flex;gap:6px;">
                ${!user.is_suspended ? `<a href="/admin?action=suspend&id=${user.id}"><button class="danger">🚫</button></a>` : `<a href="/admin?action=unsuspend&id=${user.id}"><button class="green">✅</button></a>`}
                ${!user.is_verified ? `<a href="/admin?action=verify&id=${user.id}"><button class="green">✔️</button></a>` : `<a href="/admin?action=unverify&id=${user.id}"><button class="secondary">❌</button></a>`}
                <a href="/admin?action=delete&id=${user.id}"><button class="danger">🗑️</button></a>
              </div>
            </div>
          </div>
        `;
      }

      html += `<h3>🚩 گزارش‌ها</h3>`;

      if (reports.rows.length) {
        for (const report of reports.rows) {
          html += `
            <div class="card">
              <div>گزارش‌دهنده: <strong>${escapeHtml(report.reporter_name || 'نامشخص')}</strong></div>
              <div>گزارش‌شونده: <strong>${escapeHtml(report.reported_name || 'پست')}</strong></div>
              <div>دلیل: <strong>${escapeHtml(report.reason)}</strong></div>
              ${report.details ? `<div class="small">${escapeHtml(report.details)}</div>` : ''}
              <div class="small">${formatDate(report.created_at)} · وضعیت: ${report.status}</div>
              ${report.status === 'pending' ? `
                <div class="actions">
                  <a href="/admin?action=resolve&id=${report.id}"><button class="green">✅ بررسی شد</button></a>
                  <a href="/admin?action=reject&id=${report.id}"><button class="secondary">❌ رد</button></a>
                </div>
              ` : ''}
            </div>
          `;
        }
      } else {
        html += `<div class="card empty">گزارشی وجود ندارد.</div>`;
      }

      sendHtml(res, 200, "ادمین", html, currentUser);
      return;
    }

    // ADMIN ACTIONS
    if (req.method === "GET" && path === "/admin") {
      if (!currentUser.is_admin) {
        sendError(res, 403, "شما دسترسی ادمین ندارید.", currentUser);
        return;
      }

      const action = requestUrl.searchParams.get("action");
      const id = safeInt(requestUrl.searchParams.get("id"));

      if (action === "delete" && id) {
        await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
      } else if (action === "suspend" && id) {
        await pool.query(`UPDATE users SET is_suspended = TRUE, suspended_reason = 'توسط ادمین' WHERE id = $1`, [id]);
      } else if (action === "unsuspend" && id) {
        await pool.query(`UPDATE users SET is_suspended = FALSE, suspended_reason = NULL WHERE id = $1`, [id]);
      } else if (action === "verify" && id) {
        await pool.query(`UPDATE users SET is_verified = TRUE WHERE id = $1`, [id]);
      } else if (action === "unverify" && id) {
        await pool.query(`UPDATE users SET is_verified = FALSE WHERE id = $1`, [id]);
      } else if (action === "resolve" && id) {
        await pool.query(`UPDATE reports SET status = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
      } else if (action === "reject" && id) {
        await pool.query(`UPDATE reports SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
      }

      redirect(res, "/admin");
      return;
    }

    // 404
    sendHtml(res, 404, "صفحه پیدا نشد", `
      <div class="card empty">
        <h2>۴۰۴</h2>
        <p>صفحه مورد نظر پیدا نشد.</p>
        <a href="/"><button class="full">🏠 بازگشت به خانه</button></a>
      </div>
    `, currentUser);

  } catch (error) {
    logger.error("Request error:", { error: error.message, stack: error.stack, url: req.url });
    if (!res.headersSent) {
      sendError(res, 500, "خطای داخلی سرور. لطفاً دوباره تلاش کنید.");
    } else {
      try { res.end(); } catch {}
    }
  }
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    await createTables();
    await pool.query("SELECT 1");
    server.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📧 Admin email: ${ADMIN_EMAIL}`);
      console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
    });
  } catch (error) {
    logger.error("Startup error:", error);
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

// ============================================================
// SHUTDOWN
// ============================================================
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down...`);
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`); 

  try {
    await pool.end();
    logger.info("Database pool closed");
    console.log("✅ Database connection closed");
  } catch (error) {
    logger.error("Pool close error:", error);
    console.error("❌ Error closing database:", error.message);
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", { error: error.message, stack: error.stack });
  console.error("💥 Uncaught exception:", error.message);
});
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection:", { reason, promise });
  console.error("💥 Unhandled rejection:", reason);
});

// ============================================================
// CLEANUP JOBS
// ============================================================
setInterval(async () => {
  try {
    // Clean expired stories
    await pool.query(`DELETE FROM stories WHERE expires_at < CURRENT_TIMESTAMP`);

    // Clean expired jobs
    await pool.query(`UPDATE jobs SET is_active = FALSE WHERE expires_at < CURRENT_TIMESTAMP`);

    // Clean old sessions
    await pool.query(`DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP`);

    // Clean old notifications
    await pool.query(`DELETE FROM notifications WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`);

    // Clean old activity logs
    await pool.query(`DELETE FROM activity_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`);

    // Clean temp files
    cleanDirectory(CONFIG.TEMP_DIR, 86400000);

    logger.debug("Cleanup jobs completed");
  } catch (error) {
    logger.error("Cleanup jobs error:", error);
  }
}, 3600000);

// ============================================================
// START
// ============================================================
startServer();
