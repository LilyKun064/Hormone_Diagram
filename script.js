// script.js
console.log("Hormone Teaching App script loaded");

/* ----------------------------------------------------------
   1. SVG node mapping – match <g id="..."> in the SVG
   ---------------------------------------------------------- */

const NODE_IDS = {
  // Genotype / master switches
  XX: "xx",
  XY: "xy",
  SRY: "sry_gene",
  NO_SRY: "no_sry_gene",

  // Gonads
  OVARIES: "ovaries",
  TESTES: "testes",

  // Ovarian side
  THECAL: "thecal",
  GRANULOSA: "granulo",
  ESTROGEN: "estrogen",
  PROGESTERONE: "progesterone",
  INHIBIN_F: "inhibin",

  // Testicular side
  SERTOLI: "sertoli",
  LEYDIG: "leydig",
  INHIBIN_M: "inhibin_2",
  MIH: "mih",
  TESTOSTERONE: "testosterone",
  DHT: "dht",
  FIVE_AR: "5_alpha_red",

  // Ducts / tracts
  WOLFFIAN: "wolffian_duct",
  MALE_TRACT: "male_reproductiv",
  MULLERIAN_SUPPRESS: "suppress_mullerian_d",
  NO_FEMALE_TRACT: "no_female_reproducti",
  MALE_EXTERNAL: "male_external_g",

  // Adrenal bits (for CAH)
  CRH: "crh",
  ACTH: "acth",
  CORTISOL: "cortisol",
  DHEA: "dhea",
};

const EDGE_IDS = {
  // put arrow ids here if needed
};

let svgDoc = null;
const SVG_NS = "http://www.w3.org/2000/svg";

/* ----------------------------------------------------------
   2. Helpers to work with the embedded SVG
   ---------------------------------------------------------- */

function setSvgDocFromObject() {
  const obj = document.getElementById("hormone-diagram");
  if (!obj) {
    console.warn("[HormoneApp] No #hormone-diagram <object> found in HTML.");
    return;
  }

  console.log(
    "[HormoneApp] Found <object id='hormone-diagram'>, attaching load listener."
  );

  obj.addEventListener("load", () => {
    console.log("[HormoneApp] <object> load event fired.");
    svgDoc = obj.getSVGDocument
      ? obj.getSVGDocument()
      : obj.contentDocument || null;

    if (!svgDoc) {
      console.error(
        "[HormoneApp] Could not access SVG document (svgDoc is null). " +
          "This is usually a browser security / local-file issue."
      );
      return;
    }

    console.log("[HormoneApp] SVG document obtained:", svgDoc);

    injectSvgStyles();

    const select = document.getElementById("disorder-select");
    if (select) {
      console.log(
        "[HormoneApp] Re-applying current disorder after SVG ready:",
        select.value
      );
      applyDisorder(select.value || "NONE");
    }
  });

  // In case it's already loaded (e.g. cached)
  if (obj.getSVGDocument && obj.getSVGDocument()) {
    console.log("[HormoneApp] SVG already loaded, using getSVGDocument()");
    svgDoc = obj.getSVGDocument();
    injectSvgStyles();
  } else if (obj.contentDocument) {
    console.log("[HormoneApp] SVG already loaded, using contentDocument");
    svgDoc = obj.contentDocument;
    injectSvgStyles();
  }
}

function injectSvgStyles() {
  if (!svgDoc) {
    console.warn("[HormoneApp] injectSvgStyles called but svgDoc is null.");
    return;
  }

  const svgRoot = svgDoc.documentElement;
  if (!svgRoot) {
    console.warn("[HormoneApp] SVG document has no documentElement.");
    return;
  }

  if (svgDoc.getElementById("hormone-style-block")) {
    console.log("[HormoneApp] Style block already injected.");
    return;
  }

  const styleEl = svgDoc.createElementNS(SVG_NS, "style");
  styleEl.setAttribute("id", "hormone-style-block");
  styleEl.textContent = `
    /* BLOCKED = almost gone / greyed out on the original element */
    .blocked {
      opacity: 0.08;
      filter: grayscale(1);
    }

    /* Overlays live in their own <g> layer and do NOT change original boxes */

    .highlight-overlay {
      fill: #ffb0fae9;
      fill-opacity: 0.6;
      stroke: #ff00f2ff;
      stroke-width: 3;
      rx: 4;
      ry: 4;
      pointer-events: none; /* clicks pass through to the box below */
    }

    .upregulated-overlay {
      fill: #ede0ffff;
      fill-opacity: 0.6;
      stroke: #582fd3ff;
      stroke-width: 3;
      rx: 4;
      ry: 4;
      pointer-events: none;
    }
  `;
  svgRoot.appendChild(styleEl);
  console.log("[HormoneApp] Injected CSS into SVG.");
}

