const fs = require("fs");
const path = require("path");

const DEFAULT_ANSWERS = {
  how_did_you_hear: "",
  previously_employed_by_company: "",
  comfortable_with_hybrid_or_relocation: "",
};

function loadAnswers(root) {
  const answersPath = path.join(root, "answers.json");
  if (!fs.existsSync(answersPath)) {
    fs.writeFileSync(answersPath, `${JSON.stringify(DEFAULT_ANSWERS, null, 2)}\n`, "utf8");
  }
  const parsed = JSON.parse(fs.readFileSync(answersPath, "utf8"));
  return { answersPath, answers: { ...DEFAULT_ANSWERS, ...parsed } };
}

module.exports = {
  loadAnswers,
};
