# Seamless Architecture: The Component-Aware Model

## The Fundamental Problem
The current bot architecture suffers from **Information Loss** between the Extraction and Filling phases. 

1. **Extraction** identifies a field (e.g., a Radio Group) but only saves its *label* and *text options*. 
2. **Filling** receives the label and answer, then performs a **second search** of the DOM to find a clickable element that matches the text.

This "second search" is the root cause of failures. It relies on brittle heuristics (tags like `input` or `label`) that fail when sites use custom-styled components (like Ashby's `div`-based buttons).

---

## The Root Cause Solution: Actionable Targets

We must shift from "Text-Matching Filling" to "Direct Execution Filling."

### 1. Pointer-Based Extraction
During the **Extraction** phase, the adapter has full access to the DOM. Instead of just extracting strings, it must identify the **exact element** that is interactive.

*   **Mechanism:** For every choice (radio, checkbox, dropdown option), the extractor identifies the element that actually listens for clicks.
*   **Identification:** If no stable ID exists, the extractor injects a temporary `data-gemini-target` attribute into the DOM element.

### 2. Rich Schema Metadata
The `form-schema.json` must change from a flat list to a structured map of options to selectors.

**Current (Brittle):**
```json
{
  "label": "Years of experience",
  "options": ["1-4", "5-9", "10+"]
}
```

**Seamless (Robust):**
```json
{
  "label": "Years of experience",
  "type": "radio-group",
  "choices": [
    { "label": "1-4", "target": "[data-gemini-target='uuid-1']" },
    { "label": "5-9", "target": "[data-gemini-target='uuid-2']" }
  ]
}
```

### 3. Mechanical Filling
The Filling phase should have **zero intelligence**. It should not know about "Yes/No" or "Years of Experience." It should simply:
1.  Receive a `target` selector from the Answer Plan.
2.  Perform a `click({ force: true })`.
3.  Verify the state change (e.g., `aria-checked` or `checked` property).

---

## Implementation Gaps to Close

### Gap 1: The Extractor Logic
The Ashby and Greenhouse extractors must be updated to find the "Click Target."
*   **Strategy:** Find the label text, then look for the nearest ancestor `button`, `role='radio'`, or `input`. If none found, the `label` itself is the target.

### Gap 2: The Answer Plan Resolver
`lib/answerPlan.js` must map the profile value to the *label* of the choice, and then pass the *selector* of that choice to the filler.

### Gap 3: Verification Loop
The `fill` function must include a mandatory verification step:
*   Did the value persist?
*   Is the radio visually selected?
*   If not, the fill is marked as `failed` immediately.

---

## The End Goal
A "Seamless" run means the bot **never guesses** where to click during the filling phase. It only executes decisions made during the high-context extraction phase.