// Look up an element *inside* the SVG document
function getEl(id) {
  if (!svgDoc) {
    console.warn("[HormoneApp] getEl called while svgDoc is null.");
    return null;
  }
  if (!id) return null;
  const el = svgDoc.getElementById(id);
  if (!el) {
    console.warn("[HormoneApp] No SVG element with id:", id);
  }
  return el;
}

function addClass(id, cls) {
  const el = getEl(id);
  if (el) {
    el.classList.add(cls);
    console.log("[HormoneApp] Added class", cls, "to", id);
  }
}

function removeClass(id, cls) {
  const el = getEl(id);
  if (el) {
    el.classList.remove(cls);
  }
}

/* ----------------------------------------------------------
   2a. Overlay helpers (highlight & upregulation)
   ---------------------------------------------------------- */

/** Ensure we have a top overlay layer <g> for highlights/upregulation */
function getOverlayLayer() {
  if (!svgDoc) return null;
  let layer = svgDoc.getElementById("effect-overlays");
  if (!layer) {
    layer = svgDoc.createElementNS(SVG_NS, "g");
    layer.setAttribute("id", "effect-overlays");
    svgDoc.documentElement.appendChild(layer);
  }
  return layer;
}

/** Remove any existing overlays for a given target element */
function removeOverlaysForTarget(targetEl) {
  if (!svgDoc || !targetEl || !targetEl.id) return;
  const layer = getOverlayLayer();
  if (!layer) return;
  const selector = `rect[data-target="${targetEl.id}"]`;
  layer.querySelectorAll(selector).forEach((r) => r.remove());
}

/**
 * Create a rounded-rect overlay on top of `targetEl`.
 * `mode` is "highlight" or "upregulated".
 */
function addOverlayForElement(targetEl, mode) {
  if (!svgDoc || !targetEl) return;
  const layer = getOverlayLayer();
  if (!layer) return;

  // Try to find the "box" shape inside the group
  const shape =
    targetEl.querySelector("rect, path, polygon, ellipse") || targetEl;

  const bbox = shape.getBBox();
  const padding = 3; // tight outline around the object

  // Remove existing overlay for this element (if any)
  removeOverlaysForTarget(targetEl);

  const rect = svgDoc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", bbox.x - padding);
  rect.setAttribute("y", bbox.y - padding);
  rect.setAttribute("width", bbox.width + padding * 2);
  rect.setAttribute("height", bbox.height + padding * 2);
  rect.setAttribute("data-target", targetEl.id || "");

  if (mode === "upregulated") {
    rect.setAttribute("class", "upregulated-overlay");
  } else {
    rect.setAttribute("class", "highlight-overlay");
  }

  layer.appendChild(rect);
}

/** Clear all overlays (e.g., when switching disorders) */
function clearAllOverlays() {
  if (!svgDoc) return;
  const layer = getOverlayLayer();
  if (!layer) return;
  while (layer.firstChild) {
    layer.removeChild(layer.firstChild);
  }
}

/* ----------------------------------------------------------
   2b. Clear all visual effects
   ---------------------------------------------------------- */

function clearClassesOnAllNodes() {
  if (!svgDoc) {
    console.warn(
      "[HormoneApp] clearClassesOnAllNodes called but svgDoc is null."
    );
    return;
  }

  const allIds = new Set([
    ...Object.values(NODE_IDS),
    ...Object.values(EDGE_IDS),
  ]);
  allIds.forEach((id) => {
    const el = getEl(id);
    if (!el) return;
    el.classList.remove("blocked"); // only class we still use
  });

  clearAllOverlays();
  console.log("[HormoneApp] Cleared classes and overlays from all known nodes.");
}

/**
 * effect = { type: "block" | "up" | "highlight", ids: [...] }
 * "block" → .blocked on original node
 * "up" / "highlight" → overlay rectangles above the original node
 */
