const fs = require("fs");
const path = require("path");

const DEFAULT_ANSWERS = {
  how_did_you_hear: "",
  previously_employed_by_company: "",
  comfortable_with_hybrid_or_relocation: "",
  relocation_assistance: "",
  related_to_company_employee: "",
  personal_pronouns: "",
  sexual_orientation: "",
  hispanic_latinx: "",
  certify_truthful_application: "",
  demographic_data_consent: "",
  retention_consent: "",
  desired_total_compensation: "",
  recruitment_privacy_policy_acknowledgement: "",
  prohibited_possessor_questionnaire_acknowledgement: "",
  recently_interviewed_with_company: "",
  work_authorization_any_us_employer_now_future: "",
  identity_and_work_authorization_verification: "",
  age_18_or_older: "",
  deemed_export_license_eligible: "",
  conflicting_obligations: "",
  fugitive_from_justice: "",
  unlawfully_in_united_states: "",
  unlawful_controlled_substance_user: "",
  firearms_questionnaire_acknowledgement: "",
  adjudicated_mental_defective_or_committed: "",
  dishonorable_military_discharge: "",
  renounced_us_citizenship: "",
  onsite_seattle_four_days: "",
  educationAliases: {},
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
