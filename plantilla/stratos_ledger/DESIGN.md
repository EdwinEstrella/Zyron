# Design System Document: The Sovereign Ledger

## 1. Overview & Creative North Star
**Creative North Star: "The Architectural Authority"**

This design system moves away from the "busy" nature of traditional ERP and billing software. Instead of overwhelming the user with a sea of borders and data points, we embrace a high-end editorial approach. The system is designed to feel like a premium financial broadsheet: authoritative, spacious, and meticulously organized. 

By utilizing **Intentional Asymmetry** and **Tonal Depth**, we transform a data-dense SaaS environment into a calm, focused workspace. We don't just "show" data; we curate it through a hierarchy of layers that guide the eye to what matters most—ensuring "trust" is felt through stability and "modernity" is felt through fluidity.

---

## 2. Colors: Tonal Depth & Soul
Our palette is rooted in `primary (#002547)`—a deep, commanding navy. We avoid the "flat" look by using a range of blues and architectural neutrals to create a sense of environment.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined solely through background color shifts or tonal transitions.
- Use `surface_container_low (#edf4ff)` sections sitting on a `surface (#f7f9ff)` background to define regions.
- This creates a seamless, "molded" look rather than a "caged" look.

### Surface Hierarchy & Nesting
Treat the UI as stacked sheets of fine, semi-translucent material.
- **Base Level:** `surface` (#f7f9ff)
- **Primary Content Areas:** `surface_container_low` (#edf4ff)
- **Active Interactive Cards:** `surface_container_lowest` (#ffffff) to provide "pop" against the background.
- **Overlays/Modals:** `surface_container_highest` (#cee5ff).

### The "Glass & Gradient" Rule
To add visual "soul" to the ERP experience:
- **CTAs & Hero States:** Use subtle linear gradients from `primary` (#002547) to `primary_container` (#1b3b5f). 
- **Floating Elements:** Use Glassmorphism for sidebars or persistent summary panels. Apply `surface_container_lowest` at 80% opacity with a `20px` backdrop-blur. This softens the interface and prevents data fatigue by maintaining a sense of depth.

---

### 3. Typography: Editorial Precision
We utilize **Inter** for its mathematical precision and exceptional legibility in dense tables.

*   **Display (Display-LG/MD):** Used for high-level financial summaries. Tracking should be tightened (-0.02em) to feel sophisticated.
*   **Headlines (Headline-SM):** The "Anchors." Use `primary` (#002547) for all headlines to maintain an authoritative tone.
*   **Body (Body-MD):** The workhorse. Optimized at `0.875rem` for data density without sacrificing readability.
*   **Labels (Label-SM):** Used for table headers and metadata. Always uppercase with +0.05em letter-spacing to distinguish from interactive text.

---

## 4. Elevation & Depth: Tonal Layering
Hierarchy is achieved through "Tonal Layering" rather than structural lines.

*   **The Layering Principle:** Depth is "stacked." Place a `surface_container_lowest` card on top of a `surface_container_low` section. The change in hex value provides all the separation needed.
*   **Ambient Shadows:** For floating elements (like dropdowns or modals), use a highly diffused shadow: `box-shadow: 0 12px 40px rgba(0, 29, 50, 0.06);`. The shadow color is derived from `on_surface` to mimic natural light.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline_variant` (#c3c6cf) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### High-Quality Data Tables
*   **Rows:** Forbid the use of horizontal divider lines. Use alternating row colors (`surface` and `surface_container_low`) or simply generous vertical padding (`16px`) to separate data.
*   **Headers:** Use `Label-MD` in `primary` text. Use a subtle `surface_dim` (#c1ddfb) background for the header row to anchor the data.

### Metric Cards
*   **Visual Style:** Cards must be `surface_container_lowest` (#ffffff).
*   **Asymmetry:** Place the primary metric (e.g., Total Revenue) in a large `display-sm` font, offset to the left, with the "trend" indicator (using `on_tertiary_container` for success) tucked into the top right. This breaks the standard centered-box look.

### Sophisticated Form Elements
*   **Inputs:** No heavy borders. Use a `surface_container` (#e3efff) fill with a bottom-only `outline` (#73777f) at 20% opacity.
*   **Focus State:** Transition the bottom border to `primary` (#002547) with a thickness of 2px.

### Status Badges
*   **Design:** Use "Soft-Pill" styling. High-saturation text on a low-saturation background.
    *   *Success:* `tertiary_fixed_dim` (#84d5c5) background with `on_tertiary_fixed_variant` (#005046) text.
    *   *Warning:* `on_primary_container` background with `on_primary_fixed` text.

### Buttons
*   **Primary:** Gradient of `primary` to `primary_container`. `0.375rem` (md) corner radius.
*   **Secondary:** No background. `primary` text with a "Ghost Border" only on hover.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use whitespace as a functional tool. If the data feels crowded, increase the padding of the container rather than adding a line.
*   **Do** use `on_surface_variant` (#43474e) for secondary text to create a clear visual hierarchy against primary headers.
*   **Do** utilize `full` (9999px) roundedness for chips and badges to contrast against the `md` (0.375rem) roundedness of containers.

### Don't:
*   **Don't** use pure black (#000000) for text. Use `on_surface` (#001d32) to maintain the "Navy" soul of the system.
*   **Don't** use standard 1px grey dividers between list items. Use an `8px` gap and background color shifts.
*   **Don't** over-shadow. If three elements are on the same page, only the "Highest" element (the action-oriented one) should have an ambient shadow.