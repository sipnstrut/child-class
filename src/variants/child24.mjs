// Child '24 — stub. See § 13 step 12.
// Only `rules` and `graduationClassFilter` diverge trivially at this stage;
// the full '24 Knack table (§ 5.4) lands in the step-12 checkpoint. If wiring
// up child24 requires touching anything outside this file plus the compendium
// build, the axis separation has failed.

export default {
  id: "child24",
  label: "CHILDCLASS.Variant.Child24",
  displayName: "Child '24",
  extends: "child14",
  rules: "2024",
  graduationClassFilter: "2024"
  // knackTable: TODO in step 12
};