function applyEffect(effect) {
  if (!effect || !effect.ids) return;

  if (effect.type === "block") {
    effect.ids.forEach((keyOrId) => {
      const svgId = NODE_IDS[keyOrId] || EDGE_IDS[keyOrId] || keyOrId;
      addClass(svgId, "blocked");
    });
  } else {
    const mode = effect.type === "up" ? "upregulated" : "highlight";
    effect.ids.forEach((keyOrId) => {
      const svgId = NODE_IDS[keyOrId] || EDGE_IDS[keyOrId] || keyOrId;
      const el = getEl(svgId);
      if (el) {
        addOverlayForElement(el, mode);
      }
    });
  }
}

/* ----------------------------------------------------------
   3. Disorder definitions (biology → visual effects)
   ---------------------------------------------------------- */

const DISORDERS = {
  NONE: {
    label: "Normal development",
    description: "Baseline XX / XY development with no disorder selected.",
    effects: [],
  },

  FIVE_ALPHA_DEF: {
    label: "5-alpha reductase deficiency",
    description:
      "XY with normal testes and Wolffian ducts. 5-alpha reductase is missing, " +
      "so testosterone cannot be converted to DHT. Internal male tract is present, " +
      "but male <strong>external genitalia are under-masculinized or female</strong>.",
    effects: [
      { type: "block", ids: ["FIVE_AR"] },
      { type: "block", ids: ["DHT", "MALE_EXTERNAL"] },
      { type: "highlight", ids: ["TESTOSTERONE", "WOLFFIAN", "MALE_TRACT"] },
      { type: "highlight", ids: ["TESTES", "LEYDIG"] },
    ],
  },

  AIS: {
    label: "Androgen insensitivity syndrome (AIS)",
    description:
      "XY individual with testes producing testosterone and DHT, but androgen receptors " +
      "are nonfunctional. MIH still suppresses Müllerian ducts (no female internal tract). " +
      "Wolffian ducts and male external genitalia fail to develop: <strong>phenotypic female with " +
      "no internal reproductive tract.</strong>",
    effects: [
      { type: "highlight", ids: ["TESTES", "LEYDIG", "TESTOSTERONE", "DHT"] },
      { type: "block", ids: ["WOLFFIAN", "MALE_TRACT", "MALE_EXTERNAL"] },
      {
        type: "highlight",
        ids: ["SERTOLI", "MIH", "MULLERIAN_SUPPRESS", "NO_FEMALE_TRACT"],
      },
    ],
  },

  CAH: {
    label: "Congenital adrenal hyperplasia (CAH, 21-hydroxylase deficiency)",
    description:
      "Defective cortisol synthesis: low cortisol, high CRH and ACTH, and excess adrenal DHEA (androgens). " +
      "In XX individuals, this leads to virilization and <strong>masculinized external genitalia</strong> " +
      "while internal female structures remain.",
    effects: [
      { type: "block", ids: ["CORTISOL"] },
      { type: "up", ids: ["CRH", "ACTH", "DHEA"] },
      { type: "highlight", ids: ["XX", "OVARIES"] },
    ],
  },

  XX_SRY_TRANSLOCATION: {
    label: "XX with SRY translocation (46,XX testicular DSD)",
    description:
      "Genotypic XX but SRY is present (translocated), so testes develop instead of ovaries. " +
      "MIH and testosterone are produced → male internal and external reproductive tracts. " +
      "No ovaries or female internal tract. <strong>Complete male phenotype</strong>. ",
    effects: [
      {
        type: "block",
        ids: [
          "OVARIES",
          "THECAL",
          "GRANULOSA",
          "ESTROGEN",
          "PROGESTERONE",
          "INHIBIN_F",
        ],
      },
      { type: "highlight", ids: ["XX", "SRY", "TESTES", "SERTOLI", "LEYDIG"] },
      {
        type: "highlight",
        ids: ["MIH", "MULLERIAN_SUPPRESS", "NO_FEMALE_TRACT"],
      },
      {
        type: "highlight",
        ids: ["TESTOSTERONE", "DHT", "WOLFFIAN", "MALE_TRACT", "MALE_EXTERNAL"],
      },
    ],
  },

  XY_NO_SRY: {
    label: "XY with SRY mutation/deletion",
    description:
      "Genotypic XY but SRY is absent or nonfunctional. Testes fail to form, so there is no MIH and no testosterone. " +
      "Müllerian ducts persist (female internal tract), and external genitalia are female. <strong>Complete female phenotype</strong>.",
    effects: [
      // SRY pathway and testicular hormones offline
      { type: "block", ids: ["SRY", "TESTES", "SERTOLI", "LEYDIG"] },
      {
        type: "block",
        ids: [
          "MIH",
          "TESTOSTERONE",
          "DHT",
          "WOLFFIAN",
          "MALE_TRACT",
          "MALE_EXTERNAL",
        ],
      },
      // Explicitly grey out the "Suppress Müllerian duct development" & "No female reproductive tract" path
      {
        type: "block",
        ids: ["MULLERIAN_SUPPRESS", "NO_FEMALE_TRACT"],
      },
      // Highlight genotype + NO_SRY + ovaries/female development
      { type: "highlight", ids: ["XY", "NO_SRY", "OVARIES"] },
    ],
  },

  HERMAPHRODITISM: {
    label: "Hermaphroditism (true gonadal, ovotestis)",
    description:
      "Both ovarian and testicular tissue are present (ovotestis or one ovary and one testis). " +
      "Estrogen and testosterone may both be produced, leading to <strong>mixed or ambiguous internal </strong>" +
      "<strong>and external genitalia, or both presents</strong>.",
    effects: [
      {
        type: "highlight",
        ids: [
          "OVARIES",
          "TESTES",
          "THECAL",
          "GRANULOSA",
          "SERTOLI",
          "LEYDIG",
        ],
      },
      {
        type: "highlight",
        ids: ["ESTROGEN", "PROGESTERONE", "TESTOSTERONE", "DHT"],
      },
    ],
  },

  // Trisomes as one conceptual category
  XXY: {
    label: "Trisomes (XXY/XYY)",
    description:
      "XXY: small testes, sterile, breast<br>" +
      "XYY: extremely tall<br>" +
      "Both low IQ",
    effects: [],
  },

  XYY: {
    label: "Trisomes (XXY/XYY)",
    description:
      "XXY: small testes, sterile, breast<br>" +
      "XYY: extremely tall<br>" +
      "Both low IQ",
    effects: [],
  },
};

