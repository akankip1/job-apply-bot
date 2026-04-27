const fs = require("fs");
const path = require("path");
const { clean, escapeRegExp } = require("./text");

function parseMarkdownTable(markdown) {
  const values = new Map();
  for (const line of markdown.split(/\n/)) {
    if (!line.trim().startsWith("|") || /^[-|\s]+$/.test(line.replace(/\|/g, ""))) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => clean(cell));
    if (cells.length < 2) continue;
    const key = cells[0].toLowerCase();
    const value = cells.slice(1).join(" | ");
    if (!key || !value || key === "field" || key === "question" || key === "link type") continue;
    values.set(key, value);
  }
  return values;
}

function section(markdown, startHeading) {
  const re = new RegExp(`^#+\\s+${escapeRegExp(startHeading)}\\s*$`, "im");
  const match = markdown.match(re);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/\n#\s+/);
  return clean(next >= 0 ? rest.slice(0, next) : rest);
}

function parseResumePath(markdown) {
  const codeBlock = markdown.match(/## Resume[\s\S]*?```(?:text)?\s*([\s\S]*?)```/i);
  const raw = clean(codeBlock ? codeBlock[1] : "");
  if (!raw) return "";
  if (/^file:\/\//i.test(raw)) {
    try {
      return decodeURIComponent(new URL(raw).pathname)
        .replace(/^\/([A-Za-z]:\/)/, "$1")
        .replace(/\//g, path.sep);
    } catch {
      return raw.replace(/^file:\/\/\//i, "").replace(/\//g, path.sep);
    }
  }
  return raw;
}

function firstSectionValue(markdown, heading, label) {
  const content = section(markdown, heading);
  const re = new RegExp(`\\*\\*${escapeRegExp(label)}:\\*\\*\\s*([^\\n]+)`, "i");
  const match = content.match(re);
  return clean(match ? match[1] : "");
}

function loadProfile(root) {
  const profileFile = path.join(root, "sravya_narayana_application_profile.md");
  const fallbackFile = path.join(root, "application_profile.md");
  const profilePath = fs.existsSync(profileFile) ? profileFile : fallbackFile;
  if (!fs.existsSync(profilePath)) throw new Error("No application profile file found.");

  const markdown = fs.readFileSync(profilePath, "utf8");
  const table = parseMarkdownTable(markdown);
  const location = table.get("location") || "";
  const [city = "", state = "", country = ""] = location.split(",").map((part) => clean(part));
  const workExperience = section(markdown, "Work Experience");
  const education = section(markdown, "Education");
  const skills = section(markdown, "Skills").replace(/^##\s+/gm, "").replace(/^- /gm, "").trim();

  return {
    profilePath,
    standard: {
      firstName: table.get("first name") || "",
      lastName: table.get("last name") || "",
      preferredName: table.get("preferred name") || "",
      email: table.get("email address") || "",
      phone: table.get("phone number") || "",
      location,
      city,
      state,
      country,
      address: table.get("address") || "",
      postalCode: table.get("postal code") || "",
      linkedIn: table.get("linkedin url") || "",
      github: table.get("github url") || "",
      portfolio: table.get("portfolio url") || "",
      currentTitle: firstSectionValue(markdown, "Work Experience", "Title"),
      currentEmployer: firstSectionValue(markdown, "Work Experience", "Company"),
      workExperience,
      education,
      skills,
      resumePath: parseResumePath(markdown),
    },
    sensitive: {
      ethnicity: table.get("what is your ethnicity?") || "",
      authorizedUS: table.get("are you authorized to work in the us?") || "",
      authorizedCanada: table.get("are you authorized to work in canada?") || "",
      authorizedUK: table.get("are you authorized to work in the united kingdom?") || "",
      sponsorship: table.get("will you now or in the future require sponsorship for employment visa status?") || "",
      disability: table.get("do you have a disability?") || "",
      lgbtq: table.get("do you identify as lgbtq+?") || "",
      gender: table.get("what is your gender?") || "",
      veteran: table.get("are you a veteran?") || "",
    },
  };
}

module.exports = {
  loadProfile,
};