/* ----------------------------------------------------------
   4. Apply a disorder to the SVG + info panel
   ---------------------------------------------------------- */

function applyDisorder(disorderKey) {
  const cfg = DISORDERS[disorderKey] || DISORDERS.NONE;
  console.log("[HormoneApp] applyDisorder:", disorderKey);

  // Update info box text (works even before SVG is ready)
  const infoBox = document.getElementById("disorder-info");
  if (infoBox) {
    infoBox.innerHTML = "";

    const title = document.createElement("h3");
    title.className = "disorder-name";
    title.textContent = cfg.label;

    const desc = document.createElement("p");
    desc.className = "disorder-description";
    desc.style.margin = "0";
    desc.style.fontSize = "0.95rem";
    desc.style.lineHeight = "1.4";
    // allow <strong> etc. and keep line breaks
    desc.innerHTML = (cfg.description || "").replace(/\n/g, "<br>");

    infoBox.appendChild(title);
    infoBox.appendChild(desc);
  }

  // Only touch SVG if we already have it
  if (!svgDoc) {
    console.warn(
      "[HormoneApp] applyDisorder called but svgDoc is null; diagram not updated yet."
    );
    return;
  }

  clearClassesOnAllNodes();
  (cfg.effects || []).forEach((effect) => applyEffect(effect));
}

// Expose for debugging
window.applyDisorder = applyDisorder;

/* ----------------------------------------------------------
   5. Page wiring
   ---------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  console.log("[HormoneApp] DOMContentLoaded");

  const select = document.getElementById("disorder-select");
  if (!select) {
    console.warn("No #disorder-select element found.");
  } else {
    select.addEventListener("change", (e) => {
      const value = e.target && e.target.value ? e.target.value : select.value;
      applyDisorder(value);
    });
    // Initial text state
    applyDisorder(select.value || "NONE");
  }

  // Initialize connection to the embedded SVG
  setSvgDocFromObject();
});
